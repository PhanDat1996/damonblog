---
title: "Linux High CPU Usage: How to Find the Real Cause"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "CPU alert firing on a Linux server? Tell user, kernel, iowait and steal apart, find the process and thread, and see what it's doing before you kill it."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
category: "linux"
---

The alert says CPU is at 95%. Response times are climbing. You open `top`, see a Java process at the head of the list, and your hand is already moving toward `kill`.

Wait. "High CPU" covers at least four different problems: an application doing too much work, the kernel doing work on its behalf, a hypervisor taking your CPU away, and a storage problem that only *looks* like CPU because the load average went up. Each has a different fix, and killing the top process only fixes one of them.

This is the order to work through it. If you just need the numbers, [How to Check CPU Usage in Linux](/blog/check-cpu-usage-linux) is the short version.

---

## TL;DR

```bash
uptime; nproc                         # load vs CPU count (load includes D-state tasks!)
top                                   # read us / sy / wa / st, press 1 for per-core
vmstat 1 5                            # r (run queue) and b (blocked) columns
top -H -p <PID>                       # which thread inside the process
perf top -p <PID>                     # which functions are burning the CPU
```

Don't `kill -9` before you know what the process is doing. If it's a legitimate job, you'll lose its work. If it's a bug, it will come back after the restart.

---

## Step 1: Is it actually CPU?

```bash
uptime
#  15:42:07 up 14 days,  2:31,  3 users,  load average: 6.32, 4.21, 2.87
nproc
# 4
```

A load of 6.3 on 4 CPUs looks like CPU saturation. It might not be. On Linux the load average counts tasks that are running, waiting for a CPU, **and** stuck in uninterruptible sleep (`D` state, usually waiting on disk or NFS). Confirm with vmstat:

```bash
vmstat 1 5
```

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 7  0      0 512304  88120 3912004    0    0     0    36 3120 5210 84  9  7  0  0
 6  0      0 512100  88120 3912010    0    0     0    20 3075 5098 86  8  6  0  0
```

(The first line of vmstat output is the average since boot. Skip it.)

- `r` above `nproc`, `id` near 0: real CPU saturation. Continue.
- `b` high, `wa` high, `id` not zero: tasks are blocked on I/O. That's a storage problem; go to [Check Disk I/O with iostat](/blog/linux-check-disk-io-iostat).
- Neither high but load is high: look for D-state tasks with `ps -eo stat,pid,comm | awk '$1 ~ /^D/'`. See [Linux Process States](/blog/linux-process-states-guide).

---

## Step 2: What kind of CPU usage?

Open `top` and read the CPU line:

```
%Cpu(s): 78.2 us,  8.1 sy,  0.0 ni, 10.4 id,  2.8 wa,  0.0 hi,  0.5 si,  0.0 st
```

| Dominant field | What's happening | Where to look next |
|---|---|---|
| `us` | Application code running in user space | The process and thread (Step 3) |
| `sy` | Kernel work: syscalls, locking, networking, page faults | Syscall pattern, context switches (Scenario 3) |
| `si` | Softirq: packet processing | Network traffic level, NIC queues/IRQ balance |
| `wa` | CPU idle while I/O is outstanding | Storage, not CPU |
| `st` | Hypervisor ran someone else on your vCPU | The VM host or instance type (Scenario 4) |

Then press `1` for per-core. A single core at 100% while the others idle means a single-threaded bottleneck. Adding cores will do nothing for it.

---

## Step 3: Which process, which thread?

In `top`, the list is sorted by `%CPU` by default (press `P` if it isn't). That number is per-core: a process using two full cores shows ~200%.

Avoid relying on `ps aux --sort=-%cpu` here. `ps` reports CPU time averaged over the whole lifetime of the process, so a service that started spinning five minutes ago after a week of idling will barely register. For a current, scriptable view use `pidstat` from sysstat:

```bash
pidstat -u 5 1                            # per-process %usr, %system, %CPU over 5 seconds
```

Like top, pidstat's `%CPU` can exceed 100% for multithreaded processes.

Once you have a PID, look inside it:

```bash
top -H -p 8823                           # one line per thread
ps -L -p 8823 -o tid,pcpu,stat,comm --sort=-pcpu | head
```

The two patterns that matter:

- **One thread at ~100%, the rest idle.** A tight loop, a single-threaded event loop saturated, or one thread doing all the work.
- **Many threads each moderately busy.** Genuine parallel load, or lock contention (look at `sy` and context switches).

Also check how long the process has been running and what exactly it is:

```bash
ps -p 8823 -o pid,ppid,user,etime,stat,args
```

---

## Step 4: What is it actually doing?

### perf: where the CPU time goes

`perf` samples the stack with low overhead and is the right first tool for user-space CPU:

```bash
perf top -p 8823                          # live view of hottest functions
perf record -F 99 -g -p 8823 -- sleep 30  # 30-second profile with call graphs
perf report
```

For interpreted or JIT runtimes (Java, Node.js, Python) you'll see JIT or interpreter frames unless symbol maps are enabled. Use the runtime's own tools for readable stacks:

```bash
jstack 8823 > /tmp/jstack.txt             # Java: then match thread IDs
printf '%x\n' 8841                        # top -H thread ID -> hex nid in jstack
py-spy top --pid 8823                     # Python (if py-spy is installed)
```

### strace: syscall pattern (use with care)

```bash
timeout 15 strace -c -f -p 8823
```

`strace -c` prints a per-syscall summary when it stops; without `timeout` it runs until you press Ctrl+C. Be aware that strace uses ptrace and can slow a busy process down a lot, so keep the window short on production.

How to read it:

- Dominated by `futex`: threads waiting on locks.
- Dominated by `read`/`write`/`sendto`/`recvfrom` with huge call counts: many tiny I/O operations.
- Dominated by `clone`/`execve`: something keeps spawning processes.
- Almost no syscalls while the process is at 100%: pure computation in user space. perf is the tool for that.

### Logs around the start time

```bash
journalctl -u myapp --since "15:30" --until "15:45" --no-pager | grep -iE "warn|error|gc|timeout"
```

A batch job starting at 15:31 that matches the CPU graph is not an incident. A retry storm against a failing dependency is.

---

## Typical scenarios

### Java process at 200% with two hot threads

`top -H -p` shows two threads near 100%. Convert their TIDs to hex and find them in `jstack`. If they're named like `GC Thread#0` or `G1 Conc#0`, the JVM is collecting garbage nonstop, usually because the heap is nearly full. Check with:

```bash
jstat -gcutil 8823 1000 5                 # O column near 100 with FGC climbing = heap pressure
```

That's a memory problem showing up as CPU. See [Linux Memory Leak Troubleshooting](/blog/linux-memory-leak-troubleshooting).

### CPU at 80%, no single process above 10%

Many processes each taking a slice: a forking workload (CGI, shell loops in cron, a health check spawning processes every second) or too many workers for the core count.

```bash
vmstat 1 5                     # r column vs nproc
pidstat -w 1 5                 # cswch/s and nvcswch/s per process
```

There's no universal "too many context switches" threshold; a busy server can do tens of thousands per second without trouble. What matters is a big change from your baseline, especially a rise in **involuntary** switches (`nvcswch/s`), which means tasks are being preempted because there are more runnable tasks than CPUs.

Short-lived processes are easy to miss in top because they exit between refreshes. If you suspect them, `execsnoop` (from bcc-tools or bpftrace) lists every new process.

### High `%sy`

```
%Cpu(s): 12.3 us, 67.4 sy,  0.0 ni, 18.1 id,  1.8 wa,  0.0 hi,  0.4 si,  0.0 st
```

The kernel is doing most of the work. Common causes: lock contention (`futex`), very high syscall rates from small reads/writes, heavy page-fault activity under memory pressure, or a lot of process creation. `perf top` (system-wide, no `-p`) shows the hot kernel functions directly, which is usually faster than guessing.

### High steal time on a VM

```
%Cpu(s): 15.2 us,  3.1 sy,  0.0 ni, 42.3 id,  0.4 wa,  0.0 hi,  0.2 si, 38.8 st
```

Nearly 40% of the time, your vCPU was ready to run but the hypervisor ran something else. Nothing inside the guest fixes that. Common causes are a noisy neighbor on an oversubscribed host, or a burstable instance type (for example AWS T-series) that has used up its CPU credits. Options: move or resize the instance, switch to a non-burstable type, or raise it with the provider.

---

## Before you kill or restart

- **Find out what it is.** A backup, reindex or batch job at 100% may be working as designed.
- **Capture evidence first.** A `jstack`, a 30-second `perf record`, or at least `top -H -b -n 1 -p <PID>` output. After a restart, it's gone.
- **Prefer `kill` (SIGTERM) to `kill -9`.** SIGKILL gives the process no chance to flush data or release locks, and a supervisor like systemd will often just start it again.
- **Don't scale out before diagnosing.** An infinite loop or a retry storm runs on every new server too.

---

## Quick checklist

1. `uptime` + `vmstat 1 5`: is it CPU (`r` high) or I/O (`b`/`wa` high)?
2. `top`, press `1`: which field dominates, and is it one core or all?
3. Find the process (`top`, `pidstat`) and the thread (`top -H -p`).
4. See what it's doing: `perf top`, runtime stack dump, short `strace -c`.
5. Check logs for what started at that moment.
6. Capture evidence, then fix or restart.

---

*Related: [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) for the whole-system triage. [strace Tutorial](/blog/strace-tutorial-linux) for reading syscall output in depth.*
