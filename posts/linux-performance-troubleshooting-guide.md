---
title: "Linux Performance Troubleshooting: The First 10 Minutes"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Linux server slow and you don't know why? A 10-command triage that tells CPU, memory, disk and network problems apart, and where to dig next."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: true
category: "linux"
---

"The server is slow." That's all the ticket says. Response times doubled, the load average graph looks like a ski jump, and someone has already suggested adding more CPU.

Before anyone adds anything, spend ten minutes finding out **which resource** is actually the bottleneck. Almost every Linux performance problem ends up in one of four places: CPU, memory, disk I/O or network. The commands below tell them apart, in the order you should run them, and link to a detailed guide for each branch.

---

## The 10-command triage

Run these in order. Each takes a few seconds. The checklist is adapted from Brendan Gregg's well-known "Linux Performance Analysis in 60,000 Milliseconds"; `mpstat`, `pidstat`, `iostat` and `sar` are in the `sysstat` package.

```bash
uptime                       # 1. load trend
journalctl -k -n 30          # 2. kernel errors: OOM kills, I/O errors, hung tasks
vmstat 1 5                   # 3. run queue, blocked tasks, swap activity, CPU split
mpstat -P ALL 1 3            # 4. per-CPU: one hot core? steal?
pidstat 1 3                  # 5. which processes are using CPU right now
iostat -xz 1 3               # 6. per-disk latency and utilization
free -h                      # 7. available memory
sar -n DEV 1 3               # 8. network throughput per interface
ss -s                        # 9. socket summary: counts by state
top                          # 10. confirm and look around
```

What you're looking for in each:

| # | Look at | Points to |
|---|---|---|
| 1 | Load vs `nproc`, and 1-min vs 15-min | Busy and getting worse or better (but see the load caveat below) |
| 2 | `Out of memory`, `I/O error`, `blocked for more than`, `nf_conntrack: table full` | Problems the kernel already noticed. Often the answer is right here |
| 3 | `r` > CPU count; `b` > 0; `si`/`so` > 0; `wa`, `st` | CPU queueing; tasks blocked on I/O; active swapping |
| 4 | One CPU at 100%, others idle; `%steal` | Single-threaded bottleneck; hypervisor contention |
| 5 | `%CPU` per process | The CPU consumer, measured now (not lifetime like `ps`) |
| 6 | `r_await`/`w_await`, `aqu-sz`, `%util` | Slow or saturated storage |
| 7 | `available` column | Real memory headroom |
| 8 | `rxkB/s`, `txkB/s` vs link speed | Network saturation |
| 9 | Large `timewait`, `estab` counts | Connection churn, leaks |
| 10 | Everything at once | Sanity check |

Skip the first line of `vmstat` output, and the first sample of `pidstat`/`iostat` if they print a since-boot summary. They're averages since boot.

---

## Read the load average correctly

```
 14:21:07 up 31 days,  4:10,  2 users,  load average: 12.41, 9.80, 6.02
```

On Linux the load average counts tasks that are **running, waiting for a CPU, or in uninterruptible sleep (D state)**. So a load of 12 on 4 CPUs means one of two very different things:

- **CPU saturation**: `vmstat` shows `r` around 12 and `id` near 0.
- **I/O blocking**: `vmstat` shows `b` high, CPUs largely idle, `wa` up. Tasks are stuck on disk or NFS.

Never conclude "CPU problem" from load alone. [How to Check Uptime in Linux](/blog/how-to-check-uptime-linux) covers load in more depth.

### Pressure stall information (kernel 4.20+)

If your kernel has PSI, it answers "is anything waiting on this resource?" more directly than load does:

```bash
grep . /proc/pressure/{cpu,memory,io}
```

```
/proc/pressure/cpu:some avg10=38.12 avg60=31.40 avg300=18.77 total=982341288
/proc/pressure/cpu:full avg10=0.00 avg60=0.00 avg300=0.00 total=0
/proc/pressure/memory:some avg10=0.00 avg60=0.00 avg300=0.00 total=10392
/proc/pressure/memory:full avg10=0.00 avg60=0.00 avg300=0.00 total=8730
/proc/pressure/io:some avg10=1.20 avg60=0.91 avg300=0.64 total=40128811
/proc/pressure/io:full avg10=0.85 avg60=0.66 avg300=0.40 total=31002871
```

`some avg10=38.12` for CPU means that over the last 10 seconds, at least one runnable task was waiting for a CPU 38% of the time. `full` means **all** non-idle tasks were stalled at once. Memory `full` that isn't near zero is serious: the system is spending real time reclaiming memory instead of doing work. Some distros need `psi=1` on the kernel command line to enable it.

---

## Branch 1: CPU

**Signs:** `r` consistently above `nproc`, low `id`, high `us` or `sy`, PSI cpu `some` high.

Questions to answer, in order:

1. **What kind of CPU time?** `us` is application code, `sy` is kernel work on its behalf, `si` is packet processing, `st` is a hypervisor taking your CPU. Each has a different fix.
2. **One core or all?** Press `1` in `top` or check `mpstat -P ALL`. A single pinned core is a single-threaded bottleneck; adding cores won't help.
3. **Which process and which thread?** `pidstat 1`, then `top -H -p <PID>`.
4. **Doing what?** `perf top -p <PID>` or the runtime's stack dump (`jstack`, `py-spy`).

Watch out for two common misreadings: `ps` `%CPU` is averaged over the process's lifetime, so a process that started spinning recently looks quiet. And `top` shows per-process CPU relative to one core, so 300% is normal for a busy multithreaded service.

- Quick numbers: [How to Check CPU Usage in Linux](/blog/check-cpu-usage-linux)
- Full workflow, including steal time and `%sy`: [Linux High CPU Usage: How to Find the Real Cause](/blog/linux-high-cpu-usage-guide)
- Every field and key in top: [top Command in Linux](/blog/top-command-linux-guide)

---

## Branch 2: Memory

**Signs:** `available` in `free -h` low and falling, `si`/`so` non-zero in vmstat, OOM kills in the kernel log, PSI memory above zero.

The two mistakes that waste the most time:

- **Reading `free` instead of `available`.** Linux fills idle RAM with page cache. 200 MB "free" on a 16 GB server is normal. `available` is the kernel's estimate of what applications can still get.
- **Reading swap "used" as a problem.** Swap that was written once and never touched again is harmless. Ongoing `si`/`so` is what hurts.

When you do have pressure, find the consumer (`ps -eo pid,rss,comm --sort=-rss | head`), then decide whether it's a leak (anonymous memory growing regardless of load) or a configuration issue (heap or cache sized larger than the box or container limit). Inside containers, `free` shows the host; check the cgroup's `memory.max` and `memory.current`.

- Reading `free`, `top` and `/proc/meminfo`: [Check Memory Usage in Linux](/blog/linux-check-memory-usage-free-top)
- Proving and locating a leak: [Linux Memory Leak Troubleshooting](/blog/linux-memory-leak-troubleshooting)

---

## Branch 3: Disk I/O and storage

**Signs:** `b` > 0 and `wa` up in vmstat, many tasks in `D` state, high `await` in iostat, PSI io `full` above zero.

```bash
iostat -xz 1 3
```

```
# trimmed to the most useful columns
Device            r/s     w/s     rkB/s     wkB/s  r_await  w_await  aqu-sz  %util
nvme0n1          12.0  1840.0     96.0  98304.0     0.41    18.72   34.52   99.60
```

`w_await` of 18 ms on an NVMe device with `aqu-sz` of 34 and `%util` at 99.6: the device is saturated with writes. On NVMe and RAID devices, `%util` near 100% doesn't by itself prove saturation (they serve many requests in parallel), so lean on `await` and queue size. Exact column names vary between sysstat versions.

Then find who's writing (`pidstat -d 1` or `iotop -o`) and check whether something is actually broken: I/O errors in `journalctl -k`, or a filesystem that's full.

```bash
ps -eo stat,pid,wchan:32,args | awk '$1 ~ /^D/'    # what is blocked, and on what
```

Waits in `rpc_*` or `nfs_*` point at an NFS server, not local disk.

- Reading iostat properly: [Check Disk I/O with iostat](/blog/linux-check-disk-io-iostat)
- D state, zombies and what each state means: [Linux Process States](/blog/linux-process-states-guide)
- Out of space: [Check Disk Usage with du and df](/blog/check-disk-usage-linux-du-df) and [Disk Full on Linux](/blog/disk-full-linux-cleanup)

---

## Branch 4: Network and connections

**Signs:** throughput close to link speed in `sar -n DEV`, many retransmits, connection errors in application logs, huge socket counts in `ss -s`.

```bash
sar -n DEV 1 3                 # rxkB/s, txkB/s per interface
sar -n TCP,ETCP 1 3            # active/passive opens, retransmits
ss -s                          # totals by state
ss -tan state time-wait | wc -l
```

A large `TIME-WAIT` count is normal on a busy server that opens many short outbound connections; it becomes a problem only when you run out of local ports toward one destination, which shows up as `Cannot assign requested address` errors. `CLOSE-WAIT` piling up is different: your application isn't closing sockets the peer already closed, which is a bug, and it usually ends in "too many open files."

- [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained)
- [Check Open Connections in Linux](/blog/linux-check-open-connections)
- [Too Many Open Files](/blog/too-many-open-files-linux-fix)
- [NGINX 502 Under Load](/blog/nginx-502-under-load) when the symptom is a proxy returning errors

---

## When none of the four is saturated

CPU idle, memory fine, disks quiet, network calm, and the app is still slow. Then the time is being spent **waiting on something else**: a lock, a database, a downstream API, DNS, a connection pool that's too small.

- Look at what the threads are waiting on: `ps -L -o tid,stat,wchan:32 -p <PID>`, or a stack dump from the runtime.
- Time the dependencies from the box: `curl -w '%{time_connect} %{time_starttransfer}\n' -o /dev/null -s <url>`, `dig` for DNS.
- Use `strace -f -T -p <PID>` briefly to see which syscalls take long. Keep it short on production: strace slows the traced process significantly.
- Correlate with logs around the time it started: [Linux Log Analysis](/blog/linux-log-analysis-guide) and [journalctl by Time Range](/blog/journalctl-filter-time-range).

[Linux Debugging Tools](/blog/linux-debugging-tools-guide) and the [strace Tutorial](/blog/strace-tutorial-linux) cover these tools in depth.

---

## Picking the right tool

| Question | Command | Guide |
|---|---|---|
| What's running? Is my service up? | `ps aux`, `pgrep -a`, `systemctl status` | [Check Running Processes](/blog/check-running-process-linux) |
| What do the ps columns mean? | `ps -eo ...` | [ps Command in Linux](/blog/ps-command-linux-troubleshooting) |
| Find a PID from a name | `pgrep -x`, `pgrep -f`, `pidof` | [Find a Process by Name](/blog/linux-find-process-by-name) |
| Live view | `top`, `htop` | [htop vs top](/blog/htop-vs-top-linux) |
| What's busy right now (scriptable)? | `pidstat 1` | [Check CPU Usage](/blog/check-cpu-usage-linux) |
| What files and sockets does it hold? | `lsof -p`, `ss -p` | [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) |
| What happened at 3 a.m.? | `sar -f`, `journalctl --since` | [Linux Log Analysis](/blog/linux-log-analysis-guide) |

---

## Before you restart anything

Restarting often clears the symptom and destroys the evidence. Take 60 seconds first:

```bash
mkdir -p /tmp/incident-$(date +%F-%H%M) && cd "$_"
top -b -n 2 -d 2 > top.txt
ps -eo pid,ppid,user,stat,etime,%cpu,rss,wchan:32,args > ps.txt
vmstat 1 5 > vmstat.txt
free -m > free.txt
ss -s > ss.txt
journalctl -k -n 200 > kernel.txt
```

Add a thread dump or a short `perf record` of the hot process if you can. Then restart.

---

**What should I check first when a Linux server is slow?**
`uptime`, then the kernel log, then `vmstat 1`. Those three tell you whether the problem is CPU queueing, blocked I/O, swapping or something the kernel already logged, in under a minute.

**Why is load average high when CPU usage is low?**
Linux counts tasks in uninterruptible sleep (usually waiting on disk or NFS) in the load average. Check for `D`-state tasks and look at disk latency with `iostat -x`.

**Is high iowait a disk problem?**
Not necessarily. `wa` is idle CPU time while I/O is outstanding: it says CPUs had nothing else to do while waiting. A busy system can have slow storage and low `wa`. Use `iostat -x` latency and PSI io to judge storage directly.

**Should I add more CPU or RAM?**
Only after the triage shows that resource is saturated. A leak fills any amount of RAM, a single-threaded bottleneck ignores extra cores, and steal time or slow storage isn't fixed by either.
