---
title: "How to Check CPU Usage in Linux (and Read the Numbers)"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Check CPU usage in Linux with top, mpstat, vmstat and ps, and learn what us, sy, wa and st mean, so a single busy core or VM steal doesn't fool you."
tags: ["linux", "monitoring", "troubleshooting", "infrastructure"]
featured: false
category: "linux"
---

You need a CPU number right now: for an alert, a ticket, or a baseline before a deploy. Linux has several tools for this and they disagree with each other, because they measure different things over different time windows.

Here are the commands, then what the numbers actually mean.

```bash
top                              # live overall + per-process view (press 1 for per-core)
mpstat -P ALL 1 5                # per-core breakdown, 5 one-second samples
vmstat 1 5                       # run queue + CPU split, 1-second samples
ps aux --sort=-%cpu | head       # biggest CPU users (lifetime average!)
nproc                            # how many CPUs you have
```

If the CPU is actually pegged and you need to find out why, go to [Linux High CPU Usage: How to Find the Real Cause](/blog/linux-high-cpu-usage-guide). This page is the quick read.

---

## top: overall usage in one line

```bash
top
```

The third line is the CPU summary:

```
%Cpu(s): 23.4 us,  5.1 sy,  0.0 ni, 68.2 id,  2.8 wa,  0.0 hi,  0.5 si,  0.0 st
```

| Field | Meaning | When it's high |
|---|---|---|
| `us` | User space (your applications) | An app is doing real work, or spinning |
| `sy` | Kernel, on behalf of processes | Lots of syscalls, networking, context switches |
| `ni` | User space for processes with a positive nice value | Batch jobs you deliberately deprioritized |
| `id` | Idle | Free capacity |
| `wa` | I/O wait: idle **while** I/O is outstanding | Something waits on disk or NFS |
| `hi` / `si` | Hardware / software interrupts | Very high packet rates, busy NICs |
| `st` | Steal: time the hypervisor gave your vCPU to someone else | VM host is oversubscribed, or burst credits are gone |

Total "busy" CPU is roughly `100 - id - wa`.

Two things here trip people up:

- **`wa` is a kind of idle time.** The CPU has nothing to run while a process waits on I/O. A high `wa` means "CPU is free, storage is slow". A *low* `wa` does not prove storage is fine: if the CPU is busy with other work, iowait time doesn't accumulate.
- **`st` only exists on virtual machines.** If it's consistently above a few percent, part of the CPU you're paying for is going to other guests. Tuning your application won't fix that.

### Press 1 for per-core

Inside `top`, press `1`. On a 4-core box, one thread pinning a single core shows as about **25%** in the aggregate line. That looks harmless, but everything handled by that thread is queued.

### Why a process shows 180% CPU

In the process list, top's `%CPU` is **per CPU** by default (called Irix mode). A multithreaded process using two full cores shows `200.0`. Press `Shift+I` to switch to Solaris mode, which divides by the number of CPUs so the column tops out at 100%.

---

## mpstat: clean per-core numbers

`mpstat` is in the `sysstat` package (`apt install sysstat` or `dnf install sysstat`).

```bash
mpstat -P ALL 1 5
```

```
10:15:03 AM  CPU    %usr   %nice    %sys %iowait    %irq   %soft  %steal  %guest  %gnice   %idle
10:15:04 AM  all   24.81    0.00    3.01    0.25    0.00    0.25    0.00    0.00    0.00   71.68
10:15:04 AM    0   96.00    0.00    3.00    0.00    0.00    1.00    0.00    0.00    0.00    0.00
10:15:04 AM    1    1.01    0.00    3.03    0.00    0.00    0.00    0.00    0.00    0.00   95.96
10:15:04 AM    2    1.00    0.00    3.00    1.00    0.00    0.00    0.00    0.00    0.00   95.00
10:15:04 AM    3    1.98    0.00    2.97    0.00    0.00    0.00    0.00    0.00    0.00   95.05
```

`all` says 25%. CPU 0 says 96%. That pattern is a single-threaded bottleneck, and it's invisible without the per-core view. It ends with an `Average:` block, which is handy for pasting into a ticket.

---

## vmstat: is anything waiting for CPU?

```bash
vmstat 1 5
```

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 812456  94196 4123456    0    0     3    21  180  320  6  2 92  0  0
 6  0      0 812300  94196 4123460    0    0     0    48 2340 4456 71  6 22  1  0
 7  0      0 812120  94196 4123468    0    0     0    12 2410 4602 74  5 20  1  0
```

- **Ignore the first line.** It's the average since boot, not the current state.
- `r` is the number of runnable tasks (running plus waiting for a CPU). If it stays above `nproc`, processes are queuing for CPU.
- `b` is tasks blocked in uninterruptible sleep, usually on I/O.
- `us sy id wa st` are the same split as top.

Newer procps versions add a `gu` (guest) column at the end. Read columns by header, not by position.

---

## ps: who has been using the CPU

```bash
ps aux --sort=-%cpu | head -6
```

```
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
app         8823 87.3  6.1 5843120 998412 ?      Sl   09:02  41:12 java -jar service.jar
postgres    2210  4.1  1.9 412880 311204 ?       Ss   Oct20  412:51 postgres: checkpointer
root         991  0.6  0.0      0     0 ?        I    09:40   0:03 [kworker/0:2-events]
```

`%CPU` in `ps` is **CPU time divided by the process's lifetime**, not what it's doing right now. A daemon that's been idle for a week and just started spinning will look small. A short-lived process that was busy will look big. Use `ps` to find sustained consumers; use `top` (or `pidstat`, below) for the current moment.

For the current per-process rate in a script-friendly form:

```bash
pidstat -u 1 5          # sysstat: per-process %usr/%system per interval
pidstat -u -p 8823 1    # just one PID
```

---

## Load average is not CPU usage

```bash
uptime
#  10:15:09 up 14 days,  2:31,  3 users,  load average: 3.24, 2.87, 1.93
```

The three numbers are the 1, 5 and 15-minute averages of tasks that are **running, waiting for a CPU, or in uninterruptible sleep (D state)**. That last part is Linux-specific and it matters: twenty processes stuck on a dead NFS mount give you a load of 20 with the CPU almost idle.

So compare load to `nproc` only as a first hint, and always check `wa` and the `b` column before calling it a CPU problem. [How to Check Uptime in Linux](/blog/how-to-check-uptime-linux) covers reading load in more detail.

---

## Logging CPU over time

```bash
sar -u 5 12                               # 12 samples, 5 seconds apart
sar -u -f /var/log/sysstat/sa$(date +%d)  # today's history (Debian/Ubuntu path)
sar -u -f /var/log/sa/sa$(date +%d)       # RHEL/Fedora path
```

History only exists if the sysstat collector is enabled (`systemctl enable --now sysstat` on most current distros). Without sysstat:

```bash
vmstat -t 30 | tee cpu-vmstat.log         # -t adds a timestamp to each line
```

---

## Which tool for which question

| Question | Command |
|---|---|
| How busy is the box right now? | `top`, or `vmstat 1 5` |
| Is one core pinned? | `top` then `1`, or `mpstat -P ALL 1` |
| Which process is busy right now? | `top` (sorted by `%CPU`), `pidstat -u 1` |
| Which process has used the most CPU overall? | `ps aux --sort=-%cpu` |
| Are tasks queuing for CPU? | `vmstat 1` (`r` vs `nproc`) |
| Is the hypervisor stealing CPU? | `st` in top, `%steal` in mpstat |
| What did CPU look like at 3 a.m.? | `sar -u -f ...` |

---

**Why does top show a process above 100% CPU?**
top's default Irix mode reports per-process CPU relative to a single core. A process using three full cores shows about 300%. Press `Shift+I` to toggle to Solaris mode, which divides by the CPU count.

**Why do top and ps show different %CPU for the same process?**
top measures the interval since the last refresh (3 seconds by default). `ps` divides total CPU time by how long the process has existed. They answer different questions.

**What is a good CPU usage percentage?**
There's no universal number. Sustained high `us` is fine for a batch worker and a problem for a latency-sensitive API. Watch for queuing instead: `r` in vmstat consistently above the CPU count, or one core pinned at 100%.

---

*Related: [top Command in Linux](/blog/top-command-linux-guide) for every column and key in top. [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) when you're not sure the problem is CPU at all.*
