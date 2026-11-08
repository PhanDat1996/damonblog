---
title: "ps Command in Linux: Check Running Processes, Find by Name"
date: "2026-04-21"
updated: "2026-11-02"
excerpt: "Check if a process is running, find it by name with pgrep, pidof and ps -C, and read ps output: lifetime %CPU, RSS vs VSZ, STAT codes, -o recipes."
tags: ["linux", "troubleshooting", "debugging", "infrastructure", "monitoring"]
featured: false
category: "linux"
---

Something stopped working and the first question is simple: is the process even running? Then it gets confusing. `ps aux` says the service is using 3% CPU, `top` says 180%. `pgrep -x elasticsearch-server` returns nothing while `ps aux` clearly shows it. `pkill java` takes down three services instead of one.

`ps` is the tool you'll use most during an incident because it gives a stable snapshot you can grep, sort and paste into a ticket. It's also the easiest to misread. This guide covers checking whether something is running, finding a process by name, what the columns really mean, the STAT codes, and the `-o` recipes worth memorizing.

---

## TL;DR

```bash
ps aux                                              # every process, with CPU/mem
ps -ef --forest                                     # every process with PPID, as a tree
pgrep -a nginx                                      # is nginx running? PIDs + command lines
pgrep -af "service-prod.jar"                        # match anywhere in the full command line
systemctl status nginx                              # is the *service* up, and since when?
ss -tlnp                                            # which processes are listening on which ports
ps -eo pid,ppid,user,stat,etime,%cpu,rss,args --sort=-rss | head
ps -p 1234 -o pid,stat,etime,wchan:32,args          # one process in detail
ps -L -p 1234 -o tid,pcpu,stat,comm                 # threads of one process
ps -eo stat,pid,ppid,comm | awk '$1 ~ /^[DZ]/'      # stuck (D) and zombie (Z) tasks
```

---

## Check if a process is running

There are three different answers to "is my service running?", and you usually want all three.

**1. Does systemd think it's running?**

```bash
systemctl status nginx
```

```
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-10-27 09:15:02 UTC; 1 day 3h ago
   Main PID: 1102 (nginx)
      Tasks: 5 (limit: 9434)
     Memory: 12.4M
     CGroup: /system.slice/nginx.service
             ├─1102 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"
             ├─1103 "nginx: worker process"
             ...
```

`active (running)` plus a recent "since" time after you didn't restart it means it crashed and was restarted. `activating (auto-restart)` or `failed` means it isn't up. Read the log lines at the bottom, or `journalctl -u nginx -n 50`. If it won't start at all, see [systemctl Service Not Starting](/blog/systemctl-service-not-starting-fix).

**2. Does the process exist?**

```bash
pgrep -a nginx
# 1102 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
# 1103 nginx: worker process
```

No output (exit code 1) means nothing by that name. This catches things systemd doesn't manage: containers, cron jobs, apps started by hand. Matching rules have a few traps; see **Find a process by name** below.

**3. Is it actually listening?**

```bash
ss -tlnp | grep nginx
# LISTEN 0  511  0.0.0.0:80   0.0.0.0:*  users:(("nginx",pid=1103,fd=6),("nginx",pid=1102,fd=6))
```

A process can be running and still not serving: stuck on startup, bound to `127.0.0.1` only, or listening on the wrong port. Run `ss` with `sudo` to see processes owned by other users. More in [Check Open Ports in Linux](/blog/check-open-ports-linux).

A running, listening process that still doesn't respond is often stuck. Check its state:

```bash
ps -o pid,stat,etime,wchan:32,args -p 1102
```

`D` in `STAT` means it's blocked in the kernel, usually on disk or NFS. `T` means it was stopped. See **STAT codes** below.

### In a shell script

```bash
if pgrep -x nginx >/dev/null; then
  echo "nginx running ($(pgrep -cx nginx) processes)"
else
  echo "nginx not running" >&2
  exit 1
fi
```

For systemd-managed services, `systemctl is-active --quiet nginx` is a better check: it tells you whether the **service** is up, not just whether some process named nginx exists.

---

## What's running on this box?

### Snapshot

```bash
ps aux
```

Kernel threads appear in square brackets (`[kworker/0:2]`); you can usually ignore them. To hide them:

```bash
ps --ppid 2 -p 2 -N -o pid,user,stat,etime,args
```

(PID 2 is `kthreadd`, the parent of all kernel threads; `-N` inverts the selection.)

### As a tree

```bash
ps -ef --forest
pstree -p              # more compact, from the psmisc package
```

A tree answers "what started this?" without looking up PPIDs by hand. Useful when an unknown process shows up and you want to know whether it came from cron, a shell, a container runtime or a service.

### Live

```bash
top          # always installed
htop         # nicer, if installed
```

Both sort by current CPU usage. `%CPU` in `ps` is averaged over the process's whole lifetime, so the busiest process **right now** is better found with `top`. See [Check CPU Usage in Linux](/blog/top-command-linux-guide), and [top vs htop](/blog/htop-vs-top-linux) for when htop is the better tool.

### By service, not by process

```bash
systemctl list-units --type=service --state=running
systemd-cgls                     # every service with its processes
```

`systemd-cgls` is the clearest view on a systemd machine: each service and the PIDs it owns, including helper processes you wouldn't think to search for. See [Check Running Services with systemctl](/blog/systemctl-service-not-starting-fix).

### In containers

```bash
docker ps                        # running containers
docker top <container>           # processes inside one container
```

Container processes are also visible from the host in `ps aux` (they're regular processes in their own namespaces), often with surprising user names because UIDs map to whatever exists on the host.

---

## Find a process by name

Each tool matches against a **different** name, and the rules aren't obvious. Every process has two names the kernel reports:

| Name | Where it lives | Example | Used by |
|---|---|---|---|
| **comm** | `/proc/<PID>/comm` | `java` | `pgrep`, `pkill`, `ps -C`, `top` |
| **command line** | `/proc/<PID>/cmdline` | `java -Xmx4g -jar /opt/app/service-prod.jar` | `pgrep -f`, `ps ... args` |

Two consequences:

1. **comm is truncated to 15 characters.** A program called `elasticsearch-server` has comm `elasticsearch-s`. `pgrep -x elasticsearch-server` never matches. Use `pgrep -f` or match the truncated name.
2. **For interpreted programs, comm is the interpreter** (or whatever the program set). A Python app shows up as `python3`, a Node app as `node`, a JAR as `java`. To find *your* app, match the command line with `-f`.

Programs can also rename themselves. NGINX workers show `nginx: worker process` in `args`, PostgreSQL backends show `postgres: app mydb 10.0.0.5(51234) idle`.

### pgrep

```bash
pgrep nginx              # pattern (regex) anywhere in comm: also matches "nginx-exporter"
pgrep -x nginx           # comm must equal "nginx" exactly
pgrep -f "worker.py"     # pattern anywhere in the full command line
pgrep -a nginx           # also print the command line
pgrep -l nginx           # also print the name
pgrep -u www-data nginx  # only this user's processes
pgrep -c nginx           # count instead of list
pgrep -o -x nginx        # oldest match (usually the master/parent)
pgrep -n -x nginx        # newest match
pgrep -P 1102            # children of PID 1102
pgrep -d, -x nginx       # comma-separated, handy for top -p
```

The pattern is an extended regular expression, so `pgrep 'php-fpm|nginx'` works and `.` matches any character. It's case-sensitive; add `-i` to ignore case.

Exit codes are script-friendly: **0** if something matched, **1** if nothing did, **2** for a syntax error. `pgrep` never matches itself.

**The `-f` self-match trap.** `pgrep` excludes itself, but not its parent shell. This in a script:

```bash
ssh host "pgrep -f worker.py"
```

can match the remote `bash -c "pgrep -f worker.py"` process, because that shell's command line contains `worker.py`. The same happens in cron jobs and `watch`. Make the pattern something the wrapper won't contain, e.g. `pgrep -f '[w]orker.py'` (the regex still matches `worker.py`, but the literal text `[w]orker.py` in the wrapper's command line doesn't).

### pidof

```bash
pidof nginx
# 1103 1102
pidof -s nginx           # just one PID
pidof -x backup.sh       # also match shell scripts by script name
```

`pidof` matches the program name (from the executable or `argv[0]`), not a pattern. `pidof ngin` returns nothing. It doesn't truncate at 15 characters the way comm does, so it can find long names that `pgrep -x` misses.

It doesn't filter by user and doesn't do regexes. On Debian/Ubuntu it comes from `sysvinit-utils`; on RHEL 8 and later from `procps-ng`. Behavior is close but not identical, so prefer `pgrep` in portable scripts.

### ps -C and ps | grep

```bash
ps -C nginx -o pid,ppid,user,stat,etime,args
```

`-C` selects by exact comm (same 15-character limit) and lets you choose columns, which is the best combination when you want details rather than just PIDs.

If you grep `ps` output, avoid matching the grep itself:

```bash
ps aux | grep '[n]ginx'
```

The regex `[n]ginx` matches "nginx", but grep's own command line contains `[n]ginx`, which doesn't. Fine for a quick look; in scripts, `pgrep` is cleaner.

### Which of several Java apps is which?

```bash
pgrep -af java
# 8823 java -Xmx4g -jar /opt/app/service-prod.jar
# 9011 java -Xmx2g -jar /opt/app/worker.jar

PID=$(pgrep -f 'service-prod\.jar')
```

Escape the dot or it matches any character.

### Details for every match

```bash
ps -o pid,ppid,stat,etime,%cpu,rss,args -p "$(pgrep -d, -x nginx)"
top -p "$(pgrep -d, -x nginx)"
```

Both fail with an error if `pgrep` returns nothing, so check first in scripts.

### Name unknown, port known

```bash
sudo ss -tlnp 'sport = :8080'
```

Then [Kill a Process by Port](/blog/check-open-ports-linux) if that's the goal.

---

## Three syntaxes, one command

procps-ng `ps` accepts three option styles, which is why examples online look inconsistent:

| Style | Example | Notes |
|---|---|---|
| BSD (no dash) | `ps aux` | User-oriented columns: `%CPU %MEM VSZ RSS STAT` |
| UNIX/POSIX (one dash) | `ps -ef` | `UID PID PPID C STIME TTY TIME CMD` |
| GNU long options | `ps --sort=-rss` | Mostly sorting, formatting, trees |

`ps aux` and `ps -ef` both list every process. The practical difference is columns: `aux` gives resource usage, `-ef` gives the parent PID. Neither is "fuller." Both truncate long command lines to the terminal width. To see the whole line, add `ww` (`ps auxww`, `ps -efww`) or read `/proc/<PID>/cmdline`.

For anything you'll script or sort, skip both and pick columns with `-o`.

On Alpine and other BusyBox systems, `ps` is a minimal implementation that ignores most of these options. Install `procps` there if you need them.

---

## Reading `ps aux`

```
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.1 168940 13120 ?        Ss   Oct20   0:21 /sbin/init
root        1102  0.0  0.0  55220  1540 ?        Ss   Oct20   0:00 nginx: master process /usr/sbin/nginx
www-data    1103  0.4  0.1  56840  9216 ?        S    Oct20  46:12 nginx: worker process
app         8823 41.7 13.1 6843120 2097460 ?     Ssl  09:02 132:40 java -Xmx4g -jar /opt/app/service.jar
```

| Column | Meaning | Trap |
|---|---|---|
| `%CPU` | Total CPU time ÷ time since the process started | **Lifetime average**, not current load |
| `%MEM` | RSS as a percentage of physical RAM | Counts shared pages in every process |
| `VSZ` | Virtual memory size, KiB | Address space, not RAM. Large values are normal |
| `RSS` | Resident set size, KiB: pages in RAM now | Includes shared libraries and shared memory |
| `STAT` | State plus flags (see below) | Read the first letter first |
| `START` | Start time (date if older than 24h) | Use `lstart` or `etime` for precision |
| `TIME` | Cumulative CPU time | Can exceed wall time for multithreaded processes |

### Why `%CPU` lies to you

`ps` computes `%CPU` as CPU time used divided by elapsed time since start. The java process above has used 132 minutes of CPU since 09:02; if it's been up for about 5 hours, that's ~42%. If it started spinning at four cores five minutes ago, `ps` will barely move, while `top` shows ~400%.

Use `ps` `%CPU` to find long-term heavy users. For "what's busy now," use `top`, `pidstat -u 1`, or take two `TIME` readings a few seconds apart. See [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide) for the full workflow.

### RSS vs VSZ vs PSS

- **VSZ**: everything mapped into the address space, touched or not. A JVM with a 4 GB heap reservation, Go programs and glibc's per-thread arenas all have big VSZ. Don't alert on it.
- **RSS**: what's resident now. Good for "which process is big" and for trending one process. But shared pages (libraries, `shared_buffers`, forked workers' copy-on-write pages) are counted in **every** process, so summing RSS overstates usage.
- **PSS** (not in ps): shared pages divided among sharers. Read it from `/proc/<PID>/smaps_rollup`.

Leak hunting is covered in [Linux Memory Leak Troubleshooting](/blog/linux-memory-leak-troubleshooting).

---

## STAT codes

The first letter is the state:

| Code | State | What it usually means |
|---|---|---|
| `R` | Running or runnable | On a CPU or waiting in the run queue |
| `S` | Interruptible sleep | Waiting for an event (socket, timer). Normal for most processes |
| `D` | Uninterruptible sleep | In the kernel waiting on I/O (disk, NFS). Counts toward load average |
| `I` | Idle kernel thread | Kernel 4.14+. Not counted in load |
| `T` | Stopped | `Ctrl+Z` or `SIGSTOP` |
| `t` | Stopped by debugger | Being traced (gdb, strace in some modes) |
| `Z` | Zombie | Exited, waiting for its parent to collect the exit status |

Extra characters are flags:

| Flag | Meaning |
|---|---|
| `s` | Session leader |
| `l` | Multithreaded |
| `+` | In the foreground process group of its terminal |
| `<` | High priority (negative nice) |
| `N` | Low priority (positive nice) |
| `L` | Has pages locked in memory |

So `Ssl` on the java process means: sleeping, session leader, multithreaded. That's a perfectly healthy daemon.

Two consequences that matter in incidents:

- **`D` can't be killed.** Signals, including SIGKILL, are delivered only when the task leaves uninterruptible sleep. If a process stays in `D`, fix what it's waiting on (dead NFS server, failing disk). Many D-state tasks also explain a high load average with idle CPUs.
- **`Z` can't be killed either.** It's already dead. Only its parent can reap it. Details in [Linux Process States](/blog/linux-process-states-guide).

---

## `-o` recipes

Pick columns with `-o` and sort with `--sort` (prefix `-` for descending). Append `=` to a column to drop the header (`-o pid=`), or `=NAME` to rename it.

### Top consumers

```bash
ps -eo pid,user,%cpu,%mem,rss,etime,comm --sort=-%cpu | head -11
ps -eo pid,user,rss,comm --sort=-rss | head -11
```

### Everything about one process

```bash
ps -p 8823 -o pid,ppid,user,stat,nlwp,lstart,etime,time,rss,args
```

`nlwp` is the thread count. `lstart` is the exact start time. `etime` is elapsed time in `[[DD-]hh:]mm:ss`.

### Processes running longer than an hour

```bash
ps -eo pid,etimes,args --sort=-etimes | awk 'NR==1 || $2 > 3600'
```

`etimes` is elapsed time in plain seconds, which is far easier to compare than `etime`.

### What a sleeping process is waiting on

```bash
ps -o pid,stat,wchan:32,args -p 8823
```

`wchan` shows the kernel function a sleeping task is blocked in, for example `ep_poll` or `do_epoll_wait` (an idle event loop, depending on kernel version) or an NFS or block-layer function for a task stuck in `D`. A running task shows `-`.

### Parent, children, tree

```bash
ps -o ppid= -p 8823                 # parent PID
ps --ppid 1102 -o pid,stat,args     # direct children of 1102
pstree -p 1102                      # tree under one PID (psmisc package)
```

### Threads

```bash
ps -L -p 8823 -o tid,pcpu,stat,wchan:20,comm --sort=-pcpu | head
```

One line per thread. `TID` values here match `top -H` and, converted to hex, the `nid` in a Java `jstack` dump.

### Zombies and stuck tasks

```bash
ps -eo stat,pid,ppid,etime,comm | awk '$1 ~ /^Z/'       # zombies with their parent
ps -eo stat,pid,wchan:32,args | awk '$1 ~ /^D/'         # tasks in D state
```

Match the **first character** of STAT. `awk '$8 == "Z"'` on `ps aux` output misses `Zs` or `Z+`.

### A user's processes, or a service's

```bash
ps -u www-data -o pid,stat,%cpu,rss,args
ps -C nginx -o pid,ppid,stat,args          # by command name (exact, max 15 chars)
systemctl status nginx                     # the service's cgroup lists all its PIDs
```

---

## Before you kill something

`ps` is usually the last step before `kill`. A few checks prevent bad outcomes:

```bash
ps -p 8823 -o pid,ppid,stat,etime,args     # is it what you think it is?
ps --ppid 8823 -o pid,args                 # does it have children?
```

`pkill` uses exactly the same matching as `pgrep`, so **run `pgrep` with the same arguments first** and look at what it selects:

```bash
pgrep -a -x -u app myworker      # preview
pkill    -x -u app myworker      # same match, sends SIGTERM
```

- Without `-x`, `pkill nginx` also signals `nginx-exporter` or anything else containing "nginx".
- `pkill -f java` kills every Java process on the box. Match the JAR or main class instead.
- If it's managed by systemd, use `systemctl stop` or `restart`; otherwise the unit's `Restart=` policy may start it again immediately.
- Send SIGTERM (`kill 8823`) first and give it time to exit. Use `kill -9` only if it ignores SIGTERM: SIGKILL skips all cleanup, so buffers aren't flushed and lock or PID files can be left behind.
- In `D` state, neither signal will work until the I/O completes.
- Prefer `pkill -x name` or `kill $(pgrep -x name)` over `ps | grep | awk | xargs kill`. All of them can race with PID reuse in theory, but the pipeline also tends to match the wrong lines (its own grep, similarly named processes).

`killall` exists too (psmisc). On Linux it kills by name; on some other Unix systems `killall` kills **everything**, so don't build that habit if you work across platforms.

---

## FAQ

**What's the difference between `ps aux` and `ps -ef`?**
Same processes, different columns. `aux` (BSD style) shows `%CPU`, `%MEM`, `VSZ`, `RSS` and `STAT`. `-ef` (UNIX style) shows `PPID` and start time. Use `-eo` to get exactly the columns you want.

**Why does `ps` show different CPU than `top`?**
`ps` averages over the whole life of the process; `top` measures the last refresh interval (3 seconds by default).

**Why does pgrep not find a process with a long name?**
`pgrep` matches the 15-character comm by default. Use `pgrep -f` to match the full command line, or `pidof`, which uses the full program name.

**How do I find a process by name and get only one PID?**
`pgrep -o -x name` for the oldest (typically the parent), `pgrep -n -x name` for the newest, or `pidof -s name`.

**How do I see how long a process has been running?**
`ps -o pid,etime,lstart,args -p <PID>`. `etime` is elapsed time; `lstart` is the exact start timestamp.

**How do I see the full command line in `ps`?**
Add `ww`: `ps auxww` or `ps -efww`. Or use `-o args` with `ww`. Without it, output is cut at the terminal width.

**Why does a process show more `TIME` than it's been running?**
`TIME` sums CPU time across all threads. A process using four cores for an hour accumulates four hours of CPU time.

**Why does `ps aux` show processes I can't find in `systemctl`?**
Not everything is a systemd service. Processes can come from cron, login sessions, containers or be started by hand. `ps -ef --forest` shows who started them.

---

*Related: [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for the next step once `ps` has found the process. [Kill a Process by Port](/blog/check-open-ports-linux) when the port is what you know.*
