---
title: "Check CPU Usage in Linux: top, htop, Load Average and Uptime"
seoTitle: "Check CPU Usage in Linux: top, Load Average, Uptime"
date: "2026-04-21"
updated: "2026-11-08"
excerpt: "Check CPU usage, load average and uptime in Linux, read every line of top and its keys, and know when htop is the better tool."
tags: ["linux", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
category: "linux"
---

You run `top` on a slow server. Load average 7.8. One process at 312% CPU. Memory `free` is 200 MB. Swap has something in it. Which of these is the problem?

Possibly none of them. Most of these numbers are easy to misread: load isn't CPU, `%CPU` isn't capped at 100, `free` isn't free memory. Linux has several tools for CPU, and they disagree with each other because they measure different things over different time windows. This guide covers the quick commands, what the numbers mean, uptime and load average, every line and key of top, and when to use htop instead.

`top` here means the procps-ng version shipped by every mainstream distro. BusyBox top (Alpine, many containers) is much simpler and lacks most keys below.

```bash
top                              # live overall + per-process view (press 1 for per-core)
mpstat -P ALL 1 5                # per-core breakdown, 5 one-second samples
vmstat 1 5                       # run queue + CPU split, 1-second samples
ps aux --sort=-%cpu | head       # biggest CPU users (lifetime average!)
nproc                            # how many CPUs you have
uptime                           # up how long + users + load average
uptime -s                        # exact boot time: 2026-10-21 06:44:11
```

If the CPU is actually pegged and you need to find out why, go to [Linux High CPU Usage: How to Find the Real Cause](/blog/linux-high-cpu-usage-guide).

---

## Check CPU usage

### top: overall usage in one line

The third line of `top` is the CPU summary:

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

**Press `1` for per-core.** On a 4-core box, one thread pinning a single core shows as about **25%** in the aggregate line. That looks harmless, but everything handled by that thread is queued.

The first screen after starting top shows CPU percentages averaged since boot, because there's no previous sample yet. Wait for the second refresh before reading it.

### mpstat: clean per-core numbers

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

### vmstat: is anything waiting for CPU?

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

### ps and pidstat: who is using the CPU

```bash
ps aux --sort=-%cpu | head -6
```

```
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
app         8823 87.3  6.1 5843120 998412 ?      Sl   09:02  41:12 java -jar service.jar
postgres    2210  4.1  1.9 412880 311204 ?       Ss   Oct20  412:51 postgres: checkpointer
root         991  0.6  0.0      0     0 ?        I    09:40   0:03 [kworker/0:2-events]
```

`%CPU` in `ps` is **CPU time divided by the process's lifetime**, not what it's doing right now. A daemon that's been idle for a week and just started spinning will look small. A short-lived process that was busy will look big. Use `ps` to find sustained consumers; use `top` or `pidstat` for the current moment. More in [ps for troubleshooting](/blog/ps-command-linux-troubleshooting).

For the current per-process rate in a script-friendly form:

```bash
pidstat -u 1 5          # sysstat: per-process %usr/%system per interval
pidstat -u -p 8823 1    # just one PID
```

### Logging CPU over time

```bash
sar -u 5 12                               # 12 samples, 5 seconds apart
sar -u -f /var/log/sysstat/sa$(date +%d)  # today's history (Debian/Ubuntu path)
sar -u -f /var/log/sa/sa$(date +%d)       # RHEL/Fedora path
```

History only exists if the sysstat collector is enabled (`systemctl enable --now sysstat` on most current distros). Without sysstat:

```bash
vmstat -t 30 | tee cpu-vmstat.log         # -t adds a timestamp to each line
```

### Which tool for which question

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

## Load average: what the three numbers mean

```bash
uptime
#  09:15:42 up 14 days,  2:31,  3 users,  load average: 1.24, 0.87, 0.63
```

They're exponentially damped moving averages over 1, 5 and 15 minutes of the number of tasks that are:

- running on a CPU,
- waiting for a CPU, **or**
- in uninterruptible sleep (`D` state), usually waiting on disk or NFS.

That third group is Linux-specific and it's why load is **not** CPU usage. Twenty processes stuck on a dead NFS mount produce a load of about 20 while the CPU is almost idle.

### Compare it to the CPU count

```bash
nproc
# 4
```

As a rough first reading on a 4-CPU machine:

| Load | First guess | Confirm with |
|---|---|---|
| Well under 4 | Not saturated | — |
| Around 4 | Busy, little queueing | `vmstat 1`: `r` near 4 |
| Well over 4 | Tasks are waiting | `vmstat 1`: high `r` = CPU queue; high `b` = blocked on I/O |

- Load above `nproc` and `id` near 0: CPU saturation.
- Load above `nproc` with plenty of `id` and some `wa`: tasks are blocked on I/O.

The same load of 4.0 is saturation on a 2-CPU VM and light work on a 32-core server. Always confirm what kind of waiting it is before calling it a CPU problem. [Linux Process States](/blog/linux-process-states-guide) explains `D` state.

### Read the trend

- `6.20, 3.10, 1.05`: 1-minute much higher than 15-minute. Something started recently and is getting worse.
- `0.50, 2.40, 4.10`: falling. A spike is over or recovering.
- `4.10, 4.05, 4.12`: steady. This is the normal level for this workload, high or not.

---

## Check uptime and last boot time

Monitoring says the server went away for four minutes overnight. Did it reboot? When? Was it planned, or did it crash?

```bash
uptime -s             # exact boot time: 2026-10-21 06:44:11
uptime -p             # pretty duration: up 1 week, 2 hours, 31 minutes
who -b                # boot time, another way
journalctl --list-boots | tail -5   # recent boots with time ranges (systemd)
```

### Reading `uptime`

| Part | Meaning |
|---|---|
| `09:15:42` | Current time |
| `up 14 days, 2:31` | Time since boot: 14 days, 2 hours, 31 minutes |
| `3 users` | Login sessions in utmp (each SSH session, terminal or tmux window can count) |
| `load average: 1.24, 0.87, 0.63` | 1, 5 and 15-minute load averages |

Under a day, the format changes to `up 3:12` or `up 47 min`, so don't parse `uptime` output with fixed field numbers in scripts. Use `/proc/uptime` (below).

**In a container**, `uptime` shows the **host's** uptime, because `/proc/uptime` isn't per-container. For a container's age, use `docker inspect -f '{{.State.StartedAt}}' <name>`.

### Reboot history: was it a crash?

```bash
last -x reboot shutdown | head
```

```
reboot   system boot  6.8.0-45-generic Tue Oct 21 06:44   still running
shutdown system down  6.8.0-45-generic Tue Oct 21 06:43 - 06:44  (00:00)
reboot   system boot  6.8.0-45-generic Sun Oct  5 02:10 - 06:43 (16+04:33)
reboot   system boot  6.8.0-40-generic Mon Sep 22 14:22 - crash (12+11:48)
```

A `reboot` line **with** a `shutdown` line just before it in time was a clean shutdown. A `reboot` with no `shutdown` before it means the previous run ended without a clean shutdown, and `last` marks that run as `crash` (the Sep 22 boot above). That covers a kernel panic, a power loss, a hang followed by a forced reset from the hypervisor, and so on.

`last` reads `/var/log/wtmp`, which gets rotated, and some newer distributions replace it with `wtmpdb`. On systemd machines the journal is usually the more reliable source:

```bash
journalctl --list-boots | tail -5
```

```
 -3 8c1d...  Mon 2026-09-22 14:22:10 UTC  Sun 2026-10-05 02:07:51 UTC
 -2 41af...  Sun 2026-10-05 02:10:33 UTC  Tue 2026-10-21 06:43:58 UTC
 -1 e902...  ...
  0 7b3e...  Tue 2026-10-21 06:44:11 UTC  Tue 2026-10-28 09:15:40 UTC
```

Boot history needs persistent journal storage (`/var/log/journal` exists). Then see how the previous boot ended:

```bash
journalctl -b -1 -n 50 --no-pager      # last 50 lines of the previous boot
```

A clean shutdown ends with systemd stopping units and messages like `Reached target ... Shutdown` or `System Power Off`. A crash ends mid-stream, often with nothing unusual at all, since the logs may not have been flushed. Check the hypervisor or cloud console for the host side of the story. More on filtering the journal in [journalctl by Time Range](/blog/monitor-real-time-logs-linux).

### Is it the service or the server?

`uptime` is OS uptime. A service can crash and restart without the server rebooting:

```bash
systemctl show nginx -p ActiveEnterTimestamp -p NRestarts
# ActiveEnterTimestamp=Tue 2026-10-28 02:14:07 UTC
# NRestarts=3
```

`NRestarts` (systemd 235+) counts automatic restarts by the unit's `Restart=` policy. See [Check Running Services with systemctl](/blog/systemctl-service-not-starting-fix).

### `w`: uptime plus who's logged in

```
 09:15:42 up 14 days,  2:31,  3 users,  load average: 1.24, 0.87, 0.63
USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
damon    pts/0    10.0.1.42        09:00    0.00s  0.10s  0.01s w
ops      pts/1    192.168.1.100    08:30    5:23   0.20s  0.00s -bash
deploy   pts/2    10.0.1.50        09:10    1.00s  2:10   2:09  npm run build
```

`IDLE` is time since the last keystroke. `JCPU` is CPU time used by all processes on that terminal; `PCPU` is CPU time used by the current process shown in `WHAT`. Both are cumulative CPU time, not percentages. Useful during an incident to see if someone else is already working on the box. For login history, see [Check Last Login Users](/blog/linux-log-analysis-guide).

### Uptime and load in scripts

`/proc/uptime` holds two numbers in seconds: time since boot, and total idle time summed across all CPUs (so it can exceed the first number).

```bash
cat /proc/uptime
# 1218701.42 4790215.88

up=$(cut -d. -f1 /proc/uptime)
printf 'up %dd %dh %dm\n' $((up/86400)) $((up%86400/3600)) $((up%3600/60))

# alert if the machine booted in the last 10 minutes
if [ "$up" -lt 600 ]; then
  echo "rebooted $((up / 60)) minutes ago (boot: $(uptime -s))"
fi
```

Load averages, without parsing `uptime`:

```bash
cat /proc/loadavg
# 1.24 0.87 0.63 2/431 98211
read -r l1 l5 l15 _ < /proc/loadavg
```

The fourth field is currently runnable tasks / total tasks; the fifth is the most recently assigned PID.

Across several hosts:

```bash
for h in web01 web02 db01; do printf '%-6s ' "$h"; ssh "$h" uptime; done
```

---

## The top header, line by line

```
top - 15:42:07 up 14 days,  2:31,  3 users,  load average: 7.82, 5.41, 3.10
Tasks: 287 total,   5 running, 279 sleeping,   0 stopped,   3 zombie
%Cpu(s): 71.3 us,  6.2 sy,  0.0 ni, 20.1 id,  1.8 wa,  0.0 hi,  0.6 si,  0.0 st
MiB Mem :  15999.4 total,    212.7 free,   9384.0 used,   6402.7 buff/cache
MiB Swap:   4096.0 total,   3968.0 free,    128.0 used.   6112.9 avail Mem
```

**Line 1** is the `uptime` output; see **Load average** above.

**Line 2: tasks.** Counts by state. A handful of `zombie` is a parent process not reaping its children; zombies use no CPU or memory beyond a process table entry. A growing number is worth chasing.

**Line 3: CPU split.** Same fields as in **Check CPU usage** above.

**Lines 4–5: memory.** Read **`avail Mem`** (end of the swap line), not `free`. Linux uses spare RAM as page cache (`buff/cache`) and gives most of it back when programs need it. 212 MB free with 6.1 GB available is a healthy box. `used` doesn't include `buff/cache`.

`128.0 used` swap is only a concern if pages are actively moving; check `si`/`so` in `vmstat 1`. Details in [Check Memory Usage in Linux](/blog/linux-memory-leak-troubleshooting).

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
| `L` | Locate (search for) a string |
| `o` / `O` | Add a filter (case-insensitive / case-sensitive) |
| `=` | Clear filters |
| `Shift+I` | Toggle Irix/Solaris `%CPU` mode |
| `e` / `E` | Change memory units in the list / the header |
| `d` or `s` | Change refresh interval |
| `k` | Send a signal to a PID |
| `r` | Renice |
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

`k` asks for a PID (defaulting to the task at the top of the list) and then a signal (default 15, SIGTERM). Because the list re-sorts every refresh, it's easy to hit the wrong process. During an incident, copy the PID and use `kill <PID>` from another shell. Use `kill -9` only after SIGTERM failed, since SIGKILL gives the process no chance to flush or clean up and can leave stale lock or PID files behind.

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
top -b -n 2 -d 2 -o %CPU > top-$(hostname)-$(date +%F-%H%M).txt  # read the second block
top -b -H -n 1 -p 8823 > threads-8823.txt    # thread snapshot, for a bug report
```

Want the output wider so commands aren't cut off? Add `-w 512`.

---

## htop vs top

Both read the same `/proc` files, so neither is "more accurate." Use `top` on machines you don't control and whenever you need saved output (`top -b`); use `htop` on servers you manage, where it's faster for filtering, the process tree and killing the right process. One trap when comparing them: htop shows each thread as its own row by default, so one multithreaded service can look like dozens of processes with the same `RES`.

The full comparison, key by key, with the reasons their numbers differ, is in [top vs htop: Which to Use on a Production Server](/blog/htop-vs-top-linux).

---

## Reading top during an incident

1. Wait for the second refresh. Press `1`.
2. Load vs `nproc`, then `id`, `wa`, `st`: CPU-bound, I/O-bound, or starved by the hypervisor?
3. `P` for the top CPU consumer, `M` for memory. `c` to see what it really is.
4. `H` or `top -H -p <PID>` if one process dominates.
5. `o` then `S=D` if load is high but CPU is idle.
6. Save a `top -b` snapshot before restarting anything.

For the full workflow behind steps 2–4, see [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide).

---

## FAQ

**Why do top and ps show different %CPU for the same process?**
top measures the interval since the last refresh (3 seconds by default). `ps` divides total CPU time by how long the process has existed. They answer different questions, and both are correct.

**What is a good CPU usage percentage?**
There's no universal number. Sustained high `us` is fine for a batch worker and a problem for a latency-sensitive API. Watch for queuing instead: `r` in vmstat consistently above the CPU count, or one core pinned at 100%.

**What is a good load average for Linux?**
There's no fixed number. Compare it with the CPU count (`nproc`) and with this machine's normal level. Sustained load well above the CPU count deserves a look, but check whether it's CPU queueing or tasks blocked on I/O first.

**Why does uptime show more users than are logged in?**
It counts login sessions recorded in utmp, and each terminal, SSH session or multiplexer window can be one. Some sessions linger after a disconnect.

**How do I see uptime in seconds?**
`cut -d. -f1 /proc/uptime`.

---

*Related: [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) when you're not sure the problem is CPU at all, or what to do once you've spotted it.*
