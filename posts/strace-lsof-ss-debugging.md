---
title: "strace, lsof and ss: Debug a Misbehaving Process"
date: "2024-05-02"
updated: "2026-11-01"
excerpt: "Logs are quiet but a process hangs, leaks connections or fills the disk. Combine strace, lsof and ss to see what it's doing, holding and waiting on."
tags: ["debugging", "linux", "troubleshooting", "production"]
featured: false
lab: true
category: "linux"
---

The process isn't crashing. It's just wrong: requests hang, database connections keep climbing, or `df` says the disk is full while `du` disagrees. The logs are quiet, and you can't attach a debugger in production.

Three standard tools answer most of these from the outside, each from a different angle. Every symptom below was reproduced in a lab with a small Python "app", so all the output is real.

> **Lab environment:** Ubuntu 24.04 container on a Colima VM: kernel `6.8.0-117-generic` (aarch64), 8 vCPU, 15 GiB RAM. `strace 6.8`, `lsof 4.95.0`, `ss` from iproute2 6.1.0, Python 3.12.3. The container ran privileged (for tmpfs mounts) with its own network namespace, so commands ran as root. On a normal host, prefix them with `sudo` as shown. The "app" is a copy of the Python binary named `myapp`, so `pgrep -x myapp` works the way it would for a real service.

| Tool | Answers | Cost to run |
|---|---|---|
| `lsof` | What does the process have **open** right now? Files, sockets, pipes, deleted files. | Cheap snapshot |
| `ss` | What state are its **network connections** in? Queues, timers, retransmits. | Cheap snapshot |
| `strace` | What is it **doing** right now, call by call? | Can slow a busy process by **200× or more**, even with a filter (measured below) |

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

# strace: short, to a file
sudo timeout 10 strace -f -tt -T -yy -p $PID -o /tmp/trace.txt
```

The `-a` in lsof is the one people miss. lsof **ORs** its selection options by default. With the leaking app from Symptom 1 running, here is the same query with and without `-a`, counted by command:

```
$ lsof -nP -p 2698 -i | awk '{print $1}' | sort | uniq -c
      1 COMMAND
    113 myapp
      1 python3

$ lsof -nP -a -p 2698 -i | awk '{print $1}' | sort | uniq -c
      1 COMMAND
    100 myapp
```

Without `-a` you get every file of PID 2698 (113 lines, including libraries) **plus** every network socket on the system (the `python3` line is the fake database's listener). With `-a` you get only the 100 sockets that PID 2698 has.

---

## Reading lsof

```
$ lsof -nP -p 2698 | head -12
COMMAND  PID USER   FD   TYPE   DEVICE SIZE/OFF   NODE NAME
myapp   2698 root  cwd    DIR    0,378     4096 962955 /lab
myapp   2698 root  rtd    DIR    0,378     4096 962924 /
myapp   2698 root  txt    REG    0,378  7845048 962957 /lab/bin/myapp
myapp   2698 root  mem    REG    0,378   360460 961195 /usr/lib/locale/C.utf8/LC_CTYPE
myapp   2698 root  mem    REG    0,378  1722920 960271 /usr/lib/aarch64-linux-gnu/libc.so.6
...
myapp   2698 root    0r   CHR      1,3      0t0     57 /dev/null
```

- **FD**: `cwd` (working directory), `rtd` (root directory), `txt` (the executable) and `mem` (memory-mapped files, mostly libraries) aren't file descriptors. Numbers are real FDs, with a mode: `r` read, `w` write, `u` both.
- **TYPE**: `REG` file, `DIR` directory, `CHR` character device, `IPv4`/`IPv6` network socket, `unix` local socket, `FIFO` pipe.
- **NAME**: path, or the connection with its TCP state.

Because of those non-FD lines, `lsof -p PID | wc -l` overstates the FD count. For the same process:

```
$ lsof -nP -p 2698 | wc -l
114
$ ls /proc/2698/fd | wc -l
103
```

For leak hunting, count `/proc/PID/fd`. [Too many open files](/blog/too-many-open-files-linux-fix) covers that in detail.

---

## Reading ss

```
$ ss -tanp | grep -E "State|pid=2698," | head -4
State      Recv-Q Send-Q Local Address:Port   Peer Address:Port Process
CLOSE-WAIT 0      0          127.0.0.1:54884     127.0.0.1:5432  users:(("myapp",pid=2698,fd=78))
CLOSE-WAIT 1      0          127.0.0.1:60082     127.0.0.1:5432  users:(("myapp",pid=2698,fd=9))
CLOSE-WAIT 0      0          127.0.0.1:54762     127.0.0.1:5432  users:(("myapp",pid=2698,fd=66))
```

(The trailing comma in `pid=2698,` stops it from also matching PID 26981.)

`Recv-Q` and `Send-Q` mean different things depending on the state:

| State | Recv-Q | Send-Q |
|---|---|---|
| `LISTEN` | Connections waiting in the accept queue | Size of the accept queue (backlog) |
| Established and others | Bytes received but **not yet read** by the application | Bytes sent but **not yet acknowledged** by the peer |

That makes `ss` a quick blame tool:

- **Recv-Q growing on an established socket:** data has arrived and your app isn't reading it. The app is busy or stuck.
- **Send-Q growing:** the peer (or the network) isn't keeping up.
- **LISTEN Recv-Q above Send-Q:** the accept queue is full and new connections are being dropped. The app isn't calling `accept()` fast enough (Symptom 4).

Filters, so you don't need grep:

```bash
ss -tn state established '( dport = :5432 )'      # established connections to Postgres
ss -tn state time-wait | wc -l                     # TIME-WAIT count (includes 1 header line)
ss -tnoi '( dport = :443 )'                        # -o timers, -i rtt/retransmits/cwnd
```

---

## Symptom 1: connections keep climbing

The lab app opens a database connection per request, reads the reply, and never closes the socket. The fake database answers one line and closes its side. After 20 seconds:

```
$ PID=$(pgrep -o -x myapp)

# 1. How many, and in what state?
$ ss -Htanp | grep "pid=$PID," | awk '{print $1}' | sort | uniq -c
    100 CLOSE-WAIT

# 2. To where?
$ ss -Htn state close-wait | awk '{print $4}' | sort | uniq -c | sort -rn | head
    100 127.0.0.1:5432
```

(`-H` drops the header line. With a `state` filter, `ss` also drops the State column, which is why the peer is `$4` here and not `$5`.)

**CLOSE-WAIT** means the remote side closed the connection, the kernel told your application, and your application never called `close()`. The kernel can't clean these up on its own; they stay until the process closes the FD or exits. It's always an application bug: typically a connection that isn't returned to the pool on an error path, or an HTTP client response that's never closed.

If they're `ESTAB` instead, and the count grows without limit, the pool is leaking live connections. Or it's simply sized too large for the number of instances (pool size × instances > the DB's connection limit).

To confirm, watch the app's network calls for a few seconds:

```
$ timeout 10 strace -f -tt -yy -e trace=connect,close,shutdown -p $PID -o /tmp/conn.txt
strace: Process 2698 attached
strace: Process 2698 detached
$ grep -c "connect(" /tmp/conn.txt; grep -c "close(" /tmp/conn.txt
49
0
$ head -2 /tmp/conn.txt
2698  15:02:09.264702 connect(103<TCP:[10300875]>, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("127.0.0.1")}, 16) = 0
2698  15:02:09.467582 connect(104<TCP:[10300879]>, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("127.0.0.1")}, 16) = 0
```

49 connects to 5432 in 10 seconds and zero closes confirms the leak. The FD numbers climbing (103, 104, …) show the same thing.

One detail from the lab: at `connect()` time, `-yy` shows only the socket inode (`TCP:[10300875]`), not the addresses, because the socket isn't connected yet when strace decodes the argument. Later calls on the same FD (`recvfrom`, `sendto`) show the full `local->peer` pair.

---

## Symptom 2: disk full, but `du` can't find the space

The lab app writes about 20 MiB/s to `/var/log/myapp/debug.log` on a 512 MiB tmpfs. Delete the log while the app is writing:

```
$ df -h /var/log/myapp; du -sh /var/log/myapp      # before rm
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           512M  158M  354M  31% /var/log/myapp
158M	/var/log/myapp

$ rm /var/log/myapp/debug.log
$ df -h /var/log/myapp; du -sh /var/log/myapp      # 4 s later
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           512M  236M  276M  47% /var/log/myapp
0	/var/log/myapp
```

`du` says 0 and `df` says 236M **and still climbing**. A file that's deleted while a process still has it open keeps using space until that process closes it. `du` can't see it (it has no name any more); `df` can.

```
$ lsof -nP +L1
COMMAND  PID USER   FD   TYPE DEVICE  SIZE/OFF NLINK NODE NAME
myapp   2727 root    3w   REG  0,461 247463936     0    2 /var/log/myapp/debug.log (deleted)
```

`NLINK 0` with `(deleted)`: no directory entry, still open on FD 3. Options:

- **Restart the service** (cleanest): the FD closes and the space returns.
- **Can't restart now?** Truncate it through the process's FD:

```
$ truncate -s 0 /proc/2727/fd/3
$ df -h /var/log/myapp
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           512M  6.0M  506M   2% /var/log/myapp
```

That irreversibly discards the contents, so only do it for data you don't need. And it only buys time. The app is still writing to the deleted file, so 3 seconds later:

```
tmpfs           512M   65M  447M  13% /var/log/myapp
myapp   2727 root    3w   REG  0,461 68157440     0    2 /var/log/myapp/debug.log (deleted)
```

### The lab finding: truncation depends on how the app opened the file

The run above used a file opened in append mode (`O_APPEND`), so after truncation it grew again from zero. The same test with the file opened in plain write mode (`"w"`, no `O_APPEND`) behaves differently. The process keeps its old write offset, so the next write lands at the old end of the file:

```
# before truncate
myapp   2759 root    3w   REG  0,461 123731968     0    3 /var/log/myapp/debug.log (deleted)
tmpfs           512M  118M  394M  24% /var/log/myapp

# 2 s after truncate
myapp   2759 root    3w   REG  0,461 165675008     0    3 /var/log/myapp/debug.log (deleted)
tmpfs           512M   40M  472M   8% /var/log/myapp

$ stat -L -c "size=%s blocks=%b blksize=%B" /proc/2759/fd/3
size=165675008 blocks=81920 blksize=512
```

lsof reports 158 MiB, but only 40 MiB (81920 × 512 bytes) is really allocated. The rest is a hole. The space was freed, and `df` is the number to trust. lsof's `SIZE/OFF` is the file's apparent size, not its disk usage. The same applies to a live (not deleted) log truncated with `truncate -s 0` or `> file`: if the writer doesn't use `O_APPEND`, the file comes back sparse at its old size. That's why logrotate's `copytruncate` works best with apps that open logs in append mode.

Next time, truncate instead of deleting a live log, or fix log rotation. See [disk full cleanup and deleting large files safely](/blog/check-disk-usage-linux-du-df).

---

## Symptom 3: requests hang, the process looks idle

CPU is low, the app isn't logging, and requests time out. In the lab, three worker threads each sent a query to a fake database that reads it and never answers.

```
$ ps -o pid,tid,stat,pcpu,wchan:20,comm -L -p $PID
    PID     TID STAT %CPU WCHAN                COMMAND
   2697    2697 Sl    0.0 hrtimer_nanosleep    myapp
   2697    2699 Sl    0.0 wait_woken           myapp
   2697    2700 Sl    0.0 wait_woken           myapp
   2697    2701 Sl    0.0 wait_woken           myapp
```

Three threads asleep in `wait_woken` (waiting for socket data), and the main thread in a timer sleep. `ps` tells you they're waiting, but not on what. strace does:

```
$ timeout 3 strace -f -tt -T -yy -p $PID
strace: Process 2697 attached with 4 threads
[pid  2701] 15:03:13.552339 recvfrom(4<TCP:[127.0.0.1:43156->127.0.0.1:5432]>,  <unfinished ...>
[pid  2700] 15:03:13.554855 recvfrom(3<TCP:[127.0.0.1:43144->127.0.0.1:5432]>,  <unfinished ...>
[pid  2699] 15:03:13.557308 recvfrom(5<TCP:[127.0.0.1:43164->127.0.0.1:5432]>,  <unfinished ...>
[pid  2697] 15:03:13.559591 clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, {tv_sec=184249, tv_nsec=477573823}, NULL) = 0 <1.000187>
...
```

Every worker is stuck in a receive call on a connection to port 5432, and `-yy` names the connection directly. Python's `socket.recv()` shows up as `recvfrom`, not `read`. Grep for both, plus `recvmsg` and `poll`/`epoll_wait`, depending on the runtime. Without `-yy`, map the FD with lsof:

```
$ lsof -nP -a -p $PID -i
COMMAND  PID USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
myapp   2697 root    3u  IPv4 10304184      0t0  TCP 127.0.0.1:43144->127.0.0.1:5432 (ESTABLISHED)
myapp   2697 root    4u  IPv4 10305280      0t0  TCP 127.0.0.1:43156->127.0.0.1:5432 (ESTABLISHED)
myapp   2697 root    5u  IPv4 10309826      0t0  TCP 127.0.0.1:43164->127.0.0.1:5432 (ESTABLISHED)
```

What do those connections look like?

```
$ ss -tnoi '( dport = :5432 )'
State Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
ESTAB 0      0          127.0.0.1:43144    127.0.0.1:5432 timer:(keepalive,119min,0)
	 ts sack cubic wscale:7,7 rto:201 rtt:0.018/0.01 ... bytes_sent:32 bytes_acked:33 segs_out:3 segs_in:2 data_segs_out:1 ... lastsnd:6008 lastrcv:6008 lastack:6008 ...
...
```

How to read it:

- `Recv-Q 0`, `Send-Q 0`: the query was delivered and acknowledged, and nothing has come back. The problem isn't the network. The server has the request and hasn't answered, because it's still running it or waiting on a lock. Look at the database's active queries and locks next.
- `lastsnd:6008 lastrcv:6008`: milliseconds since the last send and receive. This tells you how long the request has been stuck without any app logs.
- `timer:(keepalive,119min,0)`: the app enabled TCP keepalive, but the kernel default (`net.ipv4.tcp_keepalive_time = 7200`) means the first probe goes out after 2 hours. Keepalive is not a request timeout. The missing query timeout in the app is the second bug.

If instead `Send-Q` were large and `retrans` climbing in `ss -i`, the network path or the peer's receive side would be the problem.

---

## Symptom 4: slow under load, no errors

The lab app listens on 8080 with `listen(8)` and never calls `accept()`. That's an extreme stand-in for a server whose workers are all busy. A client then opens 40 connections at once:

```
$ ss -ltn "sport = :8080"           # idle
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 0      8            0.0.0.0:8080      0.0.0.0:*

$ ss -ltn "sport = :8080"           # after 40 connects
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 9      8            0.0.0.0:8080      0.0.0.0:*

$ nstat -az TcpExtListenOverflows TcpExtListenDrops TcpExtTCPReqQFullDrop TcpExtSyncookiesSent
#kernel
TcpExtSyncookiesSent            0                  0.0
TcpExtListenOverflows           93                 0.0
TcpExtListenDrops               93                 0.0
TcpExtTCPReqQFullDrop           0                  0.0
```

Two things the lab shows that most guides skip:

- **The queue holds backlog + 1.** With `listen(8)`, Recv-Q stopped at **9**, not 8. So "Recv-Q equal to Send-Q" is not the full signal. Recv-Q **greater than** Send-Q means the queue is full.
- **The overflow counter counts retries, not clients.** 40 clients, 9 admitted, 31 refused, yet `ListenOverflows` was already 93 after 3 seconds. The kernel silently drops the handshake for a full queue, and each client keeps retransmitting its SYN, which counts again. From the clients' side:

```
$ ss -Htan "dport = :8080" | awk '{print $1}' | sort | uniq -c
      9 ESTAB
     31 SYN-SENT
```

The 31 clients sit in `SYN-SENT`, retrying with exponential backoff (1 s, 3 s, 7 s…). To users that looks like seconds of extra latency with no errors anywhere. The app isn't accepting fast enough because its workers are busy. `strace -c -w -f -p $PID` for 20 seconds shows where their time goes, at a cost (see below). Raising the backlog (the `listen()` argument, capped by `net.core.somaxconn`, 4096 here) only buys headroom. The fix is worker capacity, or whatever the workers are waiting on.

---

## Symptom 5: who has this file or port?

`umount` refuses, and doesn't say why:

```
$ umount /mnt/backup
umount: /mnt/backup: target is busy.

$ lsof -nP /mnt/backup/db.dump          # one file
COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
python3 2848 root    3r   REG  0,461        5    2 /mnt/backup/db.dump

$ lsof -nP +D /mnt/backup               # anything under the directory
COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
sleep   2847 root  cwd    DIR  0,461       60    1 /mnt/backup
python3 2848 root    3r   REG  0,461        5    2 /mnt/backup/db.dump
```

`lsof +D` found both holders: one process with the file open, and one whose working directory (`cwd`) is inside the mount. The `cwd` holder is the one people miss, because it often has nothing open at all. Typically it's a shell someone left `cd`'d into the directory. `+D` walks the whole tree, so it is slow on large trees. `fuser -vm` asks the kernel per mount instead:

```
$ fuser -vm /mnt/backup 2>&1 >/dev/null
                     USER        PID ACCESS COMMAND
/mnt/backup:         root      mount /mnt/backup
                     root      ..c.. sleep
```

`c` is current directory, `f` an open file, `e` a running executable. A quirk visible here: `fuser` prints the PIDs on stdout and the rest of the table on stderr, so with stdout discarded the PID column is empty, and in a pipe or log the two streams can interleave. For scripts, `fuser -m /mnt/backup` (PIDs only) is the part to parse.

For ports, `ss` names the process directly (`fuser -v 8080/tcp` is the alternative):

```
$ ss -ltnp "sport = :8080"
State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 0      8            0.0.0.0:8080      0.0.0.0:*    users:(("myapp",pid=2846,fd=3))
```

For "address already in use" errors, see [port already in use](/blog/check-open-ports-linux).

---

## What strace really costs

"strace slows the process" is in every guide. The lab measured how much. Copying 500,000 bytes with `dd bs=1` makes about a million `read`/`write` syscalls. Each line below is one run, timed with `/usr/bin/time -f "<label> %e s"`:

```bash
dd if=/dev/zero of=/dev/null bs=1 count=500000                                         # plain
strace -f -o /dev/null dd if=/dev/zero of=/dev/null bs=1 count=500000                  # strace
strace -f -e trace=openat -o /dev/null dd if=/dev/zero of=/dev/null bs=1 count=500000  # filtered
```

```
plain   0.16 s
plain   0.15 s
strace  49.52 s
strace  49.14 s
strace -e openat 44.60 s
```

That is roughly **300× slower**. The surprise is the last line. Filtering with `-e trace=openat`, which traces almost nothing, still took 44.6 s. strace stops the process on **every** syscall and only then decides whether to print it, so a filter cuts the output but barely cuts the cost.

The fix is `--seccomp-bpf`. It installs a kernel filter so that only the traced syscalls stop the process:

```
strace --seccomp-bpf -e openat 0.19 s
strace --seccomp-bpf -e openat 0.17 s
```

But it only works when strace **starts** the program. Attaching to a running service with `-p` doesn't support it:

```
$ strace -f --seccomp-bpf -e trace=openat -p $PID
strace: --seccomp-bpf is not enabled for processes attached with -p
```

And attaching with a filter is just as expensive. A loop making `getppid()` calls ran about 4.7 million iterations per second. With `strace -f -e trace=openat -p` attached, it dropped to about 22,000:

```
### syscalls/s, no strace
4743619
4796027
### attached: strace -f -e trace=openat -p
22400
22151
```

In practice:

- On a busy production process, attach for **seconds**, with `timeout`, to a file (`-o`).
- `strace -c` (a summary only) still pays the per-syscall stop. It's a smaller output, not a cheaper trace.
- For a low-overhead view of a running process, use eBPF tools instead (`perf trace`, or `bpftrace` / the bcc tools). They don't stop the process.

---

## Which tool for which question

```
Process misbehaving, logs quiet
│
├─ What does it hold?         lsof -nP -p PID        (files, sockets, deleted files)
│     too many FDs?           ls /proc/PID/fd | wc -l
│     can't umount?           lsof +D DIR  /  fuser -vm MOUNT   (look for cwd)
│
├─ Network trouble?           ss -tanp | grep pid=PID,
│     CLOSE-WAIT piling up    → app never closes: code bug
│     Recv-Q growing          → app not reading: app busy/stuck
│     Send-Q growing          → peer/network slow
│     LISTEN Recv-Q > Send-Q  → accept queue full, clients stuck in SYN-SENT
│
└─ What is it doing / waiting on?
      timeout 10 strace -f -tt -T -yy -p PID -o file   (seconds, not minutes)
      the call that doesn't return + its FD → back to lsof/ss for that FD
```

---

## FAQ

**Do lsof and ss affect the running process?**
No. They read kernel state from `/proc` and netlink without stopping the process. lsof can be slow on hosts with many open files or hung NFS mounts (`-b` avoids blocking calls), but it doesn't slow the target. strace does, by two to three orders of magnitude for a syscall-heavy process in this lab.

**Why does `lsof -p PID -i` show other processes?**
lsof combines selection options with OR. Use `lsof -a -p PID -i` to get the intersection.

**Why is lsof's SIZE bigger than what df frees?**
`SIZE/OFF` is the apparent size. After truncating a file that's still being written without `O_APPEND`, the file is sparse: lsof showed 158 MiB while only 40 MiB was allocated. Trust `df` for space.

**Can I use these inside containers?**
`lsof` and `ss` inside a container see only that container's processes and network namespace. From the host, enter its network namespace: `sudo nsenter -t $(docker inspect -f '{{.State.Pid}}' web) -n ss -tanp`. strace inside a container needs `SYS_PTRACE` (this lab used a privileged container), so it's usually easier to run it on the host against the container's host PID.

**ss or netstat?**
`ss`. It talks to the kernel over netlink, is faster on busy hosts, and has state filters and TCP internals (`-i`). `netstat` comes from the deprecated net-tools package. See [netstat vs ss](/blog/check-open-ports-linux).

---

*Related: [Linux TIME_WAIT explained](/blog/linux-time-wait-explained) when the sockets piling up are TIME-WAIT rather than CLOSE-WAIT, and [Linux debugging tools](/blog/linux-debugging-tools-guide) for the wider toolkit.*
