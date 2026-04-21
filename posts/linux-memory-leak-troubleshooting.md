---
title: "Linux Memory Leak Troubleshooting: RSS vs VSZ Explained"
date: "2026-04-21"
excerpt: "How to troubleshoot memory leaks on Linux — understanding RSS vs VSZ, tracking memory growth over time, identifying the leaking process, and real debugging steps from production systems."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
slug: "linux-memory-leak-troubleshooting-rss-vsz"
---

## TL;DR

- **RSS (Resident Set Size)** = actual physical RAM the process is using — **this is the number that matters**
- **VSZ (Virtual Size)** = virtual address space including shared libs and unmapped memory — almost always misleadingly large, ignore it
- A memory leak is confirmed when **RSS grows consistently over time without leveling off**
- `ps aux --sort=-%mem` sorts by `%MEM` which is based on RSS — use this first
- Track RSS over time with a simple loop: `while true; do ps -p <pid> -o rss=; sleep 60; done`
- `avail Mem` in top/free — not `free` — is the real available memory
- OOM killer in `dmesg` is the last-resort symptom: the kernel already killed something

---

## Introduction: Memory Leaks in Production

Memory usage climbs over hours. By midnight, the service starts responding slowly. By 3am, it is OOM-killed and restarted. By the next afternoon, it is climbing again.

**Memory leaks in Linux** are slow, insidious, and often go unnoticed until they cause an outage. The reason: Linux memory management is designed to use all available RAM productively, so memory usage naturally being high is expected. A leak is specifically when memory is allocated but never freed — and the only reliable way to detect it is tracking RSS over time.

This guide covers exactly how to do that.

---

## Understanding RSS vs VSZ

This is the most important concept for memory leak troubleshooting on Linux. Getting it wrong leads to false alarms and missed leaks.

### VSZ — Virtual Memory Size

```bash
ps aux | head -2
# USER  PID  %CPU %MEM    VSZ   RSS ...
# app  1234   2.1  4.2  4194304  65536 ...
#                         4GB    64MB
```

VSZ is the total virtual address space the process has mapped. This includes:
- The application binary itself
- Shared libraries (libc, libssl, etc.) — mapped by the kernel but shared across all processes
- Memory that has been `mmap`'d but not yet accessed
- Heap allocations that have been requested but not touched (lazy allocation)
- Memory-mapped files

A Java process will typically show VSZ of 4–8GB even when it is using only 400MB of actual RAM. This is normal — the JVM reserves large virtual address space for heap management.

**VSZ is not a useful indicator of memory pressure. Do not alert on it.**

### RSS — Resident Set Size

RSS is the actual physical RAM currently occupied by the process. This is:
- Pages that are actively loaded in RAM
- Not shared with other processes (though some pages, like shared library code, are shared — RSS double-counts these, but it is still a better indicator than VSZ)

**RSS is the number to watch for memory leak detection.**

A process with RSS growing from 400MB to 4GB over 24 hours has a memory leak. A process with VSZ of 8GB and RSS of 400MB is perfectly normal.

### The Memory Columns in ps

```bash
ps aux | awk 'NR==1 || NR<=5'
```

| Column | Full name | What it measures | Use for leaks? |
|---|---|---|---|
| `VSZ` | Virtual Set Size | Total virtual address space | ❌ No |
| `RSS` | Resident Set Size | Physical RAM in use | ✅ Yes |
| `%MEM` | Memory percent | RSS as % of total RAM | ✅ Yes |

---

## Reading Memory in top and free

### top Memory Section

```
MiB Mem :  15258.9 total,    423.1 free,   9842.6 used,   4993.2 buff/cache
MiB Swap:   4096.0 total,   3841.2 free,    254.8 used.   4832.5 avail Mem
```

| Field | What it means |
|---|---|
| `total` | Physical RAM installed |
| `free` | Completely unused RAM |
| `used` | RAM used by processes |
| `buff/cache` | RAM used for disk cache (reclaimable) |
| `avail Mem` | **RAM available for new allocations** |

**`avail Mem` is the number that matters.** The kernel uses unused RAM for disk cache (`buff/cache`), which it reclaims when processes need more memory. `free` alone is misleading — a system with `free: 200MB` and `avail Mem: 5GB` has plenty of memory. A system with `free: 200MB` and `avail Mem: 300MB` is running low.

```bash
# Check available memory
free -h
# Or
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|Cached|SwapUsed"
```

### Swap as a Warning Sign

```bash
free -h | grep Swap
# Swap:         4.0Gi       255Mi       3.8Gi
```

`255Mi used` of swap means the system has needed to swap memory out at some point. It could be historical. What matters is the trend:

```bash
# Watch swap usage over time
watch -n 5 'free -h | grep Swap'
```

If swap usage is growing, memory pressure is increasing. The system will degrade before hitting OOM.

---

## Step-by-Step Memory Leak Detection

### Step 1: Identify the Suspicious Process

```bash
# Sort by memory (RSS-based)
ps aux --sort=-%mem | head -15

# Or in top, press M to sort by memory
top
```

Look for:
- Processes with high `%MEM`
- Processes where `RSS` seems large relative to what the application should use
- Multiple instances of the same application where one has significantly higher RSS

### Step 2: Establish a Baseline

Before concluding there is a leak, get a baseline.

```bash
PID=1234
ps -p $PID -o pid,rss,vsz,comm
# PID   RSS      VSZ    COMMAND
# 1234  65536    4194304 java
```

Note the RSS value. Note the time.

### Step 3: Track RSS Over Time

```bash
PID=1234

# Track every minute for an hour
while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  RSS=$(ps -p $PID -o rss= | tr -d ' ')
  echo "$TIMESTAMP RSS: ${RSS} KB ($(( RSS / 1024 )) MB)"
  sleep 60
done | tee /tmp/memory_track.log
```

What to look for:
- **RSS grows consistently** without plateauing → memory leak
- **RSS grows then stabilizes** → expected behavior (caching, connection pools warming up)
- **RSS grows and shrinks** → normal garbage collection or cache eviction
- **RSS grows in steps** → batch processing or load-correlated — not necessarily a leak

```bash
# Quick analysis of the tracking log
awk '{print NR, $NF}' /tmp/memory_track.log | tail -20
```

### Step 4: Calculate the Rate

```bash
# From tracking log, get first and last RSS
head -1 /tmp/memory_track.log
tail -1 /tmp/memory_track.log

# If RSS grew from 400MB to 600MB over 60 minutes:
# Growth rate: ~3.3 MB/minute
# Time to exhaust 8GB available: (8000-600) / 3.3 = ~2242 minutes = ~37 hours
```

Extrapolating the growth rate tells you how urgent the fix is.

### Step 5: Compare Across Instances

If you run multiple instances of the same service, compare their RSS:

```bash
ps aux | grep -v grep | grep myapp | awk '{print $2, $6/1024 "MB", $11}' | sort -k2 -rn
# 8823  1842MB  java -jar service.jar   ← this one is leaking
# 8901   412MB  java -jar service.jar
# 8902   408MB  java -jar service.jar
```

The instance with significantly higher RSS — especially the longest-running one — is your leak candidate.

---

## Real Production Scenarios

### Scenario 1: Java Heap Leak

RSS climbing 50MB per hour on a Java service.

```bash
# Confirm the process and RSS
ps -p 8823 -o pid,rss,vsz,comm
# Attach jmap if JDK is available
jmap -histo 8823 | head -30
# Shows top heap-consuming classes
```

Top Java memory leak causes:
- Objects cached in static collections (HashMap, List) without eviction policy
- ThreadLocal variables not cleaned up
- Event listeners registered but never removed
- Connection pools growing without bound

```bash
# Check JVM heap with jstat
jstat -gcutil 8823 1000 10
# If 'OU' (Old generation Used) grows every 10 seconds and GC doesn't reclaim it: heap leak
```

### Scenario 2: C/C++ Application — File Descriptor Leak Causing Memory Growth

RSS climbing but slowly — 5MB per day.

```bash
# Check file descriptor count
ls /proc/8823/fd | wc -l

# Watch it grow
watch -n 5 'ls /proc/8823/fd | wc -l'
```

If FD count grows with RSS, it is a file descriptor leak — open files accumulate memory in the kernel. Each open file descriptor holds kernel buffers.

```bash
# What file types are leaking?
ls -la /proc/8823/fd | awk '{print $NF}' | grep -oE '\.(log|sock|pipe|anon)' | sort | uniq -c
```

### Scenario 3: OOM Kill — Post-Mortem

Service was OOM-killed. Memory appears normal now after restart. What happened?

```bash
# Check kernel messages for OOM kill
dmesg | grep -A10 "oom_kill_process\|Out of memory\|Killed process"

# Output includes:
# [timestamp] Out of memory: Killed process 8823 (java) total-vm:8192000kB, anon-rss:7500000kB
# Shows: which process, virtual size, and actual RSS at time of kill
```

```bash
# Check if it happened before (previous boots)
journalctl -k --since "7 days ago" | grep -i "oom\|killed\|out of memory"
```

The OOM message shows you exactly how much memory the killed process had. Compare that to normal RSS — if it was 10x normal, you have a confirmed leak.

### Scenario 4: Memory Leak in Node.js

```bash
# Track RSS for a Node process
NODE_PID=$(pgrep -f "node server.js")
while true; do
  echo "$(date): $(ps -p $NODE_PID -o rss= | tr -d ' ') KB"
  sleep 30
done | tee /tmp/node_mem.log
```

Node.js specific investigation:

```bash
# Check if V8 heap dump is enabled
# Trigger heap snapshot (if --inspect enabled)
kill -USR2 $NODE_PID  # sends SIGUSR2, triggers heap dump in some configurations
```

Common Node.js memory leak causes:
- Event listeners accumulating (`EventEmitter` without `removeListener`)
- Closures holding references to large objects
- Global caches without size limits
- Timers (`setInterval`) not cleared

---

## Distinguishing a Leak from Normal Growth

Not every RSS increase is a leak.

| Pattern | Interpretation |
|---|---|
| RSS grows then flatlines | Normal — application reached steady state |
| RSS grows proportionally with active connections | Normal — connection pool or per-connection buffers |
| RSS grows overnight and drops after restart | Likely leak |
| RSS grows and never comes back down, even under no load | Confirmed leak |
| RSS growing in multiple instances, oldest has highest RSS | Confirmed leak (age-correlated) |

**The key test:** Reduce load to near zero. Does RSS still grow or hold steady? If it grows under no load, it is a leak, not load-driven growth.

---

## Quick Reference

```bash
# ── FIND HIGH MEMORY PROCESSES ───────────────────────────────────
ps aux --sort=-%mem | head -10
top  # press M

# ── CHECK SPECIFIC PROCESS ────────────────────────────────────────
ps -p <pid> -o pid,rss,vsz,%mem,comm

# ── TRACK OVER TIME ───────────────────────────────────────────────
while true; do echo "$(date): $(ps -p <pid> -o rss= | tr -d ' ') KB"; sleep 60; done

# ── SYSTEM MEMORY ─────────────────────────────────────────────────
free -h                              # overview
cat /proc/meminfo | grep MemAvailable # available RAM
top  # avail Mem in header

# ── OOM INVESTIGATION ─────────────────────────────────────────────
dmesg | grep -i "oom\|killed process"
journalctl -k | grep -i "out of memory"

# ── FILE DESCRIPTOR CHECK ─────────────────────────────────────────
ls /proc/<pid>/fd | wc -l            # current FD count
cat /proc/<pid>/limits | grep "open files"  # FD limit
```

---

## Conclusion

**Memory leak troubleshooting in Linux** starts with one rule: ignore VSZ, track RSS.

RSS is actual physical RAM. A process that grows RSS consistently — especially under low load, especially correlated with uptime rather than traffic — has a memory leak. Extrapolate the growth rate, estimate time to OOM, and plan accordingly.

The tools are simple: `ps aux --sort=-%mem` to find the candidate, a tracking loop to confirm the trend, `dmesg` to investigate OOM kills after the fact. The hard part is not the tooling — it is distinguishing a genuine leak from normal memory growth and pressure.

**RSS grows and never comes back down: that is your leak.**

---

*Related reading: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — using ps for memory investigation. [Linux High CPU Usage: Step-by-Step Troubleshooting](/blog/linux-high-cpu-usage-troubleshooting) — when the problem is CPU, not memory. [Linux Debugging Tools Every Engineer Should Know](/blog/linux-debugging-tools-guide) — full toolkit overview.*
