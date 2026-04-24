---
title: "Linux High CPU Usage: Step-by-Step Troubleshooting Guide"
date: "2026-04-21"
excerpt: "Step-by-step guide to diagnosing Linux high CPU usage — using ps, top, and htop to identify the culprit, distinguish user vs kernel vs I/O wait CPU, and resolve the issue in production."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
slug: "linux-high-cpu-usage-troubleshooting"
category: "linux"
---

## TL;DR

- High load average does not always mean high CPU — check `%wa` (I/O wait) in top first
- **`ps aux --sort=-%cpu | head -10`** — fastest way to find the CPU culprit
- Press **`1`** in top to see per-core breakdown — one saturated core is easy to miss in aggregate
- `%CPU` in ps is a lifetime average — use top for current spikes
- High `%sy` (kernel CPU) means system call overhead — check for excessive I/O or context switching
- High `%st` (steal time) on a VM means the hypervisor is throttling your instance
- **Never kill -9 first** — identify the cause, then decide

---

## Introduction: Not All High CPU Is the Same

An alert fires: CPU is at 85%. Engineers open `top` and start looking for the process to kill. Half the time, the process they find is not the actual problem — it is a symptom.

**Linux high CPU usage** troubleshooting starts with understanding what kind of CPU usage you are dealing with. User-space CPU (`%us`) is different from kernel CPU (`%sy`), I/O wait (`%wa`), and steal time (`%st`). Each points to a different root cause and a different fix.

This guide walks through the exact steps to diagnose high CPU on a Linux system, with real commands and real scenarios.

---

## Step 1: Get the Overview

Before touching anything, understand the scope.

```bash
# Uptime and load average
uptime
# 15:42:07 up 14 days,  2:31,  3 users,  load average: 6.32, 4.21, 2.87

# How many CPUs do you have?
nproc
grep -c processor /proc/cpuinfo
```

**Interpreting load average:**
- Load average / CPU core count = utilization ratio
- Load 6.32 on 4 cores = 158% — significantly overloaded
- Load 6.32 on 8 cores = 79% — high but not critical

A rising load average (1-min > 15-min) means the system is getting worse. A falling load average means it is recovering.

---

## Step 2: Identify What Kind of CPU Usage

```bash
top
```

Look at the CPU line immediately:

```
%Cpu(s): 78.2 us,  8.1 sy,  0.0 ni, 10.4 id,  2.8 wa,  0.0 hi,  0.5 si,  0.0 st
```

| Reading | What it means | What to do |
|---|---|---|
| High `us` (>70%) | Application consuming CPU | Find which process — next step |
| High `sy` (>20%) | Kernel overhead | Check system calls, context switching |
| High `wa` (>10%) | I/O wait — disk/NFS | Not a CPU problem — check storage |
| High `st` (>5%) | VM steal time | Hypervisor throttling — infrastructure issue |
| Low `id` (<10%) | System near capacity | Prioritize finding the cause |

**Critical insight:** If `%wa` is high and `%id` is also non-trivial, the system is waiting on I/O. Adding CPU or killing processes will not help. The bottleneck is storage.

---

## Step 3: Find the Process Consuming CPU

### Snapshot with ps

```bash
ps aux --sort=-%cpu | head -15
```

This shows the top CPU consumers. The `%CPU` column is averaged over the process lifetime — useful for identifying sustained consumers, but it misses brief spikes.

```bash
# Watch it update every 2 seconds
watch -n 2 'ps aux --sort=-%cpu | head -10'
```

### Live view with top

```bash
top
# P = sort by CPU (should be default)
# Press 1 to see per-core breakdown
```

**Always press `1` in top.** On a multi-core server, a single thread saturating one core shows as 25% in aggregate view on a 4-core system. That 25% does not look alarming — but that thread is completely bottlenecked and all work assigned to it is queued.

```bash
# After identifying the PID in top, monitor it specifically
top -p 1234
```

### Filter by user

```bash
# If you know which service is slow
ps -u appuser -o pid,%cpu,%mem,comm --sort=-%cpu | head -10
```

---

## Step 4: Investigate the High-CPU Process

Once you have the PID, understand what it is doing.

### Check the full command

```bash
ps -p 1234 -o pid,ppid,user,%cpu,stat,cmd
# Shows full command line, not just process name
```

### Check how long it has been running

```bash
ps -p 1234 -o pid,etime,%cpu,comm
# etime shows elapsed time since process started
```

A process that just spiked in the last minute behaves differently from one that has been consuming CPU for hours.

### Check CPU usage breakdown for threads

```bash
# Show individual threads of a multi-threaded process
ps -eLf | grep 1234 | sort -k12 -rn | head -10
# or
top -H -p 1234
# H = thread mode inside top
```

If one thread is consuming 100% and others are idle, you have a single-threaded bottleneck or a deadlock.

### Check what the process is actually doing

```bash
# What system calls is it making?
strace -c -p 1234   # summary mode, 10-30 second window

# If output shows high time in futex: thread contention
# If output shows high time in read/write: I/O bound
# If no syscalls dominate: pure compute in user space
```

```bash
# What is the kernel wait channel?
cat /proc/1234/wchan
# schedule = voluntarily yielding CPU (normal)
# futex = waiting on mutex
# poll_schedule_timeout = waiting on I/O polling
```

---

## Step 5: Correlate With Application Behavior

High CPU is a symptom. The cause is in the application logs.

```bash
# When did CPU spike? Check logs around that time
journalctl -u myapp --since "15:30:00" --until "15:45:00" --no-pager | grep -iE "warn|error|exception"

# Is it processing a large job?
journalctl -u myapp --since "15:30:00" | grep -i "processing\|batch\|job\|queue"
```

**Pattern matching:**
- CPU spike + "batch job started" in logs = expected behavior, not a bug
- CPU spike + "queue backed up" = processing backlog, may need scaling
- CPU spike + no relevant log activity = something unexpected is running

---

## Real Troubleshooting Scenarios

### Scenario 1: Java Process at 200% CPU

```bash
ps aux --sort=-%cpu | head -5
# app  8823  198.4  4.2  ... java -jar service.jar
```

Java at 198% on a 4-core server (50% of total capacity).

```bash
# Check thread breakdown
top -H -p 8823
# Shows: 2 threads at ~99%, rest near 0%
```

Two threads are maxed out. Check Java GC:

```bash
# Check if GC is the problem
journalctl -u myapp | grep -i "gc\|garbage" | tail -20

# Or check JVM metrics if available
# jstat -gcutil 8823 1000 10  (if JDK is installed)
```

High GC activity causes CPU spikes because the JVM is spending time collecting garbage instead of running application code. The fix is usually heap sizing or memory leak investigation.

### Scenario 2: High CPU But No Obvious Process

`top` shows CPU at 80% but no single process over 10%.

```bash
# Check context switching rate
vmstat 1 5
# r  b    cs
# 4  0  8234  <- 8234 context switches/second is high
```

High context switching with many moderate-CPU processes = CPU contention between too many active processes. The system is spending more time switching contexts than doing work.

```bash
# Count R-state processes
ps -eo stat | grep '^R' | wc -l
# If more than 2-3x your core count, you have run queue saturation
```

### Scenario 3: CPU Spike in `%sy` (Kernel Space)

```
%Cpu(s): 12.3 us, 67.4 sy,  0.0 ni, 18.1 id,  1.8 wa
```

67% kernel CPU. The OS itself is doing heavy work.

```bash
# High sy often means excessive system calls — check which process
strace -c -p <top_pid> 2>&1
# If futex dominates: thread lock contention
# If read/write dominates: I/O-heavy app making many small syscalls
# If clone/fork dominates: process spawning excessively
```

High `%sy` from a web server often means too many small I/O operations — sending small packets, writing many tiny files. Batching I/O operations usually resolves it.

### Scenario 4: High Steal Time on a VM

```
%Cpu(s): 15.2 us,  3.1 sy,  0.0 ni, 42.3 id,  0.4 wa,  0.0 hi,  0.2 si, 38.8 st
```

38.8% steal time. The hypervisor is taking 39% of this VM's CPU allocation.

This is an infrastructure problem, not an application problem. The VM is oversubscribed on the hypervisor.

```bash
# Confirm with vmstat
vmstat 1 | awk '{print $15}' | head -10  # st column
```

Actions:
- Move the VM to a less-loaded hypervisor host
- Upgrade to a larger instance type
- Contact cloud provider if on a dedicated instance that should not have steal

---

## What Not To Do

**Do not kill -9 the high-CPU process immediately.**
Understand why it is running hot first. It might be doing legitimate work (batch job, index rebuild, backup). Killing it might:
- Corrupt data mid-write
- Leave lock files that prevent restart
- Cause the parent to respawn it immediately

**Do not restart the service without checking logs.**
If you restart without understanding the cause, it will happen again. Check application logs first.

**Do not add more servers before diagnosing.**
High CPU caused by a bug (infinite loop, N+1 query, GC thrash) scales linearly with more servers — you just have the problem on more machines.

---

## Quick Reference

```bash
# ── OVERVIEW ─────────────────────────────────────────────────────
uptime                              # load average
nproc                               # CPU core count
top                                 # live CPU breakdown

# ── FIND THE CULPRIT ─────────────────────────────────────────────
ps aux --sort=-%cpu | head -10      # snapshot top consumers
top                                 # live, press P then 1
watch -n 2 'ps aux --sort=-%cpu | head -5'  # watch over time

# ── INVESTIGATE ──────────────────────────────────────────────────
top -H -p <pid>                     # thread CPU breakdown
strace -c -p <pid>                  # syscall summary
cat /proc/<pid>/wchan               # kernel wait channel
vmstat 1 5                          # context switch rate

# ── CORRELATE ─────────────────────────────────────────────────────
journalctl -u service --since "HH:MM" --no-pager  # logs around spike time
```

---

## Conclusion

**Linux high CPU usage** is almost always one of: a misbehaving application process, CPU contention between too many processes, I/O wait being mistaken for CPU usage, or hypervisor steal time.

The diagnostic order matters: check what type of CPU usage it is first (`%us` vs `%wa` vs `%sy` vs `%st`), then find which process, then understand why that process is consuming CPU.

**`top` gives you the type. `ps` gives you the process. Logs give you the reason.** Use all three, in that order.

---

*Related reading: [top Command Linux: Real-World Guide](/blog/top-command-linux-guide) — full top guide including CPU line interpretation. [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — ps-based CPU investigation. [Linux Process States Explained](/blog/linux-process-states-guide) — understanding D-state high load.*
