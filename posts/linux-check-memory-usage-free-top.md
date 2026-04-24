---
title: "Linux Check Memory Usage: free vs top Explained"
date: "2026-04-22"
excerpt: "Check memory usage in Linux using free, top, and /proc/meminfo — understand available vs free, detect memory pressure, and identify memory-hungry processes."
tags: ["linux", "monitoring", "troubleshooting", "infrastructure"]
featured: false
slug: "linux-check-memory-usage-free-top"
category: "linux"
---

`free` says you have 200MB free. Your monitoring alert says memory is critical. Both are technically correct — and that's the confusion. Here's what the numbers actually mean.

---

## TL;DR

```bash
free -h                          # system memory overview
top                              # live, press M to sort by memory
ps aux --sort=-%mem | head -10   # which processes use most RAM
cat /proc/meminfo | grep -E "MemTotal|MemAvailable|SwapUsed"
```

---

## free: The Starting Point

```bash
free -h
```

```
              total        used        free      shared  buff/cache   available
Mem:           15Gi        9.8Gi       213Mi        1.2Gi      5.1Gi       4.4Gi
Swap:         4.0Gi          0B       4.0Gi
```

**The column that matters: `available`** — not `free`.

`free` (213Mi) = RAM with nothing in it at all.
`available` (4.4Gi) = RAM available for new processes, including reclaimable cache.

Linux uses unused RAM as disk cache (`buff/cache`). That's intentional — it speeds up I/O. The kernel releases it immediately when an app needs memory. So 213Mi `free` with 4.4Gi `available` means you have plenty of memory. A server with 200Mi `free` and 200Mi `available` is actually low on memory.

---

## Reading free Output

```bash
free -h -s 2    # update every 2 seconds (like watch)
```

| Column | Meaning | What to watch |
|---|---|---|
| `total` | Physical RAM installed | — |
| `used` | RAM in active use by processes | — |
| `free` | Completely idle RAM | Not the important number |
| `shared` | tmpfs and shared memory | — |
| `buff/cache` | Kernel buffers + page cache | Reclaimable |
| `available` | **RAM available for new allocations** | This is the important number |

**Swap used > 0:** System needed more RAM than available at some point. Watch if it's growing.

---

## top: Memory in Context

```bash
top
# Press M to sort processes by memory
```

Memory header in top:

```
MiB Mem :  15258.9 total,    213.1 free,   9842.6 used,   5203.2 buff/cache
MiB Swap:   4096.0 total,      0.0 used,   4096.0 free.   4412.5 avail Mem
```

`avail Mem` on the right — same as `available` in `free`, this is the real number.

Per-process memory columns:

| Column | Meaning |
|---|---|
| `VIRT` | Virtual memory — includes mapped files, often misleading |
| `RES` | Resident Set Size — actual physical RAM used |
| `SHR` | Shared memory (shared libraries) |
| `%MEM` | RES as % of total RAM |

**Always use `RES` for memory analysis.** `VIRT` (or VSZ in `ps`) is almost always misleadingly large.

---

## ps: Find Memory-Hungry Processes

```bash
# Sort by RSS (actual RAM), top 10
ps aux --sort=-%mem | head -11

# Custom columns: PID, RSS in MB, command
ps -eo pid,user,rss,comm --sort=-rss | head -11 | \
  awk 'NR==1{print} NR>1{printf "%-8s %-12s %6.1fMB  %s\n", $1, $2, $3/1024, $4}'
```

Output:

```
PID      USER         RSS     COMMAND
8823     app         2048.3MB  java
3012     postgres     512.1MB  postgres
2341     www-data      48.2MB  nginx
```

---

## /proc/meminfo: Detailed Breakdown

```bash
cat /proc/meminfo
```

Key entries:

```
MemTotal:       15625216 kB    ← total RAM
MemFree:          218112 kB    ← idle RAM (not important alone)
MemAvailable:   4519424 kB    ← available for new allocations
Buffers:          239104 kB    ← kernel buffer cache
Cached:          4923904 kB    ← page cache (reclaimable)
SwapTotal:       4194304 kB
SwapFree:        4194304 kB    ← if < SwapTotal: system has swapped
Dirty:              1024 kB    ← data written to cache, not yet flushed
```

---

## Real Examples

### Is the server actually low on memory?

```bash
free -h
# available = 4.4Gi → plenty of memory, ignore the low "free" number

free -h
# available = 312Mi on a 16GB server → memory pressure, investigate
```

### Detect a memory leak

```bash
PID=8823
while true; do
  echo "$(date +%H:%M:%S): $(ps -p $PID -o rss= | tr -d ' ') KB"
  sleep 60
done | tee /tmp/mem_leak.log
```

If RSS grows steadily without leveling off — memory leak confirmed.

### Find what's using swap

```bash
# Which processes are using swap
for pid in /proc/[0-9]*; do
  pid=${pid##*/}
  swap=$(awk '/VmSwap/{print $2}' /proc/$pid/status 2>/dev/null)
  [ "${swap:-0}" -gt 0 ] && echo "$swap kB  $(cat /proc/$pid/comm 2>/dev/null)"
done | sort -rn | head -10
```

### OOM kill investigation

```bash
dmesg | grep -i "oom\|killed process\|out of memory" | tail -10
journalctl -k --since "1 hour ago" | grep -i oom
```

---

## Common Mistakes

**Mistake 1: Panicking at low `free` memory**
`free: 200MB` on a 16GB server is normal. Linux fills unused RAM with cache. Check `available`, not `free`.

**Mistake 2: Using VSZ/VIRT for memory analysis**
A Java process with VIRT=8GB uses ~8GB of address space — not RAM. RES/RSS is actual physical RAM. Always use that.

**Mistake 3: Ignoring growing swap**

```bash
# Watch swap usage over time
watch -n 5 'free -h | grep Swap'
# If "used" column increases: memory pressure growing
```

**Mistake 4: Not checking for OOM kills**
Process disappeared without a trace? Check dmesg before assuming it crashed.

---

## Pro Tips

```bash
# Memory usage summary in one line
awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "Used: %.1fGB / Total: %.1fGB (%.0f%% used)\n", (t-a)/1048576, t/1048576, (t-a)*100/t}' /proc/meminfo

# Sort processes by memory, show RSS in human format
ps -eo pid,comm,rss --sort=-rss | head -10 | \
  awk 'NR==1{print "PID\tCOMMAND\tRSS"} NR>1{printf "%s\t%s\t%.1fMB\n", $1, $2, $3/1024}'

# Track memory usage of a process over time
pidstat -r -p <pid> 1

# Check NUMA memory distribution (multi-socket servers)
numastat
```

---

## Conclusion

`available` in `free -h` is the number that matters — not `free`. Sort processes by `RES` in top (press `M`) or by `rss` in `ps` to find memory consumers. Growing swap + decreasing `available` = real memory pressure. Static swap with high `available` = old swap pages from a past spike, not a current problem.

---

*Related: [Linux Memory Leak Troubleshooting: RSS vs VSZ Explained](/blog/linux-memory-leak-troubleshooting-rss-vsz) — deep dive on tracking memory leaks in production. [Linux Performance Troubleshooting: Complete Guide](/blog/linux-performance-troubleshooting-guide) — full diagnostic workflow for memory and CPU together.*
