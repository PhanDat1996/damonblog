---
title: "strace, lsof, and ss: The Trio That Solves Every Mystery"
date: "2024-05-02"
excerpt: "When logs give you nothing and the debugger isn't an option, these three tools let you see exactly what a running process is doing at the system call level."
tags: ["debugging", "linux", "troubleshooting", "production"]
featured: false
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
