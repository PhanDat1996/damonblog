---
title: "Linux Performance Troubleshooting: Complete Engineer's Guide"
date: "2026-04-21"
excerpt: "The complete guide to Linux performance troubleshooting — CPU, memory, disk I/O, process states, and network — with step-by-step workflows, real production scenarios, and links to deep-dive articles on every topic."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: true
slug: "linux-performance-troubleshooting-guide"
---

# Linux Performance Troubleshooting: Complete Engineer's Guide

## TL;DR

- **Start with `top`** — get situational awareness in 30 seconds
- **Load average > core count** = overloaded. Check `%wa` vs `%us` to know if it is I/O or CPU
- **High load + low CPU = I/O wait** — check disk, NFS, look for D-state processes
- **Memory**: always track RSS not VSZ; `avail Mem` not `free`
- **Process state** tells you more than CPU/memory — `D` state cannot be killed, `Z` is already dead
- This guide links to deep-dive articles on every topic

---

## Introduction

Performance problems in Linux production systems follow predictable patterns. CPU spikes, memory leaks, disk I/O bottlenecks, zombie process accumulation — each has a diagnostic path and a fix.

This guide is the entry point. It maps the diagnostic workflow and links to detailed articles on each tool and scenario. If you are mid-incident, use the decision tree below to find the right section fast.

---

## Quick Diagnostic Decision Tree

```
System is slow / alerts firing
│
├─ Step 1: uptime → load average
│   Load > core count?
│   └─ Yes: system is overloaded → Step 2
│   └─ No: load is fine → check application-level
│
├─ Step 2: top → CPU breakdown
│   High %wa (>10%)?  → I/O problem → check disk/NFS
│   High %us (>70%)?  → application CPU → Step 3
│   High %sy (>20%)?  → kernel overhead → check syscalls
│   High %st (>5%)?   → VM steal time → infrastructure issue
│
├─ Step 3: ps aux --sort=-%cpu | head -10
│   Find the process → check its STAT column
│   STAT = D?  → I/O blocked, cannot kill → fix I/O source
│   STAT = Z?  → zombie, find parent
│   STAT = R?  → running → investigate with strace -c
│
└─ Step 4: correlate with logs
    journalctl -u <service> --since "N minutes ago"
```

---

## 1. CPU Troubleshooting

### Check CPU type first

```bash
top
# Look at: %us %sy %wa %st
```

| High value | Meaning | Next step |
|---|---|---|
| `%us` | Application CPU | Find which process with `ps aux --sort=-%cpu` |
| `%wa` | I/O wait | Check disk with `iotop -o`, look for D-state |
| `%sy` | Kernel/syscall | Check with `strace -c` on top process |
| `%st` | VM steal time | Infrastructure problem, escalate |

### Find the CPU consumer

```bash
# Snapshot
ps aux --sort=-%cpu | head -10

# Live, per-thread view
top -H -p <pid>

# Sustained high CPU investigation
strace -c -p <pid>  # 30-second summary
```

**Key insight:** `%CPU` in `ps` is averaged over the process lifetime. Use `top` for current spikes. Press `1` in top for per-core breakdown — one saturated core shows as 25% on a 4-core server.

> **Deep dive:** [Linux High CPU Usage: Step-by-Step Troubleshooting Guide](/blog/linux-high-cpu-usage-guide) — full workflow including %sy and steal time diagnosis.

> **Tool reference:** [top Command Linux: Real-World Guide](/blog/top-command-linux-guide) — reading the CPU line, load average, per-core view.

---

## 2. Memory Troubleshooting

### Check available memory (not free)

```bash
free -h
# Focus on 'available' column — not 'free'
# 'free' excludes reclaimable cache
# 'available' = what processes can actually use
```

### Find memory consumers

```bash
# Sort by RSS (actual physical RAM)
ps aux --sort=-%mem | head -10

# In top: press M
top
```

### Detect a memory leak

```bash
# Track RSS over time
PID=1234
while true; do
  echo "$(date): $(ps -p $PID -o rss= | tr -d ' ') KB"
  sleep 60
done | tee /tmp/mem_track.log
```

RSS growing consistently without leveling off = memory leak.

```bash
# OOM kill investigation
dmesg | grep -i "oom\|killed process"
```

> **Deep dive:** [Linux Memory Leak Troubleshooting: RSS vs VSZ Explained](/blog/linux-memory-leak-troubleshooting-rss-vsz) — tracking RSS over time, distinguishing leaks from normal growth, OOM post-mortem.

---

## 3. Process State Troubleshooting

Process state is the single most useful column in `ps` output. Read it before anything else.

```bash
ps -eo pid,stat,comm | sort -k2 | head -30
```

| State | Meaning | Action |
|---|---|---|
| `R` | Running | Normal. Many `R` = CPU contention |
| `S` | Sleeping | Normal. Check `wchan` if stuck |
| `D` | I/O wait — **uninterruptible** | Cannot be killed. Fix I/O source |
| `Z` | Zombie — already dead | Cannot be killed. Restart parent |
| `T` | Stopped | Send `SIGCONT` to resume |

### D-state investigation

```bash
# Find D-state processes
ps -eo pid,stat,comm | awk '$2 ~ /^D/'

# What are they waiting on?
cat /proc/<pid>/wchan
# nfs4_... = NFS problem
# jbd2_... = disk I/O
# ext4_... = filesystem I/O
```

### Zombie investigation

```bash
# Find zombies and their parents
ps -eo pid,ppid,stat,comm | awk '$3 ~ /Z/'

# Restart the parent service to clear zombies
systemctl restart <parent_service>
```

> **Deep dive:** [Linux Process States Explained: R, S, D, Z](/blog/linux-process-states-guide) — what each state means, D-state investigation, zombie resolution.

> **Tool reference:** [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — full ps guide with production workflows.

---

## 4. Disk I/O Troubleshooting

High `%wa` in top means processes are waiting on I/O. CPU is idle while disk or network is the bottleneck.

```bash
# Which process is doing disk I/O?
iotop -o  # shows only processes with active I/O

# Overall disk throughput
iostat -x 2  # update every 2 seconds

# Disk utilization per device
iostat -x 2 | awk '/^sd|^nvme/ {print $1, $14"%"}'
# $14 = %util — 100% means disk is saturated
```

### Check for disk errors

```bash
# Kernel messages about disk
dmesg | grep -iE "error|ata|scsi|I/O error" | tail -20

# SMART health check
smartctl -a /dev/sda | grep -E "Reallocated|Uncorrectable|Pending"
```

### NFS-specific

```bash
# Hung NFS mount causing D-state processes
mount | grep nfs
umount -f -l /mnt/hung_mount  # force unmount

# NFS server reachable?
showmount -e <nfs_server>
```

---

## 5. Network Performance Troubleshooting

```bash
# What ports are open and what is listening?
ss -tlnp

# Active connections and states
ss -s  # summary with TIME-WAIT count

# Who is consuming network bandwidth? (requires nethogs)
nethogs eth0
```

### TIME-WAIT accumulation

```bash
# Count TIME-WAIT sockets
ss -tn state time-wait | wc -l

# If climbing above 5000 under load: missing keepalive
# Fix: add keepalive to NGINX upstream blocks
```

> **Deep dive:** [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained) — ephemeral port exhaustion, sysctl fixes, detection.

> **NGINX specific:** [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load) — TIME-WAIT causing 502s, keepalive fix.

---

## 6. Using the Right Tool

| Question | Tool |
|---|---|
| What processes are running? | `ps aux` |
| What is consuming CPU/memory live? | `top` or `htop` |
| What files/sockets does a process have open? | `lsof -p <pid>` |
| What system calls is a process making? | `strace -c -p <pid>` |
| What ports are open? | `ss -tlnp` |
| Which process is doing disk I/O? | `iotop -o` |
| Are there disk/hardware errors? | `dmesg` |
| What do the logs say? | `journalctl -u <service>` |

> **Full reference:** [Top Linux Debugging Tools Every Engineer Should Know](/blog/linux-debugging-tools-guide) — 10 tools with use cases and comparison table.

---

## 7. Log Correlation

Every performance issue has a log trail. The sequence matters — the first error is the root cause.

```bash
# Anchor to when the problem started
journalctl -p err --since "HH:MM:00" --no-pager | head -10

# Cross-service correlation in a 5-minute window
journalctl --since "14:20" --until "14:25" --no-pager | grep -iE "error|fail|warn"
```

> **Deep dive:** [Linux Log Analysis: How to Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — journalctl, grep patterns, log correlation workflow.

---

## 8. Production Checklist

When an alert fires, run through this in order:

```bash
# 1. Load average and core count
uptime && nproc

# 2. CPU breakdown
top  # check %wa vs %us vs %sy

# 3. Top resource consumers
ps aux --sort=-%cpu | head -5
ps aux --sort=-%mem | head -5

# 4. Process states
ps -eo pid,stat,comm | awk '$2 ~ /^[DZ]/'

# 5. Memory available
free -h | grep -E "Mem|Swap"

# 6. Disk I/O
iotop -b -n 1 -o | head -10

# 7. Socket state
ss -s | grep time-wait

# 8. Recent errors in logs
journalctl -p err --since "1 hour ago" | tail -20

# 9. Kernel messages
dmesg | tail -20 | grep -iE "error|fail|oom"
```

---

## FAQ

**What should I check first when a server is slow?**
Load average and CPU breakdown. `uptime` gives you load average — compare to core count. `top` shows you CPU breakdown. High `%wa` means I/O. High `%us` means application CPU. These two facts narrow the search space dramatically.

**High load average but CPU looks idle — what is happening?**
D-state processes are counting toward load average without consuming CPU. Run `ps -eo stat | grep '^D' | wc -l`. If you get a high number, you have an I/O bottleneck — disk errors, hung NFS mount, or storage saturation.

**Process keeps coming back after I kill it — why?**
The parent process is respawning it. Check the parent with `ps -o ppid= -p <pid>`, then look up what that parent is. Often it is systemd, a supervisor process, or an init script. Kill the child without fixing the parent and it comes back immediately.

**Memory looks high but swap is not used — is there a problem?**
Check `avail Mem` in `free -h`. Linux uses spare RAM for disk cache (shown as `buff/cache`). If `avail Mem` is healthy (>20% of total), the high `used` number includes reclaimable cache — no problem. If `avail Mem` is very low, you have real memory pressure.

---

*This guide is the entry point to the Linux performance troubleshooting series. Each section links to a dedicated deep-dive article. For the debugging toolkit overview, start with [Top Linux Debugging Tools Every Engineer Should Know](/blog/linux-debugging-tools-guide).*
