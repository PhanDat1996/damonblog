---
title: "strace, lsof and ss: Debug a Misbehaving Process"
date: "2024-05-02"
updated: "2026-10-28"
excerpt: "Logs are quiet but a process hangs, leaks connections or fills the disk. Combine strace, lsof and ss to see what it's doing, holding and waiting on."
tags: ["debugging", "linux", "troubleshooting", "production"]
featured: false
category: "linux"
---

The process isn't crashing. It's just wrong: requests hang, database connections keep climbing, or `df` says the disk is full while `du` disagrees. The logs are quiet, and you can't attach a debugger in production.

Three standard tools answer most of these from the outside, each from a different angle:

| Tool | Answers | Cost to run |
|---|---|---|
| `lsof` | What does the process have **open** right now? Files, sockets, pipes, deleted files. | Cheap snapshot |
| `ss` | What state are its **network connections** in? Queues, timers, retransmits. | Cheap snapshot |
| `strace` | What is it **doing** right now, call by call? | Slows the process while attached |

The order matters: start with the cheap snapshots, and attach `strace` only when you know what to look for. For strace on its own in depth, see the [strace tutorial](/blog/strace-tutorial-linux).

---

## The 30-second toolkit

```bash
PID=$(pgrep -o -x myapp)

# lsof: -n no DNS, -P no port names (both make it much faster), -a = AND the filters
sudo lsof -nP -p $PID | head -30
sudo lsof -nP -a -p $PID -i              # only this process's network files
sudo lsof -nP -i :5432                   # anything using port 5432, local or remote side
sudo lsof -nP +L1                        # deleted files still held open

# ss
ss -tanp | grep "pid=$PID,"              # all TCP sockets of the process, with state
ss -ltn                                  # listening sockets and their queues
ss -tn state close-wait                  # connections the app forgot to close
ss -s                                    # totals per state

# strace
sudo strace -f -tt -T -yy -p $PID -o /tmp/trace.txt
```

The `-a` in lsof is the one people miss. lsof **ORs** its selection options by default, so `lsof -p 4521 -i` lists everything open by 4521 **plus** every network socket on the whole system. Add `-a` to require both.

---

## Reading lsof

```bash
sudo lsof -nP -p 4521
```

```
COMMAND  PID USER   FD   TYPE  DEVICE SIZE/OFF    NODE NAME
myapp   4521 app   cwd    DIR   253,0     4096  131074 /opt/myapp
myapp   4521 app   txt    REG   253,0 18234112  131090 /opt/myapp/bin/myapp
myapp   4521 app   mem    REG   253,0  2216304  1835071 /usr/lib/x86_64-linux-gnu/libc.so.6
myapp   4521 app     3w   REG   253,1 52428800   65538 /var/log/myapp/app.log
myapp   4521 app     7u  IPv4  883412      0t0     TCP 10.0.1.5:51234->10.0.2.15:5432 (ESTABLISHED)
myapp   4521 app     9u  IPv4  883420      0t0     TCP *:8080 (LISTEN)
myapp   4521 app    12w   REG   253,1 9876543210  65601 /var/log/myapp/debug.log (deleted)
```

- **FD**: `cwd` (working directory), `txt` (the executable), `mem` (memory-mapped files, mostly libraries) aren't file descriptors. Numbers are real FDs, with a mode: `r` read, `w` write, `u` both.
- **TYPE**: `REG` file, `DIR` directory, `IPv4`/`IPv6` network socket, `unix` local socket, `FIFO` pipe.
- **NAME**: path, or the connection with its TCP state.

Because of the `cwd`/`txt`/`mem` lines, `lsof -p PID | wc -l` overstates the FD count. For leak hunting, count `/proc/PID/fd` instead. [Too many open files](/blog/too-many-open-files-linux-fix) covers that in detail.

---

## Reading ss

```bash
ss -tanp | grep "pid=4521,"
```

```
State      Recv-Q Send-Q  Local Address:Port   Peer Address:Port  Process
LISTEN     0      4096         0.0.0.0:8080         0.0.0.0:*      users:(("myapp",pid=4521,fd=9))
ESTAB      0      0           10.0.1.5:51234      10.0.2.15:5432   users:(("myapp",pid=4521,fd=7))
CLOSE-WAIT 1      0           10.0.1.5:51240      10.0.2.15:5432   users:(("myapp",pid=4521,fd=15))
```

(The trailing comma in `pid=4521,` stops it from also matching PID 45210.)

`Recv-Q` and `Send-Q` mean different things depending on the state:

| State | Recv-Q | Send-Q |
|---|---|---|
| `LISTEN` | Connections waiting in the accept queue | Size of the accept queue (backlog) |
| Established and others | Bytes received but **not yet read** by the application | Bytes sent but **not yet acknowledged** by the peer |

That makes `ss` a quick blame tool:

- **Recv-Q growing on an established socket:** data has arrived and your app isn't reading it. The app is busy or stuck.
- **Send-Q growing:** the peer (or the network) isn't keeping up.
- **LISTEN Recv-Q at or near Send-Q:** the accept queue is full and new connections are being dropped. The app isn't calling `accept()` fast enough.

Filters, so you don't need grep:

```bash
ss -tn state established '( dport = :5432 )'      # established connections to Postgres
ss -tn state time-wait | wc -l                     # TIME-WAIT count (includes 1 header line)
ss -tnoi '( dport = :443 )'                        # -o timers, -i rtt/retransmits/cwnd
```

---

## Symptom 1: connections keep climbing

Monitoring shows the app's connections to the database rising all day until the DB refuses new clients.

```bash
PID=$(pgrep -o -x myapp)

# 1. How many, and in what state?
ss -Htanp | grep "pid=$PID," | awk '{print $1}' | sort | uniq -c
#    187 CLOSE-WAIT
#     20 ESTAB
#      1 LISTEN

# 2. To where?
ss -Htn state close-wait | awk '{print $4}' | sort | uniq -c | sort -rn | head
#    187 10.0.2.15:5432
```

(`-H` drops the header line; it needs a reasonably recent iproute2.)

**CLOSE-WAIT** means the remote side closed the connection, the kernel told your application, and your application never called `close()`. The kernel can't clean these up on its own. It's always an application bug, typically a connection that isn't returned to the pool on an error path, or an HTTP client response that's never closed.

If they're instead `ESTAB` and the count grows without limit, the pool is leaking live connections, or it's just sized too large for the number of instances (pool size × instances > the DB's connection limit).

To confirm, watch the app's network calls for a minute:

```bash
sudo timeout 60 strace -f -tt -yy -e trace=connect,close,shutdown -p $PID -o /tmp/conn.txt
grep -c "connect(" /tmp/conn.txt; grep -c "close(" /tmp/conn.txt
```

Many `connect` calls to 5432 and no matching `close` on those FDs confirms the leak, and the timestamps tell you which requests triggered them.

---

## Symptom 2: disk full, but `du` can't find the space

```bash
df -h /var        # 100% used
du -sh /var/*     # adds up to far less
```

A file that's deleted while a process still has it open keeps using space until that process closes it. `du` can't see it (it has no name anymore), `df` can.

```bash
sudo lsof -nP +L1
```

```
COMMAND  PID USER FD TYPE DEVICE   SIZE/OFF NLINK  NODE NAME
myapp   4521 app  12w REG  253,1 9876543210     0 65601 /var/log/myapp/debug.log (deleted)
```

Someone ran `rm` on a 9.8 GB log the app was still writing. Options:

- **Restart the service** (cleanest): the FD closes and the space returns.
- **Can't restart now?** Truncate it through the process's FD:

```bash
sudo truncate -s 0 /proc/4521/fd/12
```

That irreversibly discards the contents, so only do it for data you don't need. Next time, truncate instead of deleting a live log (`truncate -s 0 file`), or fix log rotation. See [disk full cleanup](/blog/disk-full-linux-cleanup) and [deleting large files safely](/blog/how-to-delete-large-files-linux-safely).

---

## Symptom 3: requests hang, the process looks idle

CPU is low, the app isn't logging, and requests time out.

```bash
# 1. What is it blocked on?
sudo strace -f -tt -T -yy -p $PID 2>&1 | head -20
```

```
[pid  4533] read(7<TCP:[10.0.1.5:51234->10.0.2.15:5432]>,
[pid  4534] read(7<TCP:[10.0.1.5:51234->10.0.2.15:5432]>,
[pid  4521] epoll_wait(4<anon_inode:[eventpoll]>, [], 1024, 1000) = 0 <1.001042>
```

Worker threads are all stuck in `read` on FD 7, a connection to the database. (Without `-yy`, `lsof -nP -a -p $PID -d 7` gives the same answer.)

```bash
# 2. What does that connection look like?
ss -tnoi '( sport = :51234 )'
```

```
ESTAB 0 0 10.0.1.5:51234 10.0.2.15:5432 timer:(keepalive,1min52s,0)
	 cubic rtt:0.412/0.1 ... bytes_acked:5112 bytes_received:18233 ...
```

`Recv-Q 0`, `Send-Q 0`: the query was delivered and acknowledged, and nothing has come back. The database is still working on it, or is waiting on a lock. The problem has moved to the DB server: look at its active queries and locks there. The app's lack of a query timeout is the second bug.

If instead `Send-Q` were large and `retrans` climbing in `ss -i`, the network path or the peer would be the problem.

---

## Symptom 4: slow under load, no errors

```bash
ss -ltn 'sport = :8080'
# State  Recv-Q Send-Q Local Address:Port Peer Address:Port
# LISTEN 4097   4096         0.0.0.0:8080      0.0.0.0:*

nstat -az TcpExtListenOverflows TcpExtListenDrops
```

The accept queue is full (Recv-Q at the backlog) and the overflow counters are rising: clients' connection attempts are dropped and retried, which shows up as seconds of extra latency. The app isn't accepting fast enough, because its workers are all busy. `strace -c -w -f -p $PID` for 20 seconds shows where their time goes. Raising the backlog (`listen()` argument, capped by `net.core.somaxconn`) only buys headroom; the fix is worker capacity or whatever the workers are waiting on.

---

## Symptom 5: who has this file or port?

```bash
sudo lsof -nP /var/lib/myapp/data.db             # which processes have this file open
sudo lsof -nP +D /mnt/backup                     # anything open under a directory (why umount says busy)
ss -ltnp 'sport = :8080'                         # who listens on 8080
sudo fuser -v 8080/tcp                           # alternative for ports
```

`+D` walks the whole directory tree, which is slow on large trees. For "port already in use" errors, see [port already in use](/blog/port-already-in-use-linux-fix).

---

## Which tool for which question

```
Process misbehaving, logs quiet
│
├─ What does it hold?         lsof -nP -p PID        (files, sockets, deleted files)
│     too many FDs?           ls /proc/PID/fd | wc -l
│
├─ Network trouble?           ss -tanp | grep pid=PID,
│     CLOSE-WAIT piling up    → app never closes: code bug
│     Recv-Q growing          → app not reading: app busy/stuck
│     Send-Q growing          → peer/network slow
│     LISTEN queue full       → app not accepting fast enough
│
└─ What is it doing / waiting on?
      strace -f -tt -T -yy -p PID   (short, to a file)
      the call that doesn't return + its FD → back to lsof/ss for that FD
```

---

## FAQ

**Do lsof and ss affect the running process?**
No. They read kernel state from `/proc` and netlink without stopping the process. lsof can be slow on hosts with many open files or hung NFS mounts (`-b` avoids blocking calls), but it doesn't slow the target. strace does.

**Why does `lsof -p PID -i` show other processes?**
lsof combines selection options with OR. Use `lsof -a -p PID -i` to get the intersection.

**Can I use these inside containers?**
`lsof` and `ss` inside a container see only that container's processes and network namespace. From the host, enter its network namespace: `sudo nsenter -t $(docker inspect -f '{{.State.Pid}}' web) -n ss -tanp`. strace inside a container needs `SYS_PTRACE`, so it's usually easier to run it on the host against the container's host PID.

**ss or netstat?**
`ss`. It talks to the kernel over netlink, is faster on busy hosts, and has state filters and TCP internals (`-i`). `netstat` comes from the deprecated net-tools package. See [netstat vs ss](/blog/netstat-vs-ss-command).

---

*Related: [Linux TIME_WAIT explained](/blog/linux-time-wait-explained) when the sockets piling up are TIME-WAIT rather than CLOSE-WAIT, and [Linux debugging tools](/blog/linux-debugging-tools-guide) for the wider toolkit.*
