---
title: "top Command in Linux: Read Every Line, Use Every Key"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "What load average, wa, st, VIRT/RES and 300% CPU mean in top, plus the keys and batch-mode flags you actually need when a Linux server is misbehaving."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
category: "linux"
---

You run `top` on a slow server. Load average 7.8. One process at 312% CPU. Memory `free` is 200 MB. Swap has something in it. Which of these is the problem?

Possibly none of them. Most of top's numbers are easy to misread: load isn't CPU, `%CPU` isn't capped at 100, `free` isn't free memory. This guide goes through the screen line by line, then covers the keys and flags that make top useful during an incident.

`top` here means the procps-ng version shipped by every mainstream distro. BusyBox top (Alpine, many containers) is much simpler and lacks most keys below.

---

## The header, line by line

```
top - 15:42:07 up 14 days,  2:31,  3 users,  load average: 7.82, 5.41, 3.10
Tasks: 287 total,   5 running, 279 sleeping,   0 stopped,   3 zombie
%Cpu(s): 71.3 us,  6.2 sy,  0.0 ni, 20.1 id,  1.8 wa,  0.0 hi,  0.6 si,  0.0 st
MiB Mem :  15999.4 total,    212.7 free,   9384.0 used,   6402.7 buff/cache
MiB Swap:   4096.0 total,   3968.0 free,    128.0 used.   6112.9 avail Mem
```

### Line 1: uptime and load average

`load average: 7.82, 5.41, 3.10` are the 1, 5 and 15-minute averages of tasks that are **running, waiting for a CPU, or in uninterruptible sleep (D state)**. On Linux that last group is usually tasks waiting on disk or NFS, which don't use CPU at all.

So compare load against the CPU count (`nproc`) as a hint, not a verdict:

- Load above `nproc` and `id` near 0: CPU saturation.
- Load above `nproc` with plenty of `id` and some `wa`: tasks are blocked on I/O.
- 1-minute higher than 15-minute: getting worse. Lower: recovering.

[How to Check Uptime in Linux](/blog/how-to-check-uptime-linux) covers load in more depth.

### Line 2: tasks

Counts by state. A handful of `zombie` is a parent process not reaping its children; zombies use no CPU or memory beyond a process table entry. A growing number is worth chasing. [Linux Process States](/blog/linux-process-states-guide) explains each state.

### Line 3: CPU split

| Field | Meaning |
|---|---|
| `us` | User-space code (applications) |
| `sy` | Kernel code running on behalf of processes |
| `ni` | User-space code of niced (lower priority) processes |
| `id` | Idle |
| `wa` | Idle while I/O is outstanding. A form of idle, not busy |
| `hi` / `si` | Hardware / software interrupt handling |
| `st` | Steal: your vCPU was ready but the hypervisor ran another guest |

Press `1` to split this per CPU. One core at 100% shows as 25% on a 4-core aggregate line, and you'd miss it.

The first screen after starting top shows CPU percentages averaged since boot, because there's no previous sample yet. Wait for the second refresh before reading it.

### Lines 4–5: memory

Read **`avail Mem`** (end of the swap line), not `free`. Linux uses spare RAM as page cache (`buff/cache`) and gives most of it back when programs need it. 212 MB free with 6.1 GB available is a healthy box. `used` doesn't include `buff/cache`.

`128.0 used` swap is only a concern if pages are actively moving; check `si`/`so` in `vmstat 1`. Details in [Check Memory Usage in Linux](/blog/linux-check-memory-usage-free-top).

---

## The process list

```
    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
   8823 app       20   0 6843120   2.0g  15720 S 312.6  13.1 482:17.03 java
   3012 postgres  20   0 4412880 512400 498112 S   4.3   3.2  45:02.11 postgres
    911 root      20   0       0      0      0 I   0.3   0.0   2:10.48 kworker/u8:2-events_unbound
```

| Column | Meaning |
|---|---|
| `PR` | Kernel scheduling priority. `20` is normal; `rt` is a real-time task |
| `NI` | Nice value, -20 (highest priority) to 19 (lowest) |
| `VIRT` | All virtual memory mapped. Mostly meaningless for "how much RAM" |
| `RES` | Resident memory in RAM, **including shared pages** |
| `SHR` | The shared/file-backed part of `RES` |
| `S` | State: `R` running, `S` sleeping, `D` uninterruptible, `Z` zombie, `T` stopped, `I` idle kernel thread |
| `%CPU` | CPU used **since the last refresh**, per core |
| `TIME+` | Total CPU time used since the process started |

### Why `%CPU` says 312.6

By default top runs in **Irix mode**: 100% means one full CPU, so a process using three cores shows ~300%. Press `Shift+I` to switch to Solaris mode, where the value is divided by the number of CPUs and never exceeds 100%. Neither is wrong; just know which one you're looking at.

### RES doesn't add up

Because `RES` counts shared pages fully for every process, summing it across PostgreSQL backends or forked workers gives a total larger than physical RAM. For a fair per-process number, use PSS from `/proc/<PID>/smaps_rollup`.

---

## Keys worth knowing

| Key | Does |
|---|---|
| `1` | Per-CPU lines |
| `P` / `M` / `T` | Sort by CPU / memory / cumulative time |
| `<` / `>` | Move the sort column left / right |
| `c` | Show full command line instead of just the name |
| `H` | Show threads instead of processes |
| `V` | Forest (tree) view |
| `u` | Show one user's processes |
| `o` / `O` | Add a filter (case-insensitive / case-sensitive) |
| `=` | Clear filters |
| `Shift+I` | Toggle Irix/Solaris `%CPU` mode |
| `e` / `E` | Change memory units in the list / the header |
| `d` or `s` | Change refresh interval |
| `k` | Send a signal to a PID |
| `W` | Save current layout to the config file |
| `q` | Quit |

### Filters

Press `o` and type a condition. Some useful ones:

```
%CPU>5.0          only processes above 5% CPU
COMMAND=nginx     only nginx
S=D               only tasks in uninterruptible sleep
S=Z               only zombies
```

Filters stack; press `=` to clear them. `S=D` is the quickest way to see what's behind a high load average with idle CPUs.

### Killing from top

`k` asks for a PID (defaulting to the task at the top of the list) and then a signal (default 15, SIGTERM). Because the list re-sorts every refresh, it's easy to hit the wrong process. During an incident, copy the PID and use `kill <PID>` from another shell. Use `kill -9` only after SIGTERM failed, since SIGKILL gives the process no chance to flush or clean up.

---

## Command-line flags

```bash
top -p 8823,3012          # only these PIDs
top -u app                # only this user
top -H -p 8823            # threads of one process
top -o %MEM               # start sorted by memory
top -c                    # start with full command lines
top -d 1                  # refresh every second
```

### Batch mode for logs and tickets

```bash
top -b -n 1 | head -20                       # one quick snapshot
```

The **first** batch iteration has since-boot numbers in the `%Cpu` line. For anything you'll base a decision on, take two iterations and read the second:

```bash
top -b -n 2 -d 2 -o %CPU > top-snapshot.txt  # read the second block in the file
top -b -H -n 1 -p 8823 > threads-8823.txt    # thread snapshot, for a bug report
```

Want the output wider so commands aren't cut off? Add `-w 512`.

---

## top vs ps vs htop

| Need | Use |
|---|---|
| What's busy right now, changing live | `top` |
| A snapshot to grep, sort or script | `ps` (see [ps for troubleshooting](/blog/ps-command-linux-troubleshooting)) |
| Tree view, mouse, scrolling, easier filtering | `htop` (see [htop vs top](/blog/htop-vs-top-linux)) |
| Per-process rates in a script | `pidstat` from sysstat |

Remember that `ps` `%CPU` is a lifetime average, while top's is per refresh interval. They'll disagree, and both are correct.

---

## Reading top during an incident

1. Wait for the second refresh. Press `1`.
2. Load vs `nproc`, then `id`, `wa`, `st`: CPU-bound, I/O-bound, or starved by the hypervisor?
3. `P` for the top CPU consumer, `M` for memory. `c` to see what it really is.
4. `H` or `top -H -p <PID>` if one process dominates.
5. `o` then `S=D` if load is high but CPU is idle.
6. Save a `top -b` snapshot before restarting anything.

For the full workflow behind steps 2–4, see [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide).
