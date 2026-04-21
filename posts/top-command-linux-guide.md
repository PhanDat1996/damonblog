---
title: "top Command Linux: Real-World Guide to CPU and Process Monitoring"
date: "2026-04-21"
excerpt: "Learn how to use the top command on Linux for production troubleshooting — reading CPU, load average, memory metrics, interpreting process states, and diagnosing high CPU and stuck processes in real incidents."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
slug: "top-command-linux-guide"
---

# top Command Linux: Real-World Guide to CPU and Process Monitoring

## TL;DR

- **`top`** shows a live, auto-refreshing view of CPU, memory, and running processes
- **Load average** (top-right) is the most important number to understand — it tells you if the system is overloaded
- **`%CPU` in top** is a recent interval average — more accurate than `ps` for current spikes
- Press **`1`** inside top to see per-core CPU breakdown
- Press **`M`** to sort by memory, **`P`** to sort by CPU (default)
- **`D` state processes** in top indicate I/O problems — `kill -9` will not help
- Use `top` to watch behavior over time; use `ps` for snapshots you can grep
- For interactive process management at scale, consider `htop` — easier navigation, better visuals

---

## Introduction: When top Is the Right Tool

A service is degraded. CPU is high. Something is consuming resources and you do not know what. You SSH in and run `top`.

The **top command on Linux** gives you an auto-refreshing view of system-wide CPU and memory usage, plus a live process list sorted by resource consumption. It is the closest thing to a real-time health dashboard available from a terminal.

`top` answers a different question than `ps`. Where `ps` gives you a snapshot — a fixed capture of process state — `top` shows you what is happening right now and how it changes over time. That distinction determines which tool to reach for first.

This guide covers how engineers actually use `top` during production incidents: reading the header correctly, sorting processes, interpreting CPU and memory metrics, and diagnosing the problems that show up most often on real servers.

---

## Authority Note

I have used `top` during incidents involving runaway Java GC threads, NFS-induced D-state storms, and multi-tenant servers where one process quietly consumed 80% of CPU for hours before anyone noticed. The interpretation tricks in this guide come from those incidents, not from documentation.

---

## What Is the top Command in Linux?

`top` (table of processes) reads `/proc` continuously and updates its display every 3 seconds by default. It shows two sections:

1. **System summary** — CPU, memory, load average, uptime, task counts
2. **Process list** — sorted by CPU by default, showing per-process resource usage

```bash
# Launch top
top

# Launch and immediately sort by memory
top -o %MEM

# Monitor a specific PID
top -p 1234

# Monitor multiple PIDs
top -p 1234,5678,9012

# Run in batch mode (for scripting)
top -b -n 1 | head -30
```

Unlike `ps`, `top` is interactive. You can sort, filter, kill, and renice processes without leaving the view.

---

## How to Use top to Check CPU Usage

### Reading the CPU line

The first thing to look at after opening `top` is the CPU line:

```
%Cpu(s):  12.3 us,  2.1 sy,  0.0 ni, 84.1 id,  1.2 wa,  0.0 hi,  0.3 si,  0.0 st
```

| Field | Meaning | What triggers it |
|---|---|---|
| `us` | User space CPU | Your application code |
| `sy` | Kernel/system CPU | System calls, I/O operations |
| `ni` | Niced processes | Processes with adjusted priority |
| `id` | Idle | How much CPU is free |
| `wa` | I/O wait | Waiting on disk, NFS, network I/O |
| `hi` | Hardware interrupts | Network cards, disks generating interrupts |
| `si` | Software interrupts | Kernel softirq processing |
| `st` | Steal time | VM hypervisor taking CPU from this VM |

**Reading this in production:**

- **High `us`** → your application is using CPU. Find which process.
- **High `wa`** → I/O bottleneck. Check disk, NFS, network. Process count in `D` state will be high.
- **High `sy`** → lots of system calls. Could be excessive file I/O, context switching, or network traffic.
- **High `st`** → your VM's hypervisor is stealing CPU. This is infrastructure-level, not application-level.
- **Low `id`** → system is under load. How low depends on your workload.

### See per-core CPU (the most useful key in top)

By default, top shows aggregate CPU across all cores. Press **`1`** to toggle per-core view:

```
%Cpu0  :  95.0 us,  3.0 sy,  0.0 ni,  2.0 id,  0.0 wa
%Cpu1  :   2.1 us,  1.5 sy,  0.0 ni, 96.4 id,  0.0 wa
%Cpu2  :   1.8 us,  1.2 sy,  0.0 ni, 97.0 id,  0.0 wa
%Cpu3  :   2.0 us,  1.1 sy,  0.0 ni, 96.9 id,  0.0 wa
```

**This matters:** A single-threaded process can peg one core at 100% while the system aggregate shows only 25% on a 4-core server. Without per-core view, you might not notice the problem.

---

## Understanding Key Metrics in top

### Load Average

```
load average: 2.41, 1.87, 1.23
```

Three numbers: **1-minute**, **5-minute**, **15-minute** averages.

Load average represents the average number of processes either running or waiting to run. On a single-core system, load average of 1.0 means the CPU is exactly at capacity. On a 4-core system, load average of 4.0 means all cores are fully occupied.

**How to interpret it:**

```
Number of CPU cores: 4

Load 0.8  → 20% utilization — healthy
Load 4.0  → 100% utilization — at capacity
Load 6.0  → 150% utilization — overloaded, processes queuing
Load 12.0 → 300% utilization — severely overloaded
```

```bash
# Check core count
nproc
grep -c processor /proc/cpuinfo
```

**Reading the trend:**

- Load **rising** (1-min > 15-min): system is getting more stressed
- Load **falling** (1-min < 15-min): system is recovering
- Load **stable high**: sustained overload — not a spike

**I/O wait and load average:** D-state processes (waiting on I/O) count toward load average even though they are not consuming CPU. A system with load 8 on 4 cores might have 4 processes running and 4 stuck on I/O — not a CPU problem, a storage problem.

### Memory section

```
MiB Mem :  15258.9 total,   8124.3 free,   4212.8 used,   2921.8 buff/cache
MiB Swap:   4096.0 total,   4096.0 free,      0.0 used.   9847.2 avail Mem
```

| Field | What it means |
|---|---|
| `total` | Physical RAM installed |
| `free` | Unused RAM |
| `used` | RAM actively in use by processes |
| `buff/cache` | RAM used by kernel buffers and page cache |
| `avail Mem` | RAM available for new processes (free + reclaimable cache) |

**Critical insight: `avail Mem` is the number that matters, not `free`.**

Linux deliberately uses free RAM for disk cache (buff/cache). That cache is reclaimable — the kernel releases it when a process needs RAM. A server with `free: 200MB` and `avail Mem: 8GB` is not running low on memory. A server with `free: 200MB` and `avail Mem: 300MB` is.

**Swap usage:**
- Any active swap usage (`used` > 0) means the system has needed more RAM than is physically available at some point
- Growing swap usage during an incident = memory pressure increasing
- If swap is full and `avail Mem` is near zero, the system will start OOM-killing processes

### Process list columns

```
  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
 1234 appuser   20   0  512000  98304  12288 R  45.2   0.6   1:23.45 myapp
 5678 root      20   0   89344  12288   8192 S   0.3   0.1   0:00.12 sshd
```

| Column | What it means |
|---|---|
| `PID` | Process ID |
| `PR` | Scheduling priority (lower = higher priority) |
| `NI` | Nice value (-20 to 19, lower = higher priority) |
| `VIRT` | Virtual memory — same as VSZ in ps, often misleading |
| `RES` | Resident memory — **actual physical RAM used** |
| `SHR` | Shared memory (shared libraries, etc.) |
| `S` | Process state (R=running, S=sleeping, D=I/O wait, Z=zombie) |
| `%CPU` | CPU usage in the last interval (not lifetime average) |
| `%MEM` | Physical RAM percentage |
| `TIME+` | Total CPU time consumed (hours:minutes:seconds.tenths) |

**Key insight: `%CPU` in top is the last refresh interval, not lifetime.** This makes it much more useful than `ps` for catching current spikes. A process that just started pegging CPU shows 90% in `top` immediately.

---

## Interactive Keys: Using top Efficiently

You do not need to exit and re-run `top` to change what you see.

| Key | Action |
|---|---|
| `1` | Toggle per-core CPU view |
| `P` | Sort by CPU (default) |
| `M` | Sort by memory (RES) |
| `T` | Sort by TIME+ (total CPU consumed) |
| `k` | Kill a process (prompts for PID and signal) |
| `r` | Renice a process |
| `f` | Field selector — add/remove columns |
| `u` | Filter by user |
| `o` | Filter by condition (e.g. `%CPU>10`) |
| `H` | Toggle thread view (shows individual threads) |
| `d` | Change refresh interval |
| `q` | Quit |
| `W` | Save current configuration |

**The `o` filter is underused.** In a busy system with many processes, you can filter to only show what you care about:

```
# Inside top, press 'o', then type:
%CPU>5.0     # only show processes using >5% CPU
USER=appuser # only show processes owned by appuser
```

---

## Real Troubleshooting Scenarios

### Scenario 1: High CPU — Finding the Culprit

Load average is 7.8 on a 4-core server. Users are reporting slowness.

```bash
top
```

Press `P` (should be default) to sort by CPU. Look at the top 3–5 processes.

```
  PID USER    %CPU  %MEM  COMMAND
 8823 app      89.4   2.1  java
 8901 app       4.2   0.3  java
    1 root       0.1   0.0  systemd
```

PID 8823 is consuming 89% CPU. Now check if it is sustained:

```bash
# Watch this specific PID
top -p 8823
```

- If `%CPU` stays high: sustained load — check application logs for what it is processing
- If `%CPU` fluctuates: bursty — check TIME+ to see how long it has been active
- Press `H` inside top to see per-thread breakdown for that process

```bash
# Outside top: see what the process is actually doing
cat /proc/8823/wchan          # what kernel function it is in
strace -p 8823 -c -e trace=all  # summary of syscalls
```

> *For deeper process investigation beyond top, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging).*

### Scenario 2: High Load but Low CPU Usage

Load average is 12.0 but CPU `%us` is only 20% and `%id` is 60%. This is counterintuitive.

The answer is `%wa` (I/O wait):

```
%Cpu(s):  20.1 us,  5.2 sy,  0.0 ni, 60.0 id, 14.3 wa,  0.0 hi,  0.3 si
```

High `%wa` + high load + low CPU = I/O bottleneck. Processes are queued waiting for disk or NFS.

```bash
# Confirm: look for D-state processes in top
# Press 'o' inside top, type: S=D
# Or from command line:
ps -eo pid,stat,comm | grep ' D'
```

```bash
# Identify what the D-state process is waiting on
cat /proc/<pid>/wchan
# nfs_... = NFS problem
# ext4_... = local disk problem
# jbd2_... = journal I/O
```

This is not a CPU problem. Killing processes or adding application servers will not help. Fix the I/O source.

### Scenario 3: Memory Pressure Building

`avail Mem` is dropping over hours. Swap usage is increasing.

```bash
top
```

Press `M` to sort by RES (resident memory). Look at the top consumers.

```
  PID USER    %CPU  %MEM    RES  COMMAND
 2341 app       2.1  28.4  4.3g  java
 4521 mysql     0.8  15.2  2.3g  mysqld
 7823 app       1.2   8.1  1.2g  node
```

Compare RSS across processes of the same type:

```bash
# Are all java instances using similar memory?
ps aux | grep -v grep | grep java | awk '{print $2, $6}' | sort -k2 -rn
```

If one instance has significantly higher RSS than others of the same type, that is your leak candidate.

```bash
# Track it over time
while true; do
  echo "$(date): $(ps -p 2341 -o rss= | tr -d ' ') KB"
  sleep 60
done | tee /tmp/mem_track.log
```

> *For a detailed ps-based memory tracking workflow, see [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide).*

### Scenario 4: Zombie Process Accumulation

In the top header line:

```
Tasks: 287 total,   3 running, 281 sleeping,   0 stopped,   3 zombie
```

Three zombies. In top's process list, sort and look for `S = Z`:

```bash
# Press 'o' inside top, type: S=Z
```

Or from outside:

```bash
ps -eo pid,ppid,stat,comm | grep ' Z'
```

Zombies cannot be killed — they are already dead. Find the parent and investigate why it is not reaping its children.

---

## Common Mistakes Engineers Make with top

**Mistake 1: Panicking at high memory `used` in the header.**
The `used` field includes buff/cache, which the kernel reclaims freely. Always look at `avail Mem` — that is what is actually available for new processes. A server showing "14GB used of 16GB" with "12GB avail Mem" is not in memory trouble.

**Mistake 2: Treating `%CPU` in top as instantaneous.**
`%CPU` is averaged over the refresh interval (default 3 seconds). It is more current than `ps`'s lifetime average, but it is not a real-time per-second reading. A brief 100ms spike will be diluted across the interval. For genuine spike detection, reduce the interval with `d` or use tools like `perf` and `sar`.

**Mistake 3: Ignoring `%wa` (I/O wait).**
Engineers focus on `%us` and miss that 20% `%wa` is causing load average of 8. High I/O wait means processes are queuing for disk or network I/O — the CPU is not the problem, the storage is. Adding CPU cores or killing application processes will not fix it.

**Mistake 4: Not pressing `1` to see per-core breakdown.**
On a multi-core server, aggregate CPU is often misleading. One thread pegging a single core shows as 25% on a 4-core system. That 25% might not look alarming — but that thread is completely bottlenecked and all work assigned to it is queued.

**Mistake 5: Using top to kill processes in production.**
The `k` key in top sends a signal to a process. The problem: you are working with a constantly-refreshing display, and process list position shifts as you type. It is easy to kill the wrong PID. Use `kill` or `pkill` from the command line where you can confirm the exact PID before acting.

**Mistake 6: Confusing load average with CPU percentage.**
Load average of 4.0 on a 4-core server does not mean 100% CPU. It means there are 4 processes on average either running or waiting (including I/O-waiting processes). CPU at 100% utilization would show `id` near 0 — that is a different and complementary signal.

---

## top vs ps: When to Use Which

Both tools read `/proc` and report process information. The right tool depends on what question you are asking.

| Situation | Use |
|---|---|
| Need to watch CPU/memory changing in real time | `top` |
| Need to find which process just spiked | `top` (sorts by current interval) |
| Need to grep, pipe, or script against process list | `ps` |
| Need to see full command line with arguments | `ps -ef` |
| Need to trace parent-child relationships (PPID) | `ps -ef` |
| Need to capture process state at an exact moment | `ps` |
| Need to kill or renice interactively | `top` (though `kill`/`renice` are safer) |
| Need to monitor a single PID over time | `top -p <pid>` |
| Need to filter processes interactively | `top` with `o` filter |
| Need sorted output for a report or postmortem | `ps -eo --sort` |

**General rule:** Use `top` first to get situational awareness. Once you have identified the problem process, switch to `ps` for detailed inspection and to `strace`/`lsof` for deeper investigation.

> *For a complete `ps` workflow guide, see [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide).*

---

## top vs htop: Brief Comparison

`htop` is a modern alternative to `top` with a better interface and more features. It is not installed by default but is available in all major Linux package managers.

```bash
# Install htop
apt install htop    # Ubuntu/Debian
dnf install htop    # RHEL/Fedora
```

| Feature | top | htop |
|---|---|---|
| Default install | ✅ Always available | ❌ Requires install |
| Per-core CPU bars | Toggle with `1` | Visual bars by default |
| Mouse support | ❌ | ✅ |
| Kill/renice UI | Basic | Visual with confirmation |
| Process tree view | `V` key | Built-in toggle |
| Color coding | Minimal | Full color |
| Filter/search | `o` key | `/` key — simpler |
| Scrolling | Limited | Full horizontal/vertical |

**Use `top` when:** You are on a system without `htop`, in a restricted environment, or in a script with `-b` batch mode.

**Use `htop` when:** You have it available and you prefer a more navigable interface.

---

## Quick Reference

```bash
# ── LAUNCH ──────────────────────────────────────────────────────
top                    # standard launch
top -p 1234            # monitor specific PID
top -u appuser         # filter by user at launch
top -b -n 1            # batch mode, single snapshot (for scripting)
top -o %MEM            # launch sorted by memory

# ── INTERACTIVE KEYS ────────────────────────────────────────────
1    # toggle per-core CPU view
P    # sort by CPU
M    # sort by memory
T    # sort by total CPU time
k    # kill process
r    # renice process
H    # toggle thread view
u    # filter by user
o    # filter by condition (%CPU>5.0, USER=root, etc.)
f    # field selector
d    # change refresh interval
q    # quit
W    # save configuration

# ── READ THE HEADER ─────────────────────────────────────────────
# Load average > number of cores = overloaded
# %wa > 10% = I/O bottleneck, check disk/NFS
# %us high = application CPU
# %sy high = system calls, context switching
# avail Mem low = memory pressure (not 'free')
# Zombie count > 5 = parent process problem
```

---

## Conclusion

The `top` command on Linux is the fastest way to answer "what is happening on this system right now?" It gives you CPU utilization, memory pressure, load average, and a live process list in a single view.

The engineers who use `top` effectively know how to read the header correctly — understanding load average relative to core count, distinguishing I/O wait from CPU usage, and recognizing that `avail Mem` matters more than `free`. They press `1` to see per-core breakdown. They use the `o` filter instead of scrolling through hundreds of processes.

**`top` is situational awareness. `ps` is surgical investigation.** Use both, in that order.

Learn the header first. Learn the CPU breakdown. Learn what load average actually means on your hardware. Those three things alone will make you faster at diagnosing the majority of Linux production incidents.

---

*Related reading: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — for snapshots, scripting, and process tree investigation. [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — for the next layer of investigation after top identifies the culprit.*