---
title: "Linux OOM Killer: Read the Log and Control What Dies"
date: "2026-10-28"
updated: "2026-10-28"
excerpt: "A process vanished with signal 9? Reproduce an OOM kill, read every line of the kernel report, and use oom_score_adj, OOMPolicy and MemoryHigh to control it."
tags: ["linux", "troubleshooting", "debugging", "monitoring"]
featured: false
lab: true
category: "linux"
---

A service restarts for no visible reason. Its own log just stops mid-line. `systemctl status` says `code=killed, signal=KILL`, or a container exits with code `137`. Nothing in the application crashed. The kernel ended it.

This post reproduces that on a lab VM, step by step, so every log line below is real output, not a reconstruction. Then it covers the three settings that decide what gets killed and whether anything gets killed at all.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, systemd 259, Xen VM with 7.2 GiB RAM and 4 GiB swap. All experiments run as an unprivileged user inside memory-limited systemd units, so they can't take the machine down.

---

## TL;DR: was it the OOM killer?

```bash
# Kernel log: every OOM kill leaves these two lines
journalctl -k --since "1 hour ago" | grep -E "invoked oom-killer|Killed process"

# systemd service: the result says it directly
systemctl show myapp -p Result -p ExecMainStatus
# Result=oom-kill
# ExecMainStatus=9

# cgroup counter: non-zero oom_kill means it happened in this cgroup
cat /sys/fs/cgroup/system.slice/myapp.service/memory.events
```

On Ubuntu, `dmesg` as a normal user fails with `read kernel buffer failed: Operation not permitted` (`kernel.dmesg_restrict=1`). `journalctl -k` works for members of the `adm` or `systemd-journal` group, or use `sudo`.

---

## Two kinds of OOM, one log format

The OOM killer runs in two different situations:

| | Cgroup OOM | System-wide OOM |
|---|---|---|
| Trigger | A cgroup hits its `memory.max` (systemd `MemoryMax=`, `docker run --memory`, Kubernetes limits) | The whole machine runs out of RAM and swap |
| Who can be killed | Only processes inside that cgroup | Any process on the machine |
| `constraint=` in the log | `CONSTRAINT_MEMCG` | `CONSTRAINT_NONE` |
| Kill line starts with | `Memory cgroup out of memory: Killed process` | `Out of memory: Killed process` |

On modern servers the first kind is far more common, because almost everything runs in a cgroup with a limit. It's also the one people misread: the box has 6 GiB free and a process still gets OOM-killed, because *its cgroup* was full, not the machine.

---

## Lab 1: reproduce an OOM kill

The test program allocates memory in 10 MiB chunks and writes to every byte, so the memory is really resident:

```python
# eat.py
import sys, time
limit_mb = int(sys.argv[1]) if len(sys.argv) > 1 else 10**6
hold = []
for i in range(limit_mb // 10):
    hold.append(bytearray(10 * 1024 * 1024))
    if (i + 1) % 5 == 0:
        print(f"allocated {(i + 1) * 10} MiB", flush=True)
    time.sleep(0.02)
print("done, holding", flush=True)
time.sleep(3600)
```

Run it in a transient service capped at 200 MiB, with swap disabled for that cgroup so the limit is hard:

```bash
systemd-run --user --unit=oomdemo -p MemoryMax=200M -p MemorySwapMax=0 \
  python3 eat.py 400
```

Less than a second later:

```
× oomdemo.service - [systemd-run] /usr/bin/python3 /home/damon/labs/oom/eat.py 400
     Active: failed (Result: oom-kill) since Wed 2026-10-28 10:23:48 UTC; 7s ago
   Duration: 633ms
    Process: 6510 ExecStart=/usr/bin/python3 /home/damon/labs/oom/eat.py 400 (code=killed, signal=KILL)
   Main PID: 6510 (code=killed, signal=KILL)
   Mem peak: 200M

python3[6510]: allocated 50 MiB
python3[6510]: allocated 100 MiB
python3[6510]: allocated 150 MiB
systemd[5530]: oomdemo.service: The kernel OOM killer killed some processes in this unit.
systemd[5530]: oomdemo.service: Main process exited, code=killed, status=9/KILL
systemd[5530]: oomdemo.service: Failed with result 'oom-kill'.
```

Notice what the application logged: nothing. It printed `150 MiB` and was gone. `SIGKILL` can't be caught, so there is no shutdown handler, no final log line and no stack trace. That's why OOM kills look like "the service just disappeared".

---

## Reading the kernel report, line by line

The kernel wrote 114 lines for that one kill. Most of it (the call trace, register dump and a long `pgscan`/`pgsteal` statistics block) you can skip. These are the lines that matter.

**1. Who triggered it**

```
python3 invoked oom-killer: gfp_mask=0xcc0(GFP_KERNEL), order=0, oom_score_adj=200
```

This is the process that *asked for memory* when none was left. It is not necessarily the one that gets killed. In a busy cgroup, an innocent small process can trigger the OOM killer and a big one gets killed.

**2. The limit that was hit**

```
memory: usage 204800kB, limit 204800kB, failcnt 20
swap: usage 0kB, limit 0kB, failcnt 0
Memory cgroup stats for /user.slice/user-1000.slice/user@1000.service/app.slice/oomdemo.service:
anon 209174528
file 0
kernel 540672
```

`usage` equals `limit`: the cgroup was full. `failcnt` counts how many times a charge hit the limit. The stats show *what* filled it: here almost all `anon` (heap memory), no page cache. If `file` were large, the cgroup would have been full of reclaimable cache and an OOM kill would be much less likely.

**3. The candidates**

```
Tasks state (memory values in pages):
[  pid  ]   uid  tgid total_vm      rss rss_anon rss_file rss_shmem pgtables_bytes swapents oom_score_adj name
[   6510]  1000  6510    55982    52834    51068     1766         0   491520        0           200 python3
```

Every process in the cgroup, with memory **in pages** (4 KiB on x86_64). 52,834 pages × 4 KiB ≈ 206 MiB RSS. On a real service this table is the most useful part: it shows every process that was in the cgroup and how big each was.

**4. The decision**

```
oom-kill:constraint=CONSTRAINT_MEMCG,nodemask=(null),cpuset=/,mems_allowed=0,oom_memcg=/user.slice/.../oomdemo.service,task_memcg=/user.slice/.../oomdemo.service,task=python3,pid=6510,uid=1000
Memory cgroup out of memory: Killed process 6510 (python3) total-vm:223928kB, anon-rss:204272kB, file-rss:7064kB, shmem-rss:0kB, UID:1000 pgtables:480kB oom_score_adj:200
```

`constraint=CONSTRAINT_MEMCG` and `oom_memcg=` tell you which limit was hit. `anon-rss` is the memory the kill actually frees. `total-vm` is virtual size and usually irrelevant.

> **The name in the log is the kernel's `comm`, not your process title.** In the next lab the process was started with `exec -a api-server`; `pgrep -af` showed `api-server`, but every kernel line still said `python3`. With many processes of the same runtime, match by PID, not by name.

---

## Lab 2: oom_score_adj decides who dies

When a cgroup has several processes, the kernel picks the one with the highest badness score: roughly its memory use, shifted by `oom_score_adj` (range −1000 to 1000). `-1000` means never kill; `1000` means kill this first.

Two processes in one 300 MiB cgroup: a small "cache worker" (50 MiB) marked expendable with `oom_score_adj=900`, and an "API server" that grows to 250 MiB.

```bash
#!/bin/bash
# two.sh
bash -c "echo 900 > /proc/self/oom_score_adj; exec -a cache-worker python3 eat.py 50" &
sleep 2
exec -a api-server python3 eat.py 250
```

```bash
systemd-run --user --unit=oomdemo2 -p MemoryMax=300M -p MemorySwapMax=0 ./two.sh
```

The kernel's candidate table:

```
[  pid  ]   uid  tgid total_vm      rss rss_anon rss_file rss_shmem pgtables_bytes swapents oom_score_adj name
[   6699]  1000  6699    68787    64730    62978     1752         0   573440        0           200 python3
[   6701]  1000  6701    17567    15340    13582     1758         0   180224        0           900 python3
Memory cgroup out of memory: Killed process 6701 (python3) ... oom_score_adj:900
```

The **smaller** process (6701, ~60 MiB) was killed instead of the 250 MiB one, because of its adjustment. That is the whole point of `oom_score_adj`: you tell the kernel what is expendable.

You can see the effect without waiting for an OOM:

```bash
cat /proc/<pid>/oom_score          # 684 for a ~300 MiB test process with adj 0
echo 500 > /proc/<pid>/oom_score_adj
cat /proc/<pid>/oom_score          # 1018 after raising the adjustment
```

Compare scores between processes rather than reading meaning into the absolute number. An unprivileged user can raise a process's adjustment and lower it back to where it started, but going below that needs `CAP_SYS_RESOURCE` (root).

> **Default you may not expect:** on this Ubuntu box, the per-user systemd manager runs with `oom_score_adj=100` and gives every unit it starts `200` (`DefaultOOMScoreAdjust=200`). User-session processes are deliberately preferred victims over system services.

### But the "protected" process died too

Here's the surprise from the same run: right after killing the cache worker, the API server was killed as well, and the unit ended up `failed (Result: oom-kill)`. What made the difference is systemd's `OOMPolicy=`, which decides what happens to a unit *after* the kernel kills one of its processes. Running the exact same test with two policies:

| `OOMPolicy=` | Kernel kill lines | Unit afterwards | API server |
|---|---|---|---|
| `stop` (the default here, `DefaultOOMPolicy=stop`) | cache-worker (adj 900), then api-server (adj 200) | `failed`, `Result=oom-kill` | gone |
| `continue` | cache-worker (adj 900) only | `active (running)` | still running |

With the default, one OOM kill anywhere in a unit ends the whole unit. For a service that runs a master plus disposable workers, that turns "lose one worker" into "lose the service". The options:

- `OOMPolicy=stop`: treat any OOM kill as a unit failure (default for most units). Good when a partially killed service is worse than a restart.
- `OOMPolicy=continue`: log it and keep the rest running. Good when the main process handles worker death itself.
- `OOMPolicy=kill`: have the kernel kill **all** processes in the cgroup together (`memory.oom.group=1`). Good when the processes are useless without each other.

Pair `stop` with `Restart=on-failure` if you want the unit to come back on its own.

---

## Lab 3: MemoryHigh slows down instead of killing

`MemoryMax=` is a wall: hit it and something dies. `MemoryHigh=` is a soft limit: above it, the kernel reclaims memory from the cgroup aggressively and slows its allocations down, but doesn't kill.

```bash
systemd-run --user --unit=oomhigh -p MemoryHigh=150M -p MemoryMax=300M \
  python3 eat.py 250
```

The program asked for 250 MiB with the soft limit at 150 MiB. Fifteen seconds later it was still running (`done, holding`), and the cgroup files show why:

```
$ cat memory.events
low 0
high 394
max 0
oom 0
oom_kill 0

memory.current=157081600        # ~150 MiB actually in RAM
memory.swap.current=109981696   # ~105 MiB pushed to swap

$ cat memory.pressure
some avg10=0.21 avg60=0.10 avg300=0.02 total=87304
full avg10=0.21 avg60=0.10 avg300=0.02 total=87304
```

- `high 394`: the cgroup crossed `MemoryHigh` 394 times and was throttled each time.
- `oom_kill 0`: nothing died.
- The overflow went to swap. Without swap available, the same pressure means heavy reclaim of page cache and much slower allocations instead.
- `memory.pressure` shows tasks stalling on memory. That number, not "used memory", is the early warning worth alerting on.

A common production pattern is `MemoryHigh` around 80–90% of `MemoryMax`: the service slows down and shows up in your pressure metrics before it gets killed.

---

## Protecting what matters

For a system service, in a drop-in (`systemctl edit myapp`):

```ini
[Service]
# Cap this service so it can't push the whole host into a global OOM
MemoryMax=2G
# Start throttling and reclaiming before the hard cap
MemoryHigh=1700M
# Make it a less likely victim in a global OOM (negative values need a system service)
OOMScoreAdjust=-500
# What to do if the kernel kills one of its processes
OOMPolicy=stop
Restart=on-failure
```

Then `systemctl daemon-reload && systemctl restart myapp`, and confirm with `systemctl show myapp -p MemoryMax -p MemoryHigh -p OOMScoreAdjust -p OOMPolicy`.

A few things that look like fixes but aren't:

- **`OOMScoreAdjust=-1000` on everything.** If nothing is killable, a global OOM has no good choice left. Reserve `-1000` for things like `sshd` that you need to log in and fix the box.
- **Adding swap to "fix" OOM kills.** It moves the problem: the process survives but can slow to a crawl. Fine as a buffer, not as a fix for a leak. See [Linux memory leak troubleshooting](/blog/linux-memory-leak-troubleshooting) to tell a leak from a sizing problem.
- **`vm.overcommit_memory=2`.** Strict accounting makes allocations fail with `ENOMEM` instead of OOM kills later, and many runtimes (JVMs, anything that reserves large virtual ranges) fail to start under it. This lab VM used the default `0`.
- **Only watching `free`.** A cgroup OOM happens with plenty of free host memory. Check the cgroup's `memory.current` against `memory.max`, as in [checking memory usage on Linux](/blog/linux-check-memory-usage-free-top).

---

## Exit code 137 is not proof of OOM

`137` = 128 + 9: the process received `SIGKILL`. The OOM killer is one source; `kill -9`, a stop timeout escalating to `SIGKILL`, or an orchestrator killing a container are others. Always confirm with the kernel log or the cgroup's `memory.events` before concluding it was memory. The same check applies to containers; see [Docker container not starting](/blog/docker-container-not-starting-fix) for reading exit codes there.

---

## Checklist when a process "just died"

1. `systemctl show <unit> -p Result -p ExecMainStatus`: `oom-kill` / `9`?
2. `journalctl -k --since ... | grep -E "invoked oom-killer|Killed process"` (time filters in [journalctl --since and --until](/blog/journalctl-filter-time-range)).
3. `constraint=`: `CONSTRAINT_MEMCG` (a limit) or `CONSTRAINT_NONE` (the whole host)?
4. Read `memory: usage ... limit ...` and the stats: anon (heap growth) or file (cache)?
5. Read the `Tasks state` table: which process was big, and what were the `oom_score_adj` values?
6. Decide: raise the limit, fix the leak, mark the right process expendable, or add `MemoryHigh` so you get pressure before death.

---

## FAQ

**Why did the OOM killer kill a process that wasn't using much memory?**
Either its `oom_score_adj` was high (Lab 2 killed a 60 MiB process instead of a 250 MiB one), or it was the only killable process in the cgroup that hit its limit. Check the `Tasks state` table in that kill's report.

**Why are there OOM kills when free shows gigabytes available?**
The limit that was hit belongs to a cgroup, not the host. The log line says `Memory cgroup out of memory` and `constraint=CONSTRAINT_MEMCG`. Compare that cgroup's `memory.current` with its `memory.max`.

**Can an application catch the OOM kill and shut down cleanly?**
No. It's `SIGKILL`, which can't be caught or ignored. Use `MemoryHigh` and pressure monitoring to react before the hard limit, or let the supervisor restart the service.

**Where do I find OOM kills from before the last reboot?**
`journalctl -k -b -1 | grep "Killed process"` if the journal is persistent. `dmesg` only shows the current boot's ring buffer.

---

*Related: [Linux log analysis](/blog/linux-log-analysis-guide) for reading the rest of the kernel log, and [Linux performance troubleshooting](/blog/linux-performance-troubleshooting-guide) for the first ten minutes on a slow or unstable server.*
