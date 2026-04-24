---
title: "Top Linux Debugging Tools Every Engineer Should Know"
date: "2026-04-21"
excerpt: "The essential Linux debugging tools for production troubleshooting — ps, top, htop, lsof, strace, iotop, vmstat, dmesg, and more — with real use cases and a comparison table."
tags: ["linux", "debugging", "troubleshooting", "monitoring", "infrastructure"]
featured: false
slug: "linux-debugging-tools-guide"
category: "linux"
---

## TL;DR

- **`ps` / `top` / `htop`** — process monitoring (start here for any incident)
- **`lsof`** — what files and sockets does a process have open?
- **`strace`** — what system calls is a process making?
- **`ss` / `netstat`** — what ports are open? what connections exist?
- **`iotop`** — which process is hammering disk I/O?
- **`vmstat`** — CPU, memory, swap, and I/O at a system level
- **`dmesg`** — kernel messages: disk errors, OOM kills, driver issues
- **`tcpdump`** — capture network traffic at the packet level
- **`perf`** — CPU profiling and performance analysis
- Master these 10 tools and you can diagnose the vast majority of Linux production issues

---

## Introduction: The Right Tool for the Right Problem

A production incident is not the time to learn a new tool. **Linux debugging tools** work as a layered system — you start broad with `top` or `ps`, narrow down to a process with `lsof` and `strace`, verify network state with `ss`, and check the kernel with `dmesg`.

This guide covers the tools that matter most in real incidents, what each one is for, and how to use them together.

---

## Tool 1: ps — Process Snapshot

**What it does:** Takes a snapshot of the process table. Shows all running processes with CPU, memory, state, and parent PID.

**When to use:** First tool in any incident. Is the process running? What state is it in? Who owns it?

```bash
# All processes sorted by CPU
ps aux --sort=-%cpu | head -10

# Full command with parent PID
ps -ef | grep myapp

# Custom columns
ps -eo pid,ppid,user,%cpu,%mem,stat,comm --sort=-%cpu
```

**Key insight:** The `STAT` column tells you more than just whether the process is alive. `D` state means I/O blocked (cannot be killed). `Z` means zombie (already dead, parent not reaping).

> *See also: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide)*

---

## Tool 2: top — Live Process Monitor

**What it does:** Auto-refreshing view of CPU, memory, load average, and processes sorted by resource usage.

**When to use:** When you need to watch what is happening over time, not just at a single moment.

```bash
top           # launch
# Inside top:
# 1 = per-core CPU
# M = sort by memory
# P = sort by CPU
# k = kill process
# o = filter (%CPU>5.0)
```

**Key insight:** Load average in the top-right. If load > number of CPU cores, the system is overloaded. High load + low `%cpu us` + high `%wa` = I/O bottleneck, not a CPU problem.

> *See also: [top Command Linux: Real-World Guide](/blog/top-command-linux-guide)*

---

## Tool 3: htop — Better top

**What it does:** Same as `top` but with visual CPU bars, mouse support, search, and a better kill UI.

**When to use:** On managed servers where you have installed it. Faster to navigate than `top` in complex situations.

```bash
apt install htop
htop
# / = search, F4 = filter, F5 = tree view, F9 = kill menu
```

> *See also: [htop vs top: Which Should You Use?](/blog/htop-vs-top-linux-comparison)*

---

## Tool 4: lsof — Open Files and Sockets

**What it does:** Lists every file, socket, pipe, and device a process has open. "Everything is a file" — this tool makes it literal.

**When to use:**
- What network connections does this process have?
- What files is it reading or writing?
- Which process has a specific port open?
- Who has a file locked?

```bash
# All open files for a process
lsof -p 1234

# Network connections for a process
lsof -p 1234 -i

# Who is using port 8080?
lsof -i :8080

# What files does nginx have open?
lsof -c nginx

# Who has a specific file open?
lsof /var/log/app.log

# Count open FDs for a process (leak detection)
ls /proc/1234/fd | wc -l
```

**Key insight:** FD (file descriptor) count climbing over time = file descriptor leak. Default limit is 1024. Check with `cat /proc/<pid>/limits | grep "open files"`.

---

## Tool 5: strace — System Call Tracer

**What it does:** Intercepts every system call a process makes and logs it. Shows exactly what a process is doing at the kernel boundary.

**When to use:**
- Process is hung and logs say nothing
- Application fails to start with a cryptic error
- Need to find what files an app is trying to open
- Need to verify what network connections are being attempted

```bash
# Attach to running process
strace -p 1234

# Filter to file operations only
strace -e trace=file -p 1234

# Summary mode (low overhead)
strace -c -p 1234   # Ctrl+C after 10-30 seconds

# Find permission errors
strace -e trace=file -p 1234 2>&1 | grep "= -1"
```

**Key insight:** Always use `-e trace=` to filter in production. Unfiltered strace on a busy process can slow it by 50%.

> *See also: [strace Tutorial: Debug Linux Processes Like a Pro](/blog/strace-tutorial-linux-debugging)*

---

## Tool 6: ss — Socket Statistics

**What it does:** Shows all network sockets — listening ports, active connections, connection state. Modern replacement for `netstat`.

**When to use:**
- Is the service actually listening on the expected port?
- What is bound to all interfaces vs localhost?
- How many connections does this service have?

```bash
# Listening TCP ports with process
ss -tlnp

# All established connections
ss -tnp state established

# Specific port
ss -tlnp | grep :8080

# Connection count to a service
ss -tnp state established dport :443 | wc -l

# Socket summary
ss -s
```

> *See also: [Check Open Ports in Linux: ss vs netstat Explained](/blog/check-open-ports-linux-ss-netstat)*

---

## Tool 7: iotop — I/O Monitor per Process

**What it does:** Shows disk I/O usage per process in real time. Like `top` but for disk instead of CPU.

**When to use:**
- Disk utilization is high but you do not know which process
- Application is slow and you suspect I/O
- After seeing high `%wa` in `top`

```bash
# Install
apt install iotop
dnf install iotop

# Show only processes doing I/O
iotop -o

# Non-interactive, one snapshot
iotop -b -n 1 -o

# Monitor a specific PID
iotop -p 1234
```

**Key insight:** High `%wa` in `top` means I/O wait. `iotop -o` immediately shows which process is responsible.

---

## Tool 8: vmstat — Virtual Memory Statistics

**What it does:** Reports system-level CPU, memory, swap, and I/O statistics on a per-interval basis.

**When to use:**
- Is the system swapping? (check `si`/`so` columns)
- How many context switches per second? (check `cs`)
- Overall CPU breakdown without opening top

```bash
# Update every 2 seconds
vmstat 2

# With timestamps
vmstat 2 -t

# Output:
# procs  --------memory--------  ---swap--  ---io---  --system--  ------cpu-----
#  r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs  us sy id wa
#  2  0      0 8142456 234196 4123456   0    0     0    48  234  456  12  3 84  1
```

Key columns:
- **`r`** — processes waiting for CPU (runqueue)
- **`b`** — processes in uninterruptible sleep (D state count)
- **`si`/`so`** — swap in/out (non-zero = memory pressure)
- **`wa`** — CPU wait for I/O (%)
- **`cs`** — context switches per second

**Key insight:** `si`/`so` both non-zero = system is actively swapping. This is a memory problem that will degrade performance significantly.

---

## Tool 9: dmesg — Kernel Ring Buffer

**What it does:** Shows messages from the kernel — hardware errors, OOM kills, driver issues, filesystem errors.

**When to use:**
- A process was killed unexpectedly (check for OOM killer)
- Disk errors or filesystem corruption
- Hardware problems (NIC errors, disk controller issues)
- System rebooted unexpectedly

```bash
# Recent kernel messages
dmesg | tail -50

# With human-readable timestamps
dmesg -T | tail -50

# Filter to errors
dmesg -l err,crit,alert,emerg

# Watch live
dmesg -w

# Check for OOM kills
dmesg | grep -i "oom\|killed process\|out of memory"

# Check for disk errors
dmesg | grep -iE "error|fail|I/O error|ata[0-9]"

# Check for filesystem errors
dmesg | grep -iE "ext4|xfs|btrfs|corrupt"
```

**Key insight:** If a process disappeared without a log entry, check `dmesg` for OOM killer activity. The kernel logs exactly which process it killed and why.

```bash
# Find OOM kills
dmesg | grep -A5 "oom_kill_process\|Killed process"
# Shows: which process, how much memory it had, why the kernel killed it
```

---

## Tool 10: tcpdump — Packet Capture

**What it does:** Captures network packets at the interface level. The ground truth of what is actually on the wire.

**When to use:**
- Application says it sent a request but the server denies receiving it
- Debugging protocol-level issues
- Verifying that firewall rules are working correctly
- Diagnosing TLS/SSL handshake failures

```bash
# Capture traffic on port 8080
tcpdump -i any -n port 8080

# Capture and write to file (analyze later with Wireshark)
tcpdump -i eth0 -w /tmp/capture.pcap port 8080

# Capture traffic to/from a specific host
tcpdump -i any host 10.0.1.50

# Capture HTTP traffic (show content)
tcpdump -i any -A port 80 | head -100

# Just connection attempts (SYN packets)
tcpdump -i any 'tcp[tcpflags] & tcp-syn != 0'
```

**Key insight:** If `ss` shows established connections but the application is not receiving data, `tcpdump` shows whether packets are actually arriving at the interface.

---

## Tool Comparison Table

| Tool | Primary Use | Overhead | Requires Install |
|---|---|---|---|
| `ps` | Process snapshot | None | No |
| `top` | Live process monitor | Negligible | No |
| `htop` | Better top | Negligible | Yes |
| `lsof` | Open files/sockets | Low | Usually no |
| `strace` | System call trace | **High** | Usually no |
| `ss` | Network sockets | None | No |
| `iotop` | Disk I/O per process | Low | Yes |
| `vmstat` | System-level stats | None | No |
| `dmesg` | Kernel messages | None | No |
| `tcpdump` | Packet capture | Low-Medium | Usually no |

---

## Debugging Workflow: Which Tool When

```
Service is slow or down
│
├─ Is the process running?
│   ps aux | grep service
│   → Not running: check systemctl status, journalctl
│   → Running: continue
│
├─ What state is the process in? (STAT column)
│   ps -p <pid> -o stat
│   → D state: I/O problem → check iotop, dmesg
│   → Z state: zombie → check parent process
│   → R state: high CPU → use top, strace -c
│
├─ Is it consuming resources?
│   top (CPU), ps aux --sort=-%mem (memory)
│   → High CPU: strace -c to find syscall, then top -H for threads
│   → High memory: track RSS over time, check for leak
│
├─ Network problem?
│   ss -tlnp (is it listening?)
│   lsof -p <pid> -i (what connections?)
│   tcpdump port <N> (are packets arriving?)
│
├─ File/permission problem?
│   strace -e trace=file -p <pid> 2>&1 | grep "= -1"
│   lsof -p <pid>
│
└─ Kernel/hardware problem?
    dmesg -T | tail -50
```

---

## Quick Reference Card

```bash
# PROCESS
ps aux --sort=-%cpu | head -10  # top CPU
ps -eo pid,stat,comm | grep ' D' # D-state processes
top / htop                       # live view

# FILES AND SOCKETS
lsof -p <pid>                    # all open files
lsof -i :8080                    # who uses port 8080
ss -tlnp                         # listening ports

# SYSTEM CALLS
strace -c -p <pid>               # summary (safe)
strace -e trace=file -p <pid>    # file ops
strace -p <pid> 2>&1 | grep -1   # failures

# DISK I/O
iotop -o                         # processes doing I/O
vmstat 2                         # system I/O stats

# KERNEL
dmesg | grep -i oom              # OOM kills
dmesg | grep -iE "error|fail"    # hardware errors

# NETWORK
tcpdump port 8080                # packet capture
ss -tnp state established        # active connections
```

---

## Conclusion

These 10 tools cover the diagnostic space for the vast majority of Linux production incidents. The skill is not memorizing every flag — it is knowing which tool answers which question, and using them in the right order.

**Start broad with `ps` and `top`. Narrow to a process with `lsof` and `strace`. Verify network state with `ss`. Check the kernel with `dmesg`.** Each tool is a layer of the onion — peel until you find the root cause.

---

*Related reading: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — deep dive on ps. [strace Tutorial: Debug Linux Processes Like a Pro](/blog/strace-tutorial-linux-debugging) — full strace guide. [Linux Log Analysis](/blog/linux-log-analysis-debugging-guide) — correlating tool output with logs.*
