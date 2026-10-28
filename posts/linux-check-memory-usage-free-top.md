---
title: "Check Memory Usage in Linux: Why free Isn't the Number"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "free -h shows 200MB free, yet the server is fine? Learn to read available vs free and buff/cache, check swap, and find which process uses the most RAM."
tags: ["linux", "monitoring", "troubleshooting", "infrastructure"]
featured: false
category: "linux"
---

`free -h` says you have 213 MB free on a 16 GB server. The monitoring dashboard says memory is fine. One of them is wrong, right?

Neither is. Linux puts idle RAM to work as disk cache, so the `free` column is almost always small on a healthy server. The number that answers "am I running out of memory?" is `available`.

```bash
free -h                                         # system overview: read "available"
ps -eo pid,user,rss,comm --sort=-rss | head     # biggest processes by resident memory
top                                             # live view, press M to sort by memory
grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo
```

---

## Reading `free -h`

```
               total        used        free      shared  buff/cache   available
Mem:            15Gi       8.4Gi       213Mi       1.2Gi       6.6Gi       4.4Gi
Swap:          4.0Gi       128Mi       3.9Gi
```

| Column | What it is | Should you worry? |
|---|---|---|
| `total` | RAM visible to the kernel | — |
| `used` | Memory in use (see note below) | Only together with `available` |
| `free` | Pages holding nothing at all | Almost never. Low is normal |
| `shared` | Mostly tmpfs and shared memory (`/dev/shm`) | If it keeps growing, check tmpfs mounts |
| `buff/cache` | Page cache, buffers, reclaimable kernel slab | It's mostly borrowable |
| `available` | Kernel's **estimate** of what new programs can get without swapping | **This is the one** |

So the server above has 4.4 GB of headroom, not 213 MB.

Why "estimate" and "mostly"? Not everything in `buff/cache` can be dropped. tmpfs and shared memory are counted there and can't be freed by the cache shrinker, and dirty pages must be written to disk first. `available` (from `MemAvailable` in `/proc/meminfo`, kernel 3.14+) already accounts for that, which is why it's smaller than `free + buff/cache`.

A note on `used`: older procps versions computed it as `total - free - buffers - cache`. procps-ng 4.0.1 and later compute it as `total - available`. Same server, different `used` depending on the distro release, so don't compare it across machines. Compare `available`.

### When is memory actually low?

- `available` is a small fraction of `total` and **falling**.
- Swap is being actively written (see below), not just "used".
- The OOM killer has fired (`dmesg` / `journalctl -k`). See [how to read an OOM kill report](/blog/linux-oom-killer-explained).

---

## Swap: "used" is history, `si`/`so` is now

```bash
vmstat 1 5
```

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  0 131072 218112 239104 6684160    0    0     4    22  410  780  5  2 93  0  0
 1  0 131072 217900 239104 6684200    0    0     0    16  398  765  4  1 95  0  0
```

128 MB of swap used with `si` and `so` at zero means something was swapped out at some point and hasn't been needed since. That's harmless. Sustained non-zero `si`/`so` means the system is moving pages in and out **right now**, and that's when latency suffers.

To see which processes have pages in swap:

```bash
for f in /proc/[0-9]*/status; do
  awk '/^Name:/{n=$2} /^VmSwap:/{if ($2 > 0) print $2, "kB", n}' "$f" 2>/dev/null
done | sort -rn | head
```

---

## Which process is using the memory?

```bash
ps -eo pid,user,rss,vsz,comm --sort=-rss | head -6
```

```
    PID USER       RSS    VSZ COMMAND
   8823 app     2097460 6843120 java
   3012 postgres 524400 4412880 postgres
   2210 postgres 311204 4412880 postgres
   1187 root     102340 1873400 dockerd
   2341 www-data  49360  152820 nginx
```

Both sizes are in KiB. In `top`, press `M` to sort by `%MEM`; the equivalent columns are `RES` and `VIRT`.

| ps | top | What it measures | Use it? |
|---|---|---|---|
| `VSZ` | `VIRT` | Virtual address space: everything mapped, touched or not | No. Large VSZ is normal (JVMs, Go, glibc arenas) |
| `RSS` | `RES` | Pages in physical RAM right now, **including shared pages** | Yes, for "who is big" |
| — | `SHR` | The part of `RES` that is file-backed or shared memory | Explains why RSS totals overcount |
| `%MEM` | `%MEM` | RSS as a percentage of RAM | Same caveat as RSS |

### Why the RSS numbers add up to more than your RAM

RSS counts shared pages fully in every process that maps them. Ten PostgreSQL backends sharing 2 GB of `shared_buffers` can each report around 2 GB RSS. Summing RSS across processes therefore overstates real usage.

For a fair split, use **PSS** (proportional set size), which divides each shared page among the processes sharing it:

```bash
grep -E '^(Rss|Pss)' /proc/3012/smaps_rollup     # kernel 4.14+
smem -t -k -s pss | tail                           # if smem is installed
```

---

## /proc/meminfo: the source for everything above

```bash
grep -E 'MemTotal|MemFree|MemAvailable|^Cached|Shmem:|SwapTotal|SwapFree|Dirty|Slab' /proc/meminfo
```

```
MemTotal:       15988408 kB
MemFree:          218112 kB
MemAvailable:    4614900 kB
Cached:          6104220 kB
SwapTotal:       4194300 kB
SwapFree:        4063228 kB
Dirty:              1024 kB
Shmem:           1258300 kB
Slab:             612448 kB
```

There is no `SwapUsed` field; swap used is `SwapTotal - SwapFree`. A one-line used percentage based on `MemAvailable`:

```bash
awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "%.0f%% used (%.1f GiB available)\n", (t-a)*100/t, a/1048576}' /proc/meminfo
```

---

## In a container, `free` lies

`free` and `top` read `/proc/meminfo`, which shows the **host's** memory unless the container runtime uses something like LXCFS. A container limited to 512 MB can see 64 GB "available" and still get OOM-killed. Check the cgroup instead:

```bash
cat /sys/fs/cgroup/memory.max        # cgroup v2 limit ("max" = unlimited)
cat /sys/fs/cgroup/memory.current    # current usage, includes page cache
docker stats --no-stream             # from the host
```

---

## Did something get OOM-killed?

A process that vanished without logging anything often met the OOM killer:

```bash
journalctl -k --since "1 day ago" | grep -iE 'out of memory|oom-kill|killed process'
```

```
Out of memory: Killed process 8823 (java) total-vm:6843120kB, anon-rss:2081340kB, file-rss:15720kB, shmem-rss:0kB, UID:1001 pgtables:4512kB oom_score_adj:0
```

`anon-rss` is the process's own heap and stack at the moment it was killed. If that number is far above its normal RSS, read [Linux Memory Leak Troubleshooting](/blog/linux-memory-leak-troubleshooting).

---

**Should I drop caches to free memory?**
No. `echo 3 > /proc/sys/vm/drop_caches` throws away cache the kernel would have reclaimed on its own when needed, and the next reads hit disk instead. It's useful for benchmarking, not for fixing memory pressure.

**Why is `available` lower than `free` plus `buff/cache`?**
Some cached memory can't be reclaimed (tmpfs, shared memory, pages in active use), and the kernel keeps a low-watermark reserve. `available` subtracts those.

**Is swap usage bad?**
Swap that's used but idle is not a problem. Ongoing swap-in/swap-out activity (`si`/`so` in vmstat) is.

---

*Related: [How to Check CPU Usage in Linux](/blog/check-cpu-usage-linux) for the CPU side of the same question. [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) for the full triage order.*
