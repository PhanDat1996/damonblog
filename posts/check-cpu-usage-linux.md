---
title: "How to Check CPU Usage in Linux: Real Command Examples"
date: "2026-04-22"
excerpt: "Check CPU usage in Linux using top, mpstat, ps, and vmstat — read per-core breakdown, identify CPU-hungry processes, and diagnose high load in production."
tags: ["linux", "monitoring", "troubleshooting", "infrastructure"]
featured: false
slug: "check-cpu-usage-linux-commands"
---

CPU is high and you need to know why. Or you're baselining a server before a deployment. Either way, Linux gives you multiple tools to look at CPU from different angles.

---

## TL;DR

```bash
top                          # live view, press 1 for per-core
mpstat -P ALL 1              # per-core stats every second
ps aux --sort=-%cpu | head   # which processes use most CPU
vmstat 1 5                   # system-level: CPU + context switches
```

---

## top: Live CPU Overview

```bash
top
```

The CPU line at the top is where to start:

```
%Cpu(s): 23.4 us,  5.1 sy,  0.0 ni, 68.2 id,  2.8 wa,  0.0 hi,  0.5 si,  0.0 st
```

| Field | Meaning | High value means |
|---|---|---|
| `us` | User space | App is burning CPU |
| `sy` | Kernel/system | Many syscalls or context switches |
| `wa` | I/O wait | Waiting on disk or NFS |
| `st` | Steal time | VM hypervisor taking CPU away |
| `id` | Idle | Free CPU — lower = more pressure |

**Press `1`** inside top to see per-core breakdown. On a 4-core server, one thread at 100% shows as only 25% in aggregate. The per-core view reveals that immediately.

---

## mpstat: Per-Core CPU Stats

`mpstat` from the `sysstat` package gives a clean per-core view:

```bash
# Install
apt install sysstat    # Ubuntu
dnf install sysstat    # RHEL

# All cores, update every 1 second
mpstat -P ALL 1

# 5 samples, then exit
mpstat -P ALL 1 5
```

Output:

```
09:15:02  CPU   %usr  %sys  %iowait  %idle
09:15:03  all  23.40  5.10    2.80  68.20
09:15:03    0  91.00  4.00    0.00   5.00   ← core 0 saturated
09:15:03    1   2.10  1.50    0.00  96.40
09:15:03    2   1.80  1.20    0.00  97.00
09:15:03    3   2.00  1.10    0.00  96.90
```

One core at 91% while aggregate shows 23% — this is a single-threaded bottleneck. You'd never catch it without per-core view.

---

## ps: Which Processes Use Most CPU

```bash
# Top 10 by CPU right now
ps aux --sort=-%cpu | head -11

# Watch it refresh every 2 seconds
watch -n 2 'ps aux --sort=-%cpu | head -10'
```

Output:

```
USER   PID  %CPU %MEM  COMMAND
app   8823  89.4  2.1  java -jar service.jar
root   991   2.1  0.0  kworker/0:2
...
```

**Note:** `%CPU` in `ps` is averaged over the process lifetime, not the last second. Use `top` for current spikes, `ps` for sustained consumers.

---

## vmstat: System-Level CPU + Context Switches

```bash
vmstat 1 5    # 5 readings, 1 second apart
```

```
procs ----------memory---------- ---swap-- -----io---- --system-- -----cpu-----
 r  b   swpd   free  buff  cache   si   so    bi    bo   in   cs  us sy id wa
 3  0      0 8142456 234196 4123456  0    0     0    48  234  8456 23  5 68  2
```

Key columns:
- `r` — processes waiting for CPU (run queue). `r > CPU count` = CPU contention
- `cs` — context switches per second. High `cs` with high `sy` = excessive threading
- `us sy id wa` — same meaning as top's CPU line

---

## Real Examples

### High load but CPU looks idle

```bash
top
# %Cpu: 5 us, 3 sy, 0 ni, 52 id, 38 wa
```

High `wa` (38%) + low `id` (52%) = I/O bottleneck. Processes are waiting on disk or NFS. CPU isn't the problem.

```bash
# Confirm: count D-state processes
ps -eo stat | grep '^D' | wc -l
# If high: storage issue, not CPU
```

### Find the process causing CPU spike

```bash
# Step 1: which process?
ps aux --sort=-%cpu | head -5

# Step 2: what threads?
top -H -p <pid>     # thread view for that PID

# Step 3: what is it doing?
strace -c -p <pid>  # syscall summary, 10 seconds
```

### Check CPU usage for a specific service

```bash
# By process name
ps aux | grep -v grep | grep nginx | awk '{print $1, $2, $3, $11}'

# By PID
top -p $(pgrep -d, nginx)
```

### Monitor CPU over time (log to file)

```bash
# Log CPU every 30 seconds
sar -u 30 > /tmp/cpu_log.txt &

# Or with vmstat
vmstat 30 | awk '{print strftime("%H:%M:%S"), $0}' | tee /tmp/cpu_vmstat.log
```

---

## Output Explanation: Load Average

```bash
uptime
# load average: 3.24, 2.87, 1.93
#               1min  5min  15min
```

Load average = average number of processes either running or waiting to run.

**Rule:** Load average / CPU cores = utilization ratio.
- Load 3.24 on 4 cores = 81% utilized — healthy
- Load 3.24 on 2 cores = 162% — overloaded
- Rising trend (1min > 15min) = getting worse

```bash
nproc              # number of CPU cores
grep -c processor /proc/cpuinfo
```

---

## Common Mistakes

**Mistake 1: Reading aggregate CPU on multi-core systems**
Always press `1` in top. A single thread at 100% shows as 25% on a 4-core server.

**Mistake 2: Trusting `%CPU` in `ps` for current spikes**
`ps` shows lifetime average. A process that just spiked shows low `%CPU` in ps if it's been running for hours. Use `top` for current activity.

**Mistake 3: High load average = high CPU usage**
Load average includes I/O-waiting processes (D state). A system with 20 processes stuck on NFS shows load 20 with CPU at 5%. Check `%wa` in top and D-state count in ps.

**Mistake 4: Ignoring steal time on VMs**
`%st > 5%` means your VM host is overcommitted. Adding CPU to the VM won't help — the hypervisor is the bottleneck.

---

## Pro Tips

```bash
# CPU usage per second for the last hour (if sar is configured)
sar -u 1 60

# Top CPU consumers over the last 24h (with sar)
sar -u -f /var/log/sysstat/sa$(date +%d) | awk 'NR>3 {print}' | sort -k4 -rn | head

# Find CPU-intensive kernel threads
ps aux | grep '\[' | sort -k3 -rn | head -10

# Check CPU frequency and throttling
cat /proc/cpuinfo | grep "cpu MHz"
```

---

## Conclusion

Start with `top` — it gives the full picture in one view. Press `1` for per-core breakdown. High `%wa` means I/O, not CPU. High `%st` means hypervisor contention. For scripting and logging, `mpstat` and `vmstat` give cleaner output than top's interactive mode.

---

*Related: [Linux High CPU Usage: Step-by-Step Troubleshooting Guide](/blog/linux-high-cpu-usage-troubleshooting) — full incident workflow when CPU is maxed. [top Command Linux: Real-World Guide](/blog/top-command-linux-guide) — complete top usage including filters and keybindings.*
