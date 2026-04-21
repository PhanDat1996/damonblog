---
title: "strace Tutorial: Debug Linux Processes Like a Senior Engineer"
date: "2026-04-21"
excerpt: "A practical strace tutorial for production debugging — trace system calls, diagnose hung processes, find missing files, and debug permission errors with real command examples and incident workflows."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "strace-tutorial-linux-debugging"
---

## TL;DR

- **`strace`** intercepts and logs every system call a process makes
- Use it when logs say nothing and the debugger is not an option
- **`strace -p <pid>`** — attach to a running process
- **`strace -e trace=file`** — filter to file-related calls only
- **`strace -c`** — summary mode, shows call counts and time spent
- **`strace -f`** — follow child processes (needed for multi-process apps)
- Overhead is real — strace slows the traced process. Use it in production carefully.
- For a quick look at what a process is doing, `-c` with a 10-second window is low-risk

---

## Introduction: When Logs Tell You Nothing

A process is hung. The application log shows the last successful request 20 minutes ago, then silence. No errors, no stack traces, nothing. `ps` shows it is alive and in `S` state. Restarting it fixes the problem temporarily, but it hangs again within hours.

This is exactly when you reach for **strace**.

`strace` sits between your process and the Linux kernel, recording every system call — every file open, every network read, every memory allocation, every signal. It shows you what a process is actually doing at the kernel level, regardless of what the application thinks it is doing or what it is logging.

This strace tutorial covers how to attach it, what to look for, and how to use it during real production incidents without causing more problems.

---

## What Is strace?

Every meaningful thing a user-space process does goes through the kernel via system calls: reading files, writing to sockets, allocating memory, creating threads, receiving signals. `strace` uses the `ptrace` system call to intercept these calls and log them.

```bash
# Basic: trace a new process from start
strace ls /tmp

# Attach to running process by PID
strace -p 1234

# Install if not present
apt install strace     # Ubuntu
dnf install strace     # RHEL/Fedora
```

Output format:
```
openat(AT_FDCWD, "/etc/app/config.yml", O_RDONLY) = 3
read(3, "server:\n  port: 8080\n", 4096)  = 21
close(3)                                   = 0
```

Each line shows: `syscall(arguments) = return_value`

A return value of `-1` with an error code means the call failed:
```
openat(AT_FDCWD, "/etc/app/secret.key", O_RDONLY) = -1 ENOENT (No such file or directory)
```

---

## Essential strace Flags

### Attach to a Running Process

```bash
strace -p 1234
```

This is what you use in production — attach to an already-running process. You do not need to restart it.

### Follow Child Processes

```bash
strace -f -p 1234
```

Without `-f`, you only see the main process. Most production applications fork workers. `-f` follows all children. Essential for multi-threaded applications and anything that forks.

### Filter to Specific System Call Categories

```bash
# File operations only (open, read, write, close, stat)
strace -e trace=file -p 1234

# Network operations only
strace -e trace=network -p 1234

# Process management (fork, exec, exit, wait)
strace -e trace=process -p 1234

# Memory operations (mmap, mprotect, brk)
strace -e trace=memory -p 1234

# Signal handling
strace -e trace=signal -p 1234

# Specific calls only
strace -e trace=read,write,openat -p 1234
```

Filtering is critical in production — unfiltered strace on a busy process generates thousands of lines per second.

### Summary Mode — Low Overhead, High Value

```bash
# Run for 10 seconds, then show summary
strace -c -p 1234
# Press Ctrl+C after 10 seconds

# Output:
# % time     seconds  usecs/call     calls    errors syscall
# ------ ----------- ----------- --------- --------- ----------------
#  45.23    0.023481         234       100        12 futex
#  30.12    0.015643          15      1023           read
#  15.34    0.007965          79       100           write
```

`-c` is the lowest-overhead option. It counts calls and measures time without logging each one. Use it to identify which category of syscall is consuming time, then follow up with a targeted `-e trace=` filter.

### Timestamps

```bash
# Absolute timestamps
strace -t -p 1234

# Time since first syscall (useful for measuring durations)
strace -r -p 1234

# Time spent in each call (microseconds)
strace -T -p 1234
```

`-T` is valuable for finding slow syscalls. If `read()` is taking 2 seconds, that is a blocking I/O call you can investigate.

### Write Output to File

```bash
# Write strace output to file (not terminal)
strace -o /tmp/strace_output.txt -p 1234

# Follow children, each to separate files
strace -f -o /tmp/trace -p 1234
# Creates /tmp/trace.1234, /tmp/trace.1235, etc.
```

Always write to file in production. Terminal output is lossy, especially on fast processes.

---

## Real Debugging Scenarios

### Scenario 1: Process Hangs — What Is It Waiting On?

Process is stuck. PID is 8823. `ps` shows state `S`.

```bash
strace -p 8823
```

Output immediately shows:
```
futex(0x7f3a2c001234, FUTEX_WAIT, 1, NULL
```

The process is blocked on a futex — a mutex or semaphore. Something it is waiting to lock is held by another thread or process.

```bash
# Find who holds the lock
strace -f -p 8823 2>&1 | grep -E "futex|LOCK"

# Or check with gdb if available
gdb -p 8823 -ex "thread apply all bt" -batch
```

If `futex` with `NULL` timeout means it is waiting indefinitely. This is a deadlock or a lock held by a crashed process.

### Scenario 2: Application Fails to Start — Missing File or Permission

New deployment. Application fails immediately. Log says "initialization failed" with no details.

```bash
strace -e trace=file ./myapp 2>&1 | grep -E "ENOENT|EACCES|EPERM"
```

Output:
```
openat(AT_FDCWD, "/etc/myapp/config.yml", O_RDONLY) = -1 ENOENT (No such file or directory)
openat(AT_FDCWD, "/etc/myapp/config.yaml", O_RDONLY) = -1 ENOENT (No such file or directory)
openat(AT_FDCWD, "/opt/myapp/config.yml", O_RDONLY) = 3
```

The application tried two config paths before finding a third. If you are deploying to a new path structure, the first two fail silently. Without strace, you would never know the application was looking in multiple places.

Common errors to grep for:
```bash
strace -e trace=file -p <pid> 2>&1 | grep -E "= -1"
```

| Error | Meaning |
|---|---|
| `ENOENT` | File or directory does not exist |
| `EACCES` | Permission denied |
| `EPERM` | Operation not permitted (capability or ownership) |
| `ENOTSUP` | Operation not supported |
| `ETIMEDOUT` | Network/socket timeout |
| `ECONNREFUSED` | Connection refused |

### Scenario 3: High CPU — What Is the Process Doing?

A process is consuming 80% CPU. The application team says "we don't know why."

```bash
# Summary mode first — identify the syscall category
strace -c -p <pid>
# Run for 30 seconds, Ctrl+C
```

If the top syscall by time is `futex`:
- Thread contention — check thread count with `ps -eLf | grep <pid>`

If the top syscall is `read` or `write` with high count:
- Heavy I/O — check what file descriptors: `lsof -p <pid>`

If no syscalls dominate and CPU is in `%us`:
- Pure compute in user space — no syscall-level fix. Profile at application level.

```bash
# See what it is reading/writing
strace -e trace=read,write -T -p <pid> 2>&1 | head -30
```

### Scenario 4: Network Connection Debugging

Service cannot connect to a database. Error is generic: "connection failed."

```bash
strace -e trace=network -p <pid> 2>&1 | grep -E "connect|recv|send"
```

Output:
```
connect(5, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("10.0.1.50")}, 16) = -1 ETIMEDOUT
```

The process is trying to connect to `10.0.1.50:5432` (PostgreSQL) and getting a timeout. Now you know:
- The exact destination IP and port
- The error is ETIMEDOUT (not ECONNREFUSED — server is not there at all, or firewall is dropping packets)

```bash
# Verify from the command line
nc -zv 10.0.1.50 5432
```

### Scenario 5: Finding What Files an Application Writes

Audit requirement: what files does this application write to?

```bash
strace -e trace=openat,creat,write -f -p <pid> -o /tmp/file_writes.txt 2>&1 &
# Let it run for a few minutes
kill %1  # stop strace

grep 'O_WRONLY\|O_RDWR\|O_CREAT' /tmp/file_writes.txt | grep -v '= -1'
```

This gives you a list of every file the process opened for writing during the trace period.

---

## Performance Overhead and Production Safety

`strace` has real overhead. The `ptrace` mechanism stops the process on every system call to record it. On a busy process making thousands of syscalls per second, this can slow it down by 50–100%.

**Safe usage patterns in production:**

```bash
# SAFE: summary mode, short window
strace -c -p <pid>  # 10-30 seconds, then Ctrl+C

# SAFE: filtered trace, low-volume process
strace -e trace=file -p <pid>  # only if process makes few file calls

# RISKY: full unfiltered trace on busy process
strace -p <pid>  # can significantly slow a production service

# SAFEST: trace on a copy in staging, not production
```

**Always have a way to detach:**
- `Ctrl+C` detaches strace but leaves the process running normally
- The traced process continues after strace exits

```bash
# Detach strace from a process without killing it
# Just Ctrl+C in the strace terminal — the process keeps running
```

---

## strace vs Other Tools

| Tool | Use case |
|---|---|
| `strace` | What syscalls is the process making? |
| `lsof` | What files/sockets does the process have open right now? |
| `ss` / `netstat` | What network connections does the process have? |
| `gdb` | What is the application-level call stack? |
| `perf` | Which code paths are consuming CPU? |
| `ltrace` | What library calls is the process making? |

Use `strace` when you need to know what the process is doing at the kernel boundary. Use `lsof` when you want to see the current state of open file descriptors without the overhead of tracing.

> *For `lsof` and `ss` usage in production, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging).*

---

## Quick Reference

```bash
# ── ATTACH ───────────────────────────────────────────────────────
strace -p <pid>                    # attach to running process
strace -f -p <pid>                 # follow children too
strace command                     # trace from start

# ── FILTER ───────────────────────────────────────────────────────
strace -e trace=file -p <pid>      # file operations
strace -e trace=network -p <pid>   # network operations
strace -e trace=process -p <pid>   # fork/exec/exit
strace -e trace=read,write -p <pid> # specific calls

# ── OUTPUT ───────────────────────────────────────────────────────
strace -o /tmp/out.txt -p <pid>    # write to file
strace -c -p <pid>                 # summary mode (low overhead)
strace -T -p <pid>                 # show time per call
strace -t -p <pid>                 # show timestamps

# ── FIND FAILURES ─────────────────────────────────────────────────
strace -e trace=file -p <pid> 2>&1 | grep "= -1"   # all failed calls
strace -e trace=file -p <pid> 2>&1 | grep ENOENT   # missing files
strace -e trace=file -p <pid> 2>&1 | grep EACCES   # permission denied
```

---

## Conclusion

`strace` is the tool you reach for when the application has stopped telling you anything useful. It bypasses application-level abstractions and shows you exactly what the process is doing at the system call level.

The most important skill with strace is filtering. Unfiltered output on a busy process is overwhelming. Start with `-c` to find which syscall category dominates, then drill down with `-e trace=` to get actionable output.

**Use it carefully in production** — the overhead is real. Short windows, filtered traces, and summary mode are your safe patterns.

---

*Related reading: [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — combining strace with lsof and ss for full process investigation. [Linux Process States Explained](/blog/linux-process-states-guide) — understanding D and S states that strace helps diagnose.*
