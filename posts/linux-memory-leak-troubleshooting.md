---
title: "Linux Memory Leak Troubleshooting: Prove It, Then Find It"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Service gets OOM-killed every few days? Use RSS, PSS and smaps to tell a real memory leak from cache and allocator growth, then find which process leaks."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
category: "linux"
---

The service restarts every three days. Nobody touched it. In the kernel log there's a line ending in `Killed process 8823 (java)`, and the memory graph is a sawtooth: a slow climb, a cliff, another slow climb.

That looks like a leak. Sometimes it is. Sometimes it's a cache with no size limit, an allocator that doesn't return memory to the OS, or a container limit set lower than the application's normal working set. Each one has a different fix, so the first job is to prove which one you have.

If you just need to know how much memory the box has free, see [Check Memory Usage in Linux](/blog/linux-check-memory-usage-free-top). This post is about a process whose memory keeps growing.

---

## TL;DR

```bash
journalctl -k | grep -iE 'killed process|oom-kill'      # was it the OOM killer?
ps -eo pid,rss,etime,comm --sort=-rss | head            # biggest processes and their age
pidstat -r -p <PID> 60                                  # RSS every minute (sysstat)
grep -E '^(Rss|Pss|Anonymous|Swap):' /proc/<PID>/smaps_rollup
```

A leak is **anonymous memory that keeps growing even when load is flat**, and does not come back down. Everything below is about measuring that properly.

---

## Which memory number to watch

| Metric | Where | What it counts | For leak hunting |
|---|---|---|---|
| VSZ / VIRT | `ps`, `top` | All mapped address space, touched or not | Ignore. Huge VSZ is normal |
| RSS / RES | `ps`, `top`, `pidstat` | Pages in RAM now, **shared pages counted in full** | Good trend signal for one process |
| PSS | `smaps_rollup`, `smem` | RSS with shared pages divided among sharers | Use when comparing or summing processes |
| Anonymous | `smaps_rollup` | Heap, stacks, private mmap; not file-backed | **The leak usually lives here** |
| Swap | `smaps_rollup`, `VmSwap` in `status` | Pages pushed to swap | A leaking process often swaps first |

Two traps with RSS:

1. **A leak can hide in swap.** If the system swaps, a leaking process's RSS can level off while its swap keeps growing. Track `Rss + Swap`, or `Anonymous + Swap`.
2. **RSS includes file-backed pages** such as mapped libraries and files read with `mmap`. Those can be dropped under pressure, so they aren't the leak.

```bash
grep -E '^(Rss|Pss|Shared_Clean|Private_Dirty|Anonymous|Swap):' /proc/8823/smaps_rollup
```

```
Rss:             2097460 kB
Pss:             2081988 kB
Shared_Clean:      17204 kB
Private_Dirty:   2074356 kB
Anonymous:       2074120 kB
Swap:              48300 kB
```

`smaps_rollup` needs kernel 4.14 or later. On older kernels, sum the same fields from `/proc/<PID>/smaps`.

---

## Step 1: Confirm what killed it

```bash
journalctl -k --since "7 days ago" | grep -iE 'out of memory|oom-kill|killed process'
```

```
Memory cgroup out of memory: Killed process 8823 (java) total-vm:6843120kB, anon-rss:2081340kB, file-rss:15720kB, shmem-rss:0kB, UID:1001 pgtables:4512kB oom_score_adj:0
```

Read two things:

- **`Memory cgroup out of memory`** means a cgroup limit was hit (container, systemd `MemoryMax=`, Kubernetes `limits.memory`), not the whole machine. The host may have had plenty of free RAM. A plain `Out of memory:` line means the whole system ran out.
- **`anon-rss`** is the process's private memory at the moment of death. Compare it with its normal size after startup.

For a line-by-line walkthrough of that report, with a reproducible lab, see [Linux OOM Killer: Read the Log and Control What Dies](/blog/linux-oom-killer-explained).

If there's no OOM line but the process still died, check the application's own logs and `systemctl status`; a JVM throwing `OutOfMemoryError` and exiting is a different event from the kernel killing it.

---

## Step 2: Record a trend

One snapshot proves nothing. Record RSS over hours, with load in mind:

```bash
pidstat -r -p 8823 60 | tee mem-8823.log
```

Without sysstat:

```bash
PID=8823
while kill -0 "$PID" 2>/dev/null; do
  printf '%s %s\n' "$(date +%FT%T)" \
    "$(awk '/^(Anonymous|Swap):/{s+=$2} END{print s}' /proc/$PID/smaps_rollup)"
  sleep 60
done | tee anon-$PID.log
```

That prints anonymous memory plus swap in kB, one line a minute, and stops when the process exits.

How to read the curve:

| Shape | Usually means |
|---|---|
| Rises after start, then flattens | Warm-up: caches, pools, JIT. Normal |
| Rises and falls with traffic | Per-request buffers. Normal |
| Steps up after specific events and never drops | Leak tied to that event (a job, reconnect, deploy of config) |
| Rises steadily, including at night with low traffic | Leak |
| Rises fast, then flat at a high level | Unbounded cache or allocator high-water mark; may not be a leak |

**The strongest test: reduce load to near zero.** Real leaks keep growing (or at least never come back down). Load-driven growth stops.

Estimate urgency from the slope: if anonymous memory grows 200 MB an hour and the limit is 2 GB above the current value, you have roughly 10 hours.

---

## Step 3: Rule out "it's not really a leak"

### The allocator kept the memory

When a C/C++ program (or a runtime built on glibc, like Python or Ruby) frees memory, glibc `malloc` often keeps it for reuse instead of returning it to the kernel, especially with many threads (each gets its own arena). RSS stays at the high-water mark of the busiest moment. This looks like a leak on a graph, but it plateaus once the peak workload has been seen.

Signs: growth stops at a stable ceiling; lots of threads. Known mitigations: lower `MALLOC_ARENA_MAX` (for example `2`), or use jemalloc/tcmalloc. Test these in staging; they trade memory for some throughput.

### A managed heap that's simply sized large

A JVM with `-Xmx4g` will grow toward 4 GB plus metaspace, thread stacks and native buffers before a full GC is forced. That's configuration, not a leak. If the container limit is lower than heap plus off-heap overhead, it gets OOM-killed every time. Check with:

```bash
jcmd 8823 VM.flags | tr ' ' '\n' | grep -E 'MaxHeapSize|MaxRAMPercentage'
cat /sys/fs/cgroup/memory.max          # inside the container, cgroup v2
```

### It's the kernel, not the process

Memory that grows on the host but in no process's RSS is usually kernel memory, typically slab:

```bash
grep -E '^(Slab|SReclaimable|SUnreclaim):' /proc/meminfo
slabtop -o | head -15
```

A growing `SUnreclaim` points to a kernel-side issue (driver, filesystem, conntrack, socket buffers), not your application. Note that file descriptors and sockets consume kernel memory too, but it's charged to slab, not to the process's RSS. A socket leak shows up as a rising count in `/proc/<PID>/fd` long before it shows up as memory; see [Too Many Open Files](/blog/too-many-open-files-linux-fix).

---

## Step 4: Find where in the process

Linux tools tell you *which mapping* is growing:

```bash
pmap -x 8823 | sort -k3 -n | tail -10       # largest mappings by RSS (column 3)
```

A large and growing `[ anon ]` region or `[heap]` points at the native heap. A growing mapping of a file (`.so`, data file) is usually harmless page cache.

To find *which code* is allocating, you need the runtime's own tooling:

| Runtime | Tool | What to look for |
|---|---|---|
| Java | `jcmd <PID> GC.class_histogram`, heap dump with `jcmd <PID> GC.heap_dump /tmp/heap.hprof` | Class counts growing between two histograms |
| Java (off-heap) | Start with `-XX:NativeMemoryTracking=summary`, then `jcmd <PID> VM.native_memory summary` | Growth in Thread, Internal, Other |
| Node.js | Start with `--heapsnapshot-signal=SIGUSR2`, then `kill -USR2 <PID>`; or `--inspect` + DevTools | Retained objects growing between two snapshots |
| Python | `tracemalloc` snapshots, or `memray` | Allocation sites growing between snapshots |
| C/C++ | `valgrind --leak-check=full` (staging only, very slow), `heaptrack`, or ASan builds | "definitely lost" blocks, top allocation sites |

Taking a heap dump pauses the process and writes a file roughly the size of the heap. Do it on one instance taken out of the load balancer, and make sure the disk has room.

The method is the same everywhere: **take two snapshots some time apart and diff them.** Whatever grew between them is the candidate. A single snapshot just shows what's big, which is often legitimate.

Common causes once you find the type:

- Maps or lists used as caches with no eviction or TTL.
- Listeners, callbacks or timers registered per request and never removed.
- `ThreadLocal`s on pooled threads that are never cleared (Java).
- Closures keeping large request objects alive (Node.js).
- Connections or buffers not returned to a pool on error paths.

---

## Compare instances to confirm

If you run several identical instances, the oldest one should be the biggest if it's a leak:

```bash
ps -C java -o pid,etime,rss --sort=-rss
```

```
    PID     ELAPSED    RSS
   8823  3-02:14:51 2097460
   8901    05:12:40  612340
   8902    05:12:38  598120
```

Memory that correlates with **uptime** rather than with traffic is the signature of a leak.

---

## Stopgaps while the fix is written

- **Set a memory limit so the failure is predictable**: `MemoryMax=` in a systemd unit (cgroup v2) or a container limit, with `Restart=on-failure`. One service restarting is better than the OOM killer choosing a random victim on a shared host.
- **Scheduled restarts** before the limit is reached. Not pretty, but it buys time.
- **Don't just add swap.** A leaking process will fill it too, and the server becomes slow before it becomes dead.

---

## Quick checklist

1. Check the kernel log: system OOM or cgroup OOM? What was `anon-rss`?
2. Record `Anonymous + Swap` (or RSS) every minute for hours, alongside traffic.
3. Plateau or steady climb? Rule out allocator high-water marks, heap sizing and kernel slab.
4. Find the growing mapping (`pmap -x`), then use runtime tools and diff two snapshots.
5. Put a limit and restart policy in place until the fix ships.

---

*Related: [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) for where memory fits in the bigger triage. [ps Command for Troubleshooting](/blog/ps-command-linux-troubleshooting) for the ps memory columns. [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide) when GC churn makes a memory problem look like a CPU one.*
