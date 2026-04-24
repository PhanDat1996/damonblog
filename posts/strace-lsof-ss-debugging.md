---
title: "strace, lsof, and ss: The Trio That Solves Every Mystery"
date: "2024-05-02"
excerpt: "When logs give you nothing and the debugger isn't an option, these three tools let you see exactly what a running process is doing at the system call level."
tags: ["debugging", "linux", "troubleshooting", "production"]
featured: false
category: "linux"
---

## When Normal Debugging Fails

You have a process that's misbehaving. It's not crashing — it's just wrong. Maybe it's slow. Maybe it's not writing to a file it should be. Maybe it's making network connections you don't expect. The logs are quiet. You can't attach a debugger in production.

This is where `strace`, `lsof`, and `ss` become your best friends.

## strace: Watch Every System Call

Every meaningful thing a program does — read a file, write to a socket, allocate memory, create a process — goes through the kernel via system calls. `strace` intercepts those calls and shows them to you in real time.

```bash
# Attach to a running process
strace -p <pid>

# The output you'll see:
# read(3, "HTTP/1.1 200 OK\r\n...", 4096) = 847
# write(1, "data: ...", 52)               = 52
# select(4, [3], NULL, NULL, {tv_sec=30}) = 0 (Timeout)
```

That last line is gold. A `select()` or `poll()` timing out tells you the process is waiting for something that never came.

### Most Useful strace Flags

```bash
# Follow child processes too (for multi-process apps)
strace -f -p <pid>

# Filter to specific syscalls only
strace -e trace=read,write,open,close -p <pid>
strace -e trace=network -p <pid>    # network calls only
strace -e trace=file -p <pid>       # file operations only

# Show timestamps
strace -t -p <pid>

# Show time spent in each call (find slow syscalls)
strace -T -p <pid>

# Write output to file (for long traces)
strace -o /tmp/trace.log -p <pid>

# Count syscalls (summary mode)
strace -c -p <pid>
# Press Ctrl+C after a few seconds to see the summary
```

### Finding a Stuck Process

```bash
# Is the process hung in a syscall?
strace -p <pid>

# If it immediately shows something like:
# futex(0x..., FUTEX_WAIT, ...) = ?
# ...it's blocked on a mutex/lock

# epoll_wait, select, poll with timeout = waiting for I/O
# read(fd, ...) with no return = blocked on slow read
```

### Finding File Access Issues

```bash
# Which files is the process opening?
strace -e trace=open,openat,read,write -p <pid> 2>&1 | grep -v ENOENT

# Looking for failed opens:
strace -e trace=open,openat -p <pid> 2>&1 | grep "EACCES\|ENOENT\|EPERM"
```

## lsof: Every Open File Descriptor

`lsof` ("list open files") shows you everything a process has open — files, sockets, pipes, devices.

```bash
# All open files for a process
lsof -p <pid>

# Open network connections only
lsof -p <pid> -i

# Who has a specific file open?
lsof /var/log/app/app.log

# Who is listening on port 8080?
lsof -i :8080

# All connections to a remote host
lsof -i @192.168.1.100
```

### What to Look For

```bash
lsof -p <pid>
# Output columns:
# COMMAND  PID  USER  FD   TYPE  DEVICE  SIZE   NODE  NAME
# nginx   1234  root   4u  IPv4  12345   0t0   TCP   *:80 (LISTEN)
# nginx   1234  root   5u  IPv4  12346   0t0   TCP   host:80->client:41234 (ESTABLISHED)
# nginx   1234  root   6r  REG   8,1    4096  89012  /var/log/nginx/access.log
```

**FD column meanings:**
- `r` = open for reading
- `w` = open for writing
- `u` = open for read+write
- `mem` = memory-mapped file
- `txt` = program text (executable)

**Too many open files?**

```bash
# Count open FDs
lsof -p <pid> | wc -l

# Check the limit
cat /proc/<pid>/limits | grep "open files"

# If approaching the limit, raise it
ulimit -n 65535  # for current shell
# Or permanently in /etc/security/limits.conf
```

## ss: Socket Statistics

`ss` is the modern replacement for `netstat`. Faster, more information.

```bash
# All listening sockets
ss -tlnp

# All established TCP connections
ss -tnp state established

# Connections to a specific port
ss -tnp dport :5432  # who's talking to postgres?

# Show socket stats summary
ss -s

# Extended info including timers
ss -tnpe
```

### Diagnosing Connection Issues

```bash
# Is something stuck in TIME-WAIT? (seen this cause 502s)
ss -tn state time-wait | wc -l

# SYN-SENT connections that never complete (firewall/routing issue)
ss -tn state syn-sent

# Sockets with large receive buffers (receiver can't keep up)
ss -tnm | awk '$0 ~ /rmem/ {print $0}' | sort -t: -k4 -rn | head

# See retransmit counters
ss -tnei
```

## A Real Debugging Session

Here's how these tools work together. Scenario: an app is making database connections that aren't being released.

```bash
# 1. Find the PID
pgrep -f "my-app"  # → 4521

# 2. How many DB connections?
lsof -p 4521 -i :5432 | wc -l  # → 97 (suspiciously high)

# 3. What state are they in?
ss -tnp src :5432 | awk '{print $1}' | sort | uniq -c
# ESTABLISHED: 97
# (none closing — they're leaking)

# 4. Watch what the app does with those connections
strace -p 4521 -e trace=network 2>&1 | head -50
# ... connect() calls but no corresponding close() calls

# 5. Confirm: file descriptor leak
lsof -p 4521 | grep -c "TCP"  # count climbs over time
watch -n 5 'lsof -p 4521 | grep -c TCP'
```

Now you have a definitive answer: the application is opening DB connections and never closing them. That's not a network issue, not a firewall issue — it's a connection pool bug.

## Quick Reference

| Tool | Best For |
|---|---|
| `strace -p <pid>` | What is this process *doing* right now? |
| `strace -e trace=file` | File access issues, missing files |
| `strace -T` | Which syscalls are slow? |
| `lsof -p <pid> -i` | Network connections this process has open |
| `lsof -i :<port>` | Who is using this port? |
| `ss -tlnp` | What is listening and on which interface? |
| `ss -s` | Overall socket count summary |
| `ss -tn state time-wait` | TIME-WAIT buildup (connection exhaustion) |

These three tools won't give you application-level visibility — for that you need traces and metrics. But they will tell you exactly what the OS sees a process doing, which cuts through a huge amount of guesswork.

---

## Three More Real Scenarios

### Scenario 2: Process Consuming CPU But Logs Are Silent

A service is at 80% CPU. No application errors. No business logic issues visible.

```bash
# Step 1: summary mode — identify which syscall category dominates
strace -c -p <pid>
# Press Ctrl+C after 30 seconds

# If futex dominates with high time:
# → Thread contention / deadlock. One thread holds a lock, others wait.
strace -f -p <pid> -e trace=futex 2>&1 | grep "FUTEX_WAIT" | head -20

# If read/write dominates with high call count:
# → Many small I/O operations — check lsof for what it is writing to
lsof -p <pid> | grep -E "REG|CHR"

# If no syscalls dominate but CPU is still high:
# → Pure user-space compute. No syscall-level fix.
# Use perf or a profiler instead.
cat /proc/<pid>/wchan  # should show 'schedule' for CPU-bound
```

### Scenario 3: Intermittent Connection Failures to a Service

A service fails to connect to a backend every 30 minutes or so, recovers, then fails again.

```bash
# Watch connection state continuously
watch -n 2 'ss -tnp | grep <backend_port>'

# When it fails, capture state immediately
# Better: background monitor
while true; do
  TIMESTAMP=$(date '+%H:%M:%S')
  COUNT=$(ss -tnp state established dport :<port> | wc -l)
  echo "$TIMESTAMP established: $COUNT"
  ss -s | grep -i time-wait >> /tmp/tw_monitor.log
  sleep 5
done

# Look for TIME-WAIT spike before connection failures
# Correlate timestamp of spike with application error log timestamp
```

### Scenario 4: File Descriptor Leak Detection Over Time

You suspect a process is leaking FDs but it is slow — hard to catch in the act.

```bash
PID=4521

# Track FD count every minute
while true; do
  FD_COUNT=$(ls /proc/$PID/fd 2>/dev/null | wc -l)
  echo "$(date '+%H:%M:%S') FDs: $FD_COUNT"
  sleep 60
done | tee /tmp/fd_track.log

# If FD count grows past ~500, check what type is leaking
lsof -p $PID | awk '{print $5}' | sort | uniq -c | sort -rn
# TYPE counts: REG (files), IPv4 (sockets), FIFO (pipes)
# Growing IPv4 count = socket leak
# Growing REG count = file handle leak
```

---

## Combining All Three: The Full Investigation Workflow

```
Process is misbehaving
│
├─ Is it consuming unexpected resources?
│   strace -c -p <pid>   → identifies syscall category
│
├─ Is it stuck or hung?
│   strace -p <pid>      → shows current syscall
│   cat /proc/<pid>/wchan → kernel wait channel
│
├─ Network connections wrong?
│   lsof -p <pid> -i     → open sockets + state
│   ss -tnp | grep <pid> → connection states
│
├─ File access wrong?
│   strace -e trace=file -p <pid> 2>&1 | grep "= -1"  → failed opens
│   lsof -p <pid> | grep REG                           → open files
│
└─ Growing over time?
    watch -n 5 'lsof -p <pid> | wc -l'  → FD count trend
    watch -n 5 'ss -tnp | grep <pid> | wc -l'  → connection count trend
```

---

## FAQ

**When should I use strace vs lsof?**
Use `strace` when you need to see what a process is *doing* — the sequence of operations, what it is trying to open, what it is waiting on. Use `lsof` when you need to see the current *state* — what files and sockets are open right now. `strace` has overhead; `lsof` is essentially free. Use `lsof` for quick checks, `strace` for deeper investigation.

**Will strace affect my production service?**
Yes. The `ptrace` mechanism strace uses stops the process on every system call. On a busy process making thousands of syscalls per second, this can slow it by 50–100%. Use `-c` (summary mode) or `-e trace=` (filtered mode) to minimize impact. Always have a way to Ctrl+C.

**Can I use these on containers?**
Yes for `lsof` and `ss` — both work normally inside a container. `strace` requires `SYS_PTRACE` capability, which many container runtimes disable by default. In Docker: `docker run --cap-add SYS_PTRACE`. In Kubernetes: add `securityContext.capabilities.add: [SYS_PTRACE]` to the pod spec.

**What is the difference between ss and netstat?**
Both show socket information. `ss` reads directly from the kernel and is faster and more accurate. `netstat` reads from `/proc/net/` and is deprecated on modern Linux but still widely available. Use `ss`. The equivalent of `netstat -tlnp` is `ss -tlnp`.

---

*Related reading: [strace Tutorial: Debug Linux Processes Like a Pro](/blog/strace-tutorial-linux-debugging) — full strace guide with 5 real scenarios. [Check Open Ports in Linux: ss vs netstat Explained](/blog/check-open-ports-linux-ss-netstat) — deeper ss usage for port investigation. [Linux Log Analysis: How to Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — correlating tool output with logs.*
