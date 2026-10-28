---
title: "ps Command in Linux: Columns, STAT Codes and Recipes"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Read ps output correctly: why %CPU is a lifetime average, RSS vs VSZ, every STAT code, plus ps -eo recipes for trees, threads, zombies and old processes."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

`ps aux` says the service is using 3% CPU. `top` says 180%. The alert says the box is pegged. `ps` isn't broken; it's answering a different question than you think.

`ps` is the tool you'll use most during an incident because it gives a stable snapshot you can grep, sort and paste into a ticket. It's also the easiest to misread. This guide covers what its columns really mean, the STAT codes, and the `-o` recipes worth memorizing.

If you only need to know whether something is running, [How to Check Running Processes](/blog/check-running-process-linux) is quicker. For matching by name, see [Find a Process by Name](/blog/linux-find-process-by-name).

---

## TL;DR

```bash
ps aux                                              # every process, with CPU/mem
ps -ef --forest                                     # every process with PPID, as a tree
ps -eo pid,ppid,user,stat,etime,%cpu,rss,args --sort=-rss | head
ps -p 1234 -o pid,stat,etime,wchan:32,args          # one process in detail
ps -L -p 1234 -o tid,pcpu,stat,comm                 # threads of one process
ps -eo stat,pid,ppid,comm | awk '$1 ~ /^[DZ]/'      # stuck (D) and zombie (Z) tasks
```

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
ps -ef --forest                     # whole tree, ASCII art
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

- If it's managed by systemd, use `systemctl stop` or `restart`; otherwise the unit's `Restart=` policy may start it again immediately.
- Send SIGTERM (`kill 8823`) first and give it time to exit. Use `kill -9` only if it ignores SIGTERM: SIGKILL skips all cleanup, so buffers aren't flushed and lock or PID files can be left behind.
- In `D` state, neither signal will work until the I/O completes.
- Prefer `pkill -x name` or `kill $(pgrep -x name)` over `ps | grep | awk | xargs kill`. All of them can race with PID reuse in theory, but the pipeline also tends to match the wrong lines (its own grep, similarly named processes).

---

**What's the difference between `ps aux` and `ps -ef`?**
Same processes, different columns. `aux` (BSD style) shows `%CPU`, `%MEM`, `VSZ`, `RSS` and `STAT`. `-ef` (UNIX style) shows `PPID` and start time. Use `-eo` to get exactly the columns you want.

**Why does `ps` show different CPU than `top`?**
`ps` averages over the whole life of the process; `top` measures the last refresh interval (3 seconds by default).

**How do I see the full command line in `ps`?**
Add `ww`: `ps auxww` or `ps -efww`. Or use `-o args` with `ww`. Without it, output is cut at the terminal width.

**Why does a process show more `TIME` than it's been running?**
`TIME` sums CPU time across all threads. A process using four cores for an hour accumulates four hours of CPU time.

---

*Related: [top Command in Linux](/blog/top-command-linux-guide) for the live view. [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for the next step once `ps` has found the process.*
