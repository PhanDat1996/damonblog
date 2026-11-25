---
title: "top vs htop: Which to Use on a Production Server"
seoTitle: "top vs htop: Differences, Comparison Table, When to Use"
date: "2026-04-21"
updated: "2026-11-25"
excerpt: "top vs htop on Linux: same /proc data, different ergonomics. A clear verdict, a key-by-key comparison table, and why their numbers sometimes differ."
tags: ["linux", "troubleshooting", "monitoring", "debugging"]
featured: false
category: "linux"
---

**top vs htop in one line:** both read the same `/proc` data, so neither is more accurate. `top` is preinstalled on every Linux system and can write text output for scripts and tickets. `htop` isn't always installed, but it's faster to use — per-core bars, search, a process tree, and killing a process by name. Use `top` on machines you don't control, `htop` on servers you manage.

You SSH into a server that's misbehaving and have to pick one. Both read the same `/proc` files, so neither is "more accurate." The choice comes down to what's installed, what you're trying to do, and whether you need output you can save.

## Quick answer

| If you... | Use |
|---|---|
| Are on a server you don't control, or can't install packages | `top` |
| Need text output for a ticket, script or postmortem | `top -b -n 2` |
| Manage the server and have htop in the base image | `htop` |
| Need to find, filter or kill one process among hundreds | `htop` |
| Are writing a script or alert | Neither: `ps`, `pidstat`, `vmstat`, `/proc` |

Know `top` well, because it's always there. Install `htop` where you can, because it saves time.

---

## The verdict

- **Use `top`** when you're on a machine you don't control (customer, vendor appliance, fresh cloud image, container), when you need text output for a ticket or script (`top -b`), or when you can't install packages.
- **Use `htop`** on servers you manage, where it's in your base image. It's faster for scanning many cores, filtering by name, viewing the process tree and sending signals to the right process.
- **Use neither for scripts.** Use `ps`, `pidstat`, `vmstat` or read `/proc` directly. `top -b` is fine for a one-off snapshot.

---

## top vs htop, side by side

| | top (procps-ng) | htop |
|---|---|---|
| Installed by default | Yes on mainstream distros (BusyBox top on Alpine) | No: `apt install htop`, `dnf install htop` (EPEL on RHEL) |
| Per-core CPU | Press `1` | Bars for every core by default |
| Process tree | `V` | `F5` or `t` |
| Search for a process | `L` (locate) | `F3` or `/` |
| Filter list by name | `o` then `COMMAND=nginx` | `F4` or `\` then type |
| Sort | `P`, `M`, `T`, `<` `>` | `F6`, `<` `>`, or click a column header |
| Send a signal | `k`, type PID and signal number | Highlight, `F9`, pick signal by name |
| Act on several processes | No | Tag with `Space`, then `F9` |
| Renice | `r` | `F7` / `F8` |
| Mouse | No | Yes |
| Threads | `H` toggles thread view | User threads **shown by default**; `H` hides them, `K` toggles kernel threads |
| Per-process disk I/O | No | I/O columns via `F2`, or the I/O tab in htop 3.2+ (needs root for other users' processes) |
| Batch / non-interactive output | `top -b -n 1` | None |
| Save settings | `W` writes the config file | Saved automatically to `~/.config/htop/htoprc` |
| Refresh interval flag | `-d 2` (seconds) | `-d 20` (**tenths** of a second) |

---

## Why the numbers sometimes don't match

People switch between the two tools and think one is wrong. Usually it's one of these:

**htop lists threads as separate rows.** A Java service with 200 threads can show 200 lines, each with the same `RES`, because threads share one address space. It looks like 200 processes eating memory. Press `H` to hide userland threads, or `F5` to see them grouped under their process.

**%CPU above 100%.** Both tools, by default, scale per-process CPU to one core, so a process using four cores shows ~400%. In top, `Shift+I` switches to dividing by the CPU count. Neither is wrong; check which mode you're in.

**Different sampling moments and intervals.** top refreshes every 3 seconds by default; htop every 1.5 seconds. A bursty process will show different numbers in each.

### From the lab: one process, four different-looking answers

> **Lab environment:** Ubuntu 24.04.5 LTS test box `lab01` with 2 CPUs, procps-ng top and htop 3.3.0 from the Ubuntu archive. Captured 25 Nov 2026. Output is copied from the terminal without edits; the htop screens were captured with `tmux capture-pane`.

The test load was `xz -T2 -9 < /dev/urandom > /dev/null`, which compresses with two worker threads, started as a systemd unit. Here is what each tool reported in the first 20 seconds:

```
root@lab01:~# ps -o pid,nlwp,%cpu,etime,cmd -C xz
    PID NLWP %CPU     ELAPSED CMD
    536    3  184       00:08 xz -T2 -9
root@lab01:~# top -b -n 2 -d 2 -p $(pgrep -x xz) | tail -2
    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
    536 root      20   0 2512036   1.3g   1896 S 189.0  32.8   0:19.28 xz
root@lab01:~# top -H -b -n 1 -p $(pgrep -x xz) | tail -4
    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
    537 root      20   0 2512036   1.3g   1896 R  99.9  33.1   0:09.68 xz
    538 root      20   0 2512036   1.3g   1896 R  72.7  33.1   0:09.28 xz
    536 root      20   0 2512036   1.3g   1896 S   0.0  33.1   0:00.77 xz
```

- **`ps` said 184%, `top` said 189%.** `ps` divides total CPU time by the process's whole lifetime (8 seconds here). `top` measures the last interval (2 seconds). On a steady load they agree roughly. On a bursty one they don't, and neither is wrong.
- **Over 100% is normal for a threaded process.** Two busy threads on two cores is ~200%. `NLWP 3` is the main thread plus two workers.
- **`top -H` shows where it goes:** two worker threads doing the work, the main thread (PID 536) idle.

htop shows threads like that by default, as separate rows:

![htop 3.3.0 on lab01 filtered to xz: first screen lists threads 538 and 537 at about 93% CPU each plus process 536 at 0%, all with RES 1448M; after pressing H only process 536 remains at 134% CPU](/images/lab-htop-threads-vs-process.jpg)

Every xz row shows the same `RES 1448M`. That is one address space counted on three rows, not 4.3 GB. Pressing `H` collapsed them into one row for PID 536 at `134.0` CPU%. That figure is from a single 1-second refresh while memory pressure was rising (the bar went from 3.40G to 3.55G of 3.81G in 4 seconds), which is a good example of why one sample from one tool is not a measurement.

Two smaller things the screens show:

- `VIRT` is the same number in both tools: top's `2512036` KiB is htop's `2453M`. Same `/proc` data, different units.
- `htop -F xz` matched the **command line**, not the process name, so it also listed the `bash -c xz ...` wrapper and the tmux session that started htop. Filter on something specific.

The test was stopped there because `xz -9` kept allocating memory: 3.55G of 3.81G was in use on the second screen.

**The memory bar vs `avail Mem`.** htop's memory bar shows used memory plus buffers and cache in different colors. The green part is application memory; the rest is cache the kernel can mostly reclaim. top prints `avail Mem` as a number instead. For "am I running out of RAM," the relevant figure is available memory in both. If it keeps shrinking over days, see [Linux Memory Leak Troubleshooting](/blog/linux-memory-leak-troubleshooting).

---

## Overhead

Both are cheap. Each refresh reads a few files per process from `/proc`. htop does a bit more work per refresh (more columns, colors, tree building), and on hosts with tens of thousands of processes either tool can use a noticeable slice of a core. On a typical server, the difference doesn't matter. If you're worried, lengthen the refresh interval.

---

## Typical situations

### An unfamiliar server, paged at night

Run `top`. It's there. Press `1` to check per-core, read `wa` and `st`, sort with `P` and `M`. If you need more, `ps` and `/proc` are also always there. Installing packages on someone else's production box mid-incident is usually not your call.

### Your own fleet, "why is memory up?"

```bash
htop -s PERCENT_MEM       # start sorted by memory
```

Press `F4`, type the service name, press `H` to collapse threads, `F5` for the tree. You see the parent, its workers and how memory splits between them in a few seconds. The same in top is possible (`M`, then `o` with `COMMAND=myapp`, then `V`), just slower.

### Evidence for a ticket or postmortem

htop has no batch mode, so this is top's job:

```bash
top -b -n 2 -d 2 -o %CPU > top-$(hostname)-$(date +%F-%H%M).txt
```

Read the second block in the file; the first iteration's CPU line reflects averages since boot. Every field in that output is explained in [Check CPU Usage in Linux](/blog/top-command-linux-guide).

### Killing the right process under pressure

In htop, you highlight the exact row, press `F9` and pick `15 SIGTERM` by name. In top, `k` defaults to the PID at the top of a list that keeps re-sorting. Either way, prefer SIGTERM, and use SIGKILL only if the process ignores it, because `kill -9` skips any cleanup and can leave stale lock or PID files behind.

---

## What neither tool shows well

- **Disk latency and throughput per device:** use `iostat -x 1`. See [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide).
- **Which process is doing I/O, live:** `iotop -o` or `pidstat -d 1`.
- **History:** both are live-only. Use `sar` from sysstat for "what happened at 3 a.m."
- **What a process is doing inside:** `strace`, `perf`, or the runtime's tools. See [Linux Debugging Tools](/blog/linux-debugging-tools-guide).

---

## FAQ

**Is htop better than top?**
Not more accurate: both read `/proc`. htop is faster to use interactively; top is always installed and has a batch mode for saving output.

**Is htop safe to run on production servers?**
Yes. It only reads `/proc`, like top. The risk is the same as top's: you can send signals or renice processes from it, so be deliberate with `F9`, `F7` and `F8`.

**Does htop work in Docker containers?**
Yes, if it's installed in the image. Inside a container with its own PID namespace it only shows the container's processes, while CPU and memory meters may reflect the host. For the container's own limits and usage, use `docker stats`.

**Why does htop show the same process many times?**
Those rows are threads. Press `H` to hide userland threads or `F5` to group them under their process.

**What about btop or glances?**
They're good dashboards with more graphs, but they're even less likely to be installed on a random server. The `top` vs `htop` trade-off applies to them too: nicer UI on your machines, `top` everywhere else.

---

*Related: [Check CPU Usage in Linux](/blog/top-command-linux-guide) for every field and key in top, load average and uptime. [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide) for what to do once you've spotted the process.*
