---
title: "Linux Debugging Tools: Which One to Use for Each Symptom"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Slow, hung, crashing or dropping connections? Map each Linux symptom to the right tool: top, vmstat, iostat, dmesg, lsof, ss, strace, perf and tcpdump."
tags: ["linux", "debugging", "troubleshooting", "monitoring", "infrastructure"]
featured: false
category: "linux"
---

Knowing that `strace`, `perf` and `tcpdump` exist doesn't help much at 03:00. What helps is knowing which one answers the question in front of you, and which ones will waste ten minutes or make things worse. A high load average with an idle CPU needs different tools than a process that dies silently, and both differ from "the app says it sent the request, the server says it never arrived".

This guide is organized by **symptom**. Each section gives the first command to run, what the output means, and where to go next.

---

## The map

| Symptom | Start with | Then |
|---|---|---|
| Server slow, unclear why | `uptime`, `top`, `vmstat 1` | `iostat -xz 1`, `pidstat` |
| High CPU | `top` (then `H` for threads) | `perf top -p PID`, `strace -c -w` |
| High load, CPU mostly idle | `vmstat 1` (`b`, `wa`), `ps` for D state | `iostat -xz 1`, `dmesg`, `/proc/PID/stack` |
| Memory pressure, OOM kills | `free -h`, `vmstat 1` (`si`/`so`) | `journalctl -k`, `ps --sort=-rss` |
| Process died with no log | `journalctl -u`, `journalctl -k` | `coredumpctl`, `dmesg` |
| Process hung | `ps -o stat`, `strace -p` | `lsof`, `ss`, `gdb`/runtime stack dump |
| Can't connect / connection errors | `ss -ltnp`, `ss -tanp` | `tcpdump`, `strace -e trace=%network` |
| Disk full / I/O errors | `df -h`, `df -i`, `dmesg` | `lsof +L1`, `du`, `smartctl` |

Rule of thumb: **snapshot tools first** (`top`, `vmstat`, `ss`, `lsof`, `dmesg` cost almost nothing), **tracing tools second** (`strace`, `tcpdump`, `perf`), and only once you know what to look for.

---

## "The server is slow": the first 60 seconds

```bash
uptime              # load averages: 1, 5, 15 minutes
vmstat 1 5          # CPU, run queue, blocked tasks, swap, I/O
top -bn1 | head -20 # who's using CPU and memory
dmesg -T | tail -20 # anything alarming from the kernel recently
```

### `vmstat`: one screen, most of the picture

```bash
vmstat 1 5
```

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  0      0 812456  98196 4123456    0    0     5    48  234  456 12  3 84  1  0
 2  6      0 790112  98200 4120012    0    0  8412   920 1840 2210  4  3 21 72  0
 1  7      0 788004  98200 4119980    0    0  9120  1004 1902 2304  3  2 20 75  0
```

**Ignore the first line.** It's the average since boot. The following lines are per interval.

| Column | Meaning | Worry when |
|---|---|---|
| `r` | Tasks running or waiting for a CPU | Consistently above the CPU count |
| `b` | Tasks blocked in uninterruptible sleep (D state, usually I/O) | Non-zero for more than a moment |
| `si` / `so` | Memory swapped in / out per second | `so` non-zero and sustained = memory pressure |
| `bi` / `bo` | Blocks read / written per second | Compare with what the disk can do |
| `us` / `sy` | CPU in user code / in the kernel | `sy` high = syscall-heavy or kernel work |
| `wa` | CPU idle while waiting for I/O | High together with `b` |
| `st` | CPU stolen by the hypervisor | Non-zero on VMs = noisy neighbors or undersized instance |

The sample above is a disk problem: 6 to 7 tasks blocked, `wa` above 70%, CPU otherwise idle.

### Load average is not CPU usage

On Linux, the load average counts tasks **running, runnable, and in uninterruptible sleep (D state)**. A load of 30 on an 8-core machine with 80% idle CPU means many tasks are stuck waiting on I/O (or a hung NFS mount), not that the CPU is overloaded. `vmstat`'s `b` column and `ps` for D-state processes confirm it:

```bash
ps -eo pid,stat,wchan:32,comm | awk '$2 ~ /^D/'
```

The [process states guide](/blog/linux-process-states-guide) explains D state, and the [performance troubleshooting guide](/blog/linux-performance-troubleshooting-guide) goes through the full method.

---

## Processes: `ps`, `top`, `htop`, `pidstat`

```bash
ps -eo pid,ppid,user,stat,%cpu,%mem,rss,etime,cmd --sort=-%cpu | head
ps -eo pid,stat,rss,cmd --sort=-rss | head        # biggest memory users (RSS in KiB)
```

The `STAT` column: `R` running, `S` sleeping (normal), `D` uninterruptible sleep (usually I/O, can't be killed until it returns), `Z` zombie (exited, parent hasn't collected it; uses no memory), `T` stopped. See [ps for troubleshooting](/blog/ps-command-linux-troubleshooting).

In `top`:

| Key | Does |
|---|---|
| `1` | Per-CPU rows (spot one core pinned at 100%) |
| `P` / `M` | Sort by CPU / memory |
| `H` | Show threads instead of processes |
| `c` | Full command line |
| `o` | Add a filter, e.g. `%CPU>5.0` or `COMMAND=java` |

`top -H -p PID` shows the threads of one process, which is how you find the single hot thread in a Java or Go service. The [top guide](/blog/top-command-linux-guide) covers the header fields; [htop vs top](/blog/htop-vs-top-linux) covers when htop is nicer (tree view `F5`, filter `F4`, search `/`).

`pidstat` (package `sysstat`) records per-process numbers over time, which `top` can't:

```bash
pidstat -u -r -d 1 10       # CPU, memory, disk I/O per process, every second for 10s
pidstat -t -p 4521 1        # per-thread CPU for one process
```

---

## Disk and I/O: `iostat`, `iotop`, `dmesg`

```bash
iostat -xz 1
```

```
Device   r/s     w/s    rkB/s    wkB/s  r_await  w_await  aqu-sz  %util
nvme0n1  12.0   410.0   96.0   18420.0    0.35    48.20    19.8   99.6
(columns trimmed; sysstat prints more)
```

Focus on `r_await`/`w_await` (average milliseconds per I/O, including queueing) and `aqu-sz` (average queue depth). `%util` near 100% on a single HDD means saturated, but on SSDs and NVMe, which serve many requests in parallel, `%util` alone can't tell you that. Latency (`await`) going up is the real signal. More in [disk I/O with iostat](/blog/linux-check-disk-io-iostat).

Which process is doing it:

```bash
sudo iotop -o          # only processes currently doing I/O
pidstat -d 1           # same idea, from sysstat
```

On kernels 5.14 and later, task delay accounting is off by default, and iotop warns that it can't show the `IO%`/`SWAPIN` columns. Enable it with `sudo sysctl kernel.task_delayacct=1` while you investigate, or use `pidstat -d`, which doesn't need it.

Storage errors show up in the kernel log, not in iostat:

```bash
sudo dmesg -T --level=err,warn | tail -30
journalctl -k -b --no-pager | grep -iE "i/o error|blk_update_request|EXT4-fs error|XFS .*error|Remounting filesystem read-only"
```

`dmesg` may need `sudo` (`kernel.dmesg_restrict=1` on many distributions). `dmesg -T` timestamps can drift after suspend/resume; `journalctl -k` gives exact times.

---

## Memory and the OOM killer

```bash
free -h
journalctl -k --since "1 hour ago" | grep -iE "out of memory|oom-kill|killed process"
```

```
Out of memory: Killed process 4521 (java) total-vm:8123456kB, anon-rss:6234112kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:12800kB oom_score_adj:0
```

`Memory cgroup out of memory` instead means a container or a systemd unit hit **its own** limit, even if the host has free RAM. In `free`, look at `available`, not `free`: page cache is reclaimable and counts as available. Leak vs. legitimate growth is covered in [memory leak troubleshooting](/blog/linux-memory-leak-troubleshooting).

---

## A process that dies or hangs

**It died.** Check the service log and the kernel log at the same second:

```bash
journalctl -u myapp -b -n 50 --no-pager
journalctl -k -b | grep -E "segfault|Killed process"
coredumpctl list myapp          # if systemd-coredump is installed and the crash dumped core
```

`segfault at 0 ... error 4` is a null-pointer read in the program; `Killed process` is the OOM killer. `coredumpctl info` / `coredumpctl gdb` opens the dump.

**It hangs.** First its state, then what it's waiting on:

```bash
ps -o pid,stat,wchan:32,cmd -p 4521
sudo strace -f -tt -T -yy -p 4521       # which syscall doesn't return, on which FD
sudo cat /proc/4521/stack               # kernel stack, for D-state processes
```

For an application-level stack: `jstack 4521` (Java), `py-spy dump --pid 4521` (Python), or for native code:

```bash
sudo gdb -p 4521 -batch -ex "thread apply all bt"
```

`gdb` **pauses** the process while it's attached. In batch mode that's a moment, but don't leave an interactive gdb session sitting on a production process. `gcore 4521` writes a core file you can examine elsewhere.

---

## Files and sockets: `lsof` and `ss`

```bash
sudo lsof -nP -p 4521                 # everything the process has open
sudo lsof -nP -a -p 4521 -i           # its network sockets (-a = AND; without it lsof ORs)
sudo lsof -nP +L1                     # deleted files still open (disk full, du disagrees)
ls /proc/4521/fd | wc -l              # real FD count, for leak hunting

ss -ltnp                              # listening TCP sockets with process
ss -tanp | grep "pid=4521,"           # all its connections with state
ss -tn state close-wait               # connections the app never closed
ss -s                                 # totals per state
```

`strace`, `lsof` and `ss` work best together. The [strace, lsof and ss guide](/blog/strace-lsof-ss-debugging) walks through connection leaks, deleted-but-open files and hung requests with all three. For ports specifically, see [check open ports](/blog/check-open-ports-linux).

---

## System calls: `strace`

```bash
sudo strace -f -tt -T -yy -p 4521 -o /tmp/trace.txt      # short traces, to a file
sudo strace -c -w -f -p 4521                             # wall-clock time per syscall; Ctrl+C
strace -f -e trace=%file ./myapp 2>&1 | grep -E "= -1 E" # why won't it start?
```

The cost: strace stops the process on **every** syscall, and that stays true with `-c` or `-e trace=` filters when you attach with `-p`. On a busy service, keep it short. The [strace tutorial](/blog/strace-tutorial-linux) covers reading the output and the overhead in detail.

---

## CPU profiling: `perf`

When CPU is high and strace shows few syscalls, the time is in user-space code. `perf` samples where:

```bash
sudo perf top -p 4521                                 # live hottest functions
sudo perf record -F 99 -g -p 4521 -- sleep 30         # 30s sample with call graphs
sudo perf report --stdio | head -50
```

Sampling at 99 Hz has low overhead, unlike tracing. Without debug symbols you'll see addresses instead of function names, and JIT runtimes (Java, Node) need extra setup to map their code. `perf trace` is also a much lower-overhead alternative to strace for syscall tracing.

---

## Network packets: `tcpdump`

Use it when two sides disagree about what was sent, or to see whether packets arrive at all.

```bash
sudo tcpdump -i any -nn port 5432 -c 50                       # 50 packets to/from 5432
sudo tcpdump -i any -nn 'tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'   # new connection attempts only
sudo tcpdump -i eth0 -nn -w /tmp/cap.pcap host 10.0.2.15 and port 443    # save for Wireshark
```

- `-nn` skips DNS and port-name lookups (faster, and avoids generating DNS traffic of its own).
- `tcp[tcpflags] & tcp-syn != 0` matches SYN **and** SYN-ACK. The filter above matches only the initial SYN.
- SYNs leaving with no SYN-ACK back = filtered or unreachable. A reset (`Flags [R.]`) back = nothing listening.
- HTTPS payloads are encrypted, so `-A` won't show you content on port 443. Capture to a file and look at the TLS handshake in Wireshark instead.
- Always filter on busy interfaces and use `-c` or a time limit. An unfiltered capture can fill a disk quickly.

---

## Quick reference

| Tool | Answers | Overhead | Package |
|---|---|---|---|
| `uptime`, `top`, `ps` | Load, top processes, states | Negligible | procps (installed) |
| `htop` | Interactive process view | Negligible | htop |
| `vmstat` | CPU, run queue, blocked, swap, I/O | Negligible | procps |
| `iostat`, `pidstat` | Per-disk latency; per-process CPU/mem/I/O | Negligible | sysstat |
| `iotop` | Per-process disk I/O | Low | iotop |
| `dmesg`, `journalctl -k` | Kernel: OOM, disk, driver errors | None | util-linux, systemd |
| `lsof` | Open files and sockets | Low | lsof |
| `ss` | Sockets, states, queues | Negligible | iproute2 |
| `strace` | Syscalls of one process | **High** on busy processes | strace |
| `perf` | Where CPU time goes | Low (sampling) | linux-tools / perf |
| `tcpdump` | Packets on the wire | Low to medium; filter it | tcpdump |
| `gdb` | Stack of a native process | Pauses the process while attached | gdb |

---

## Checklist when you don't know where to start

1. `uptime`, `vmstat 1 5`: CPU, blocked tasks, swap, steal. Skip vmstat's first line.
2. `top`: which process; `H` for threads.
3. `dmesg -T | tail` / `journalctl -k -b`: OOM, disk errors, hung tasks.
4. Process-level: `ps -o stat`, then `lsof` and `ss` (cheap), then `strace` (short).
5. CPU in user space: `perf top`. Packets in question: `tcpdump` with a filter.

---

*Related: the [Linux log analysis guide](/blog/linux-log-analysis-guide) for reading what these tools point you to in the logs, and [high CPU usage](/blog/linux-high-cpu-usage-guide) for that symptom in depth.*
