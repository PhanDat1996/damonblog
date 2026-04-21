---
title: "ps Command Linux: The Engineer's Troubleshooting Guide"
date: "2026-04-21"
excerpt: "How to use the ps command on Linux to debug high CPU, memory leaks, zombie processes, and unresponsive services — with real production workflows, common mistakes, and a quick-reference cheat sheet."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "ps-command-linux-troubleshooting-guide"
---

# ps Command Linux: The Engineer's Troubleshooting Guide

## Introduction: Why Process Visibility Saves Production Systems

A service is down. Alerts are firing. Users are complaining. You SSH in and the first question is always the same: **what is actually running on this system right now?**

The **ps command on Linux** is your first answer. Before you check logs, before you restart anything, before you reach for `top` or `htop` — `ps` gives you a snapshot of the process table. It tells you if the process exists, what state it is in, who owns it, how much CPU and memory it is consuming, and what spawned it.

This guide covers how engineers actually use `ps` during production incidents — high CPU investigation, memory leak triage, zombie process detection, and unresponsive service debugging — on both Ubuntu and Red Hat Enterprise Linux.

---

## TL;DR

- **`ps aux`** — all processes, all users, with CPU/memory (use this first)
- **`ps -ef`** — all processes with PPID (use this when tracing process trees)
- **`ps -eo`** — custom columns, for sorting and scripting
- **STAT column** — the most useful column; `D` = I/O stuck, `Z` = zombie, `R` = running
- **RSS, not VSZ** — RSS is actual physical RAM; VSZ is virtual and almost always misleading
- **Never `kill -9` first** — send SIGTERM, wait, then escalate
- **`ps` is a snapshot** — use `top` to watch behavior over time

---

## Authority Note

I have used `ps` in production incidents on systems handling tens of thousands of connections — chasing zombie accumulation in containerized environments, tracing memory leaks in Java services running for weeks, and identifying stale NFS mounts causing D-state lockups. The workflows in this guide are how it actually happens during an incident, not how a textbook describes it.

---

## What Is the ps Command in Linux?

`ps` (process status) reads the `/proc` filesystem and reports a snapshot of current processes. Unlike `top`, it does not refresh — it captures state at the moment you run it.

That distinction matters. `ps` is for:
- Getting a clean, stable snapshot you can grep, sort, and pipe
- Scripting and automation
- Capturing process state at a specific moment during an incident

```bash
# Simplest form — processes in current shell session only
ps

# What you actually use in production
ps aux
ps -ef
```

---

## ps vs top: When to Use Which

Engineers waste time opening `top` when they should use `ps`, and vice versa.

| Use `ps` when... | Use `top` when... |
|---|---|
| You need a snapshot for grepping | You need to watch CPU/memory live |
| You are scripting or automating | You are identifying the culprit in real time |
| You want to pipe output to sort/awk | You want to sort dynamically |
| You are capturing state for a report | You need interactive process management |
| The terminal is slow or unreliable | You have a stable, fast terminal |

**Rule of thumb:** In the first 30 seconds of an incident, use `ps` to get facts. Use `top` to watch behavior over time.

> *See also: [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — tools that pair directly with `ps` to go deeper into what a process is actually doing.*

---

## ps Command Linux: Most Useful Forms in Production

### ps aux — BSD-style, Most Common

```bash
ps aux
```

Shows all processes, all users, with CPU and memory. Default for most engineers.

```bash
# Filter immediately
ps aux | grep nginx
ps aux | grep -v grep | grep nginx   # avoid matching grep itself
```

### ps -ef — UNIX-style, Shows Full Command

```bash
ps -ef
```

Shows full command line including arguments. Critical when you need to see exactly how a process was started — what flags, what config file, what working directory.

```bash
# See full command for Java processes
ps -ef | grep java

# Output includes:
# UID   PID  PPID  ... CMD
# app  1234  1000  ... java -Xmx4g -jar /opt/app/service.jar --config /etc/app/prod.conf
```

The PPID column (parent PID) is only visible with `-ef`, not `aux`. **This is why you use `-ef` when tracing process trees.**

### ps -eo — Custom Output, Maximum Flexibility

```bash
# Sort by CPU descending
ps -eo pid,ppid,user,%cpu,%mem,stat,comm --sort=-%cpu | head -20

# Sort by memory descending
ps -eo pid,ppid,user,%cpu,%mem,rss,comm --sort=-%mem | head -20

# Find processes in specific states
ps -eo pid,stat,comm | grep -E "^[[:space:]]*[0-9]+ Z"   # zombies
```

Use this when you need clean output for scripting or want specific columns only.

---

## How to Read ps Output

This is the section most guides skip. Knowing what columns mean is less useful than knowing how to interpret them together.

### ps aux column reference

```
USER    PID  %CPU %MEM    VSZ   RSS TTY   STAT START    TIME COMMAND
nginx  1234   0.0  0.1  12340  4096 ?     Ss   09:15    0:00 nginx: master process
nginx  1235   2.1  0.8  12980  8192 ?     S    09:15    1:23 nginx: worker process
```

| Column | What it means | What to look for |
|---|---|---|
| `USER` | Owner of the process | Root-owned processes that should not be |
| `PID` | Process ID | Use to kill or trace |
| `%CPU` | CPU usage since process started | Not instantaneous — averaged over lifetime |
| `%MEM` | % of physical RAM used | High values on many processes = pressure |
| `VSZ` | Virtual memory size (KB) | Includes mapped files, shared libs — often misleading |
| `RSS` | Resident Set Size (KB) | **Actual physical RAM used** — this is what matters |
| `STAT` | Process state | See below |
| `TIME` | Total CPU time consumed | High TIME + low %CPU = long-running process |
| `COMMAND` | Command name or path | Truncated — use `-ef` for full path |

### Process states (STAT column) — this is where the diagnosis lives

| State | Meaning | Action |
|---|---|---|
| `S` | Sleeping, waiting for event | Normal |
| `R` | Running or runnable | Normal, or high CPU if many |
| `D` | Uninterruptible sleep (I/O wait) | Investigate disk/NFS |
| `Z` | Zombie — finished but not reaped | Check parent process |
| `T` | Stopped (signal or traced) | Investigate why it was stopped |
| `s` | Session leader | Normal |
| `l` | Multi-threaded | Normal |
| `+` | Foreground process group | Normal |

> **`D` state is critical.** A process in uninterruptible sleep cannot be killed. It is waiting on I/O — usually disk, NFS, or a kernel driver. High `D` state count is a symptom of storage problems, not application problems.

### VSZ vs RSS — the confusion that leads to wrong decisions

**VSZ** is virtual memory — includes memory-mapped files, shared libraries, and allocated-but-not-used memory. It almost always looks alarming and almost always is misleading.

**RSS** is physical RAM actually in use. This is the number that matters when you are worried about a memory leak or memory pressure.

A Java process with VSZ of 8GB and RSS of 512MB is not consuming 8GB of RAM. It is consuming 512MB.

---

## Understanding Process Hierarchy: Why PPID Matters

Every process has a parent. When a service forks workers, those workers have the master as their parent. When a script spawns subprocesses, those subprocesses have the script's PID as parent.

```bash
# See full process tree
ps -ef --forest

# Or use pstree for a cleaner view
pstree -p

# Find all children of a specific process
ps -ef | awk -v ppid=1234 '$3 == ppid {print}'
```

**Why PPID matters in troubleshooting:**

- A zombie's parent is responsible for reaping it. If you have zombies, the parent is the problem.
- Unexpected child processes trace back to the parent that spawned them.
- During high CPU incidents, the consuming process may be a child of the real culprit.
- When you kill a process, its children become orphans. Knowing the tree prevents unexpected disruption.

```bash
# Find all children of nginx master
NGINX_MASTER=$(ps aux | grep "nginx: master" | grep -v grep | awk '{print $2}')
ps -ef | awk -v ppid="$NGINX_MASTER" '$3 == ppid'
```

---

## Step-by-Step Troubleshooting Workflow Using ps

### Step 1: Check if the process exists

```bash
ps aux | grep -v grep | grep nginx
```

- **Result found:** Process is running. Move to Step 2.
- **No result:** Not running. Check `systemctl status`, check if it crashed, check logs.

```bash
# More reliable — check by exact process name
ps -C nginx

# Check by PID if you have it
ps -p 1234
```

### Step 2: Identify CPU usage

```bash
ps aux --sort=-%cpu | head -10
```

- `%CPU` is averaged since start — not instantaneous
- `TIME` shows total accumulated CPU. High TIME + low %CPU = long-running process
- Correlate with `top` to see if it is sustained

```bash
# Snapshot CPU for a specific service
ps aux | grep -v grep | grep myapp | awk '{print "PID:", $2, "CPU:", $3"%"}'
```

### Step 3: Identify memory usage

```bash
ps aux --sort=-%mem | head -10
```

Focus on `RSS`, not `VSZ`. Track RSS over time for leak detection:

```bash
while true; do
  ps -p 1234 -o pid,rss,vsz,comm --no-headers
  sleep 5
done
```

If RSS grows consistently without leveling off, you have a memory leak.

### Step 4: Trace the parent process

```bash
# Get PPID of a process
ps -o ppid= -p 1234

# Look up the parent
ps -p $(ps -o ppid= -p 1234) -o pid,user,comm
```

This identifies what spawned the process — useful when an unexpected process is consuming resources.

### Step 5: Detect zombie processes

```bash
# Find all zombies
ps aux | awk '$8 == "Z" {print}'

# With PPID to find their parent
ps -eo pid,ppid,stat,comm | grep -E '\bZ\b'
```

When you find zombies:

```bash
# Find the parent that should be reaping them
ps -o ppid= -p <zombie_pid>

# Check the parent
ps -p <ppid> -o pid,comm,stat

# Zombies cannot be killed directly — only the parent reaps them
# If parent is hung, killing the parent forces orphan adoption by init
```

---

## Real-World Troubleshooting Scenarios

### Scenario 1: Service running but not responding

Process is in the list, systemd says active, but health checks fail.

```bash
ps aux | grep -v grep | grep myapp
ps -eo pid,stat,comm | grep myapp
```

If state is `D` (uninterruptible sleep), the process is stuck on I/O.

```bash
# Check what it is waiting on
cat /proc/<pid>/wchan

# Check open file descriptors
ls -la /proc/<pid>/fd
```

`pipe_wait` → blocked on pipe. `nfs_*` → stale NFS mount. Disk I/O functions → storage problem.

### Scenario 2: High CPU usage

Load average is 8 on a 4-core server.

```bash
ps aux --sort=-%cpu | head -15
```

Check both `%CPU` and `TIME`. A process with 90% CPU and TIME of 00:05 just started spiking. A process with 90% CPU and TIME of 4:00:00 has been hot for hours.

```bash
# For multi-threaded processes, per-thread CPU
ps -eLf | grep <pid> | sort -k12 -rn | head

# Full command with arguments
ps -ef | grep <pid>
```

> *See also: [Reading Logs Like a Detective](/blog/log-analysis-incident-triage) — correlate CPU spikes with application log timestamps.*

### Scenario 3: Memory leak

Application memory grows over hours without releasing.

```bash
# Baseline RSS now
ps -p <pid> -o pid,rss,vsz,comm

# Track over time
while true; do
  echo "$(date): $(ps -p <pid> -o rss= | tr -d ' ') KB"
  sleep 60
done | tee /tmp/memory_track.log
```

RSS growing 10MB/hour = ~240MB/day. Extrapolate to when it exhausts RAM.

```bash
# Compare RSS across all instances of the same service
ps aux | grep -v grep | grep myapp | awk '{print $2, $6}' | sort -k2 -rn
```

### Scenario 4: Zombie processes accumulating

```bash
# Count zombies
ps aux | awk '$8 == "Z"' | wc -l

# All zombies with parents
ps -eo pid,ppid,stat,comm | awk '$3 ~ /Z/ {print "Zombie PID:", $1, "Parent:", $2, "Cmd:", $4}'
```

One or two zombies is normal. Dozens accumulating means the parent is not calling `wait()` — it has a bug, is hung, or overwhelmed.

```bash
# Check if parent is healthy
ps -p <ppid> -o pid,stat,comm,%cpu,%mem
```

---

## Common Mistakes Engineers Make with ps

These are the errors that show up repeatedly in incident postmortems.

**Mistake 1: Trusting VSZ for memory diagnosis.**
VSZ is virtual — it includes shared libraries, memory-mapped files, and unallocated reserved space. A process showing 4GB VSZ might only be using 300MB of actual RAM. **Always use RSS for memory investigations.** `ps aux --sort=-%mem` sorts by `%MEM` which is based on RSS, so that is fine. But do not look at the VSZ column and panic.

**Mistake 2: Killing a process without checking the STAT column.**
A process in `D` state (uninterruptible I/O wait) **cannot be killed with `kill -9`**. The signal is queued but not delivered until the I/O completes. Engineers waste minutes trying to kill a stuck process when the real problem is a hung NFS mount or failing disk. Check STAT first.

**Mistake 3: Ignoring the PPID when an unexpected process appears.**
When you see an unknown high-CPU process, the first instinct is to kill it. The correct action is to check its parent first. That process might be a legitimate child of your application — killing it without understanding the tree can take the parent down too, or the parent will just respawn it.

```bash
# Before killing anything, check the full tree
ps -ef --forest | grep -A5 -B5 <pid>
```

**Mistake 4: Using `ps aux | grep ... | awk '{print $2}' | xargs kill`**
This pipeline has a race condition. The PID you found with `ps` might belong to a different process by the time `kill` runs (especially on busy systems with high process churn). Use `pkill` or `pgrep` instead — they resolve the name-to-PID in a single atomic operation.

**Mistake 5: Forgetting that `%CPU` in ps is a lifetime average.**
A process that spiked in the last 10 seconds but has been idle for 2 hours will show near-0% CPU in `ps`. If you are chasing a current spike, use `top` or `ps aux --sort=-%cpu` but be aware of this limitation. Cross-reference with `TIME` column — if TIME jumped recently, the process was active.

---

## Advanced Tips

### Sort and filter efficiently

```bash
# Top 10 by CPU
ps aux --sort=-%cpu | head -11

# Top 10 by memory (RSS)
ps aux --sort=-%mem | head -11

# Processes owned by a specific user
ps -u nginx -o pid,stat,%cpu,%mem,comm

# Processes older than 1 hour (using etime)
ps -eo pid,etime,comm | awk '{
  split($2,t,":");
  if (length(t)==3 || index($2,"-")) print $0
}'
```

### The grep self-match problem

```bash
# BAD — matches the grep process itself
ps aux | grep nginx

# GOOD — character class prevents self-match
ps aux | grep '[n]ginx'

# ALSO GOOD — explicit exclusion
ps aux | grep -v grep | grep nginx

# BEST for scripting — use pgrep
pgrep -x nginx          # exact match
pgrep -a nginx          # show full command
pgrep -u www-data nginx # by user + name
```

### Never kill blindly

```bash
# WRONG — sends SIGKILL, no cleanup
kill -9 <pid>

# RIGHT — send SIGTERM first (graceful shutdown)
kill -15 <pid>   # or: kill <pid>

# Wait, then check
sleep 5
ps -p <pid>

# Only use SIGKILL if graceful shutdown failed
kill -9 <pid>
```

**SIGKILL does not allow the process to close file descriptors, flush buffers, or release locks.** Killing a database process with `-9` can corrupt data or leave lock files that prevent restart.

### Combine ps with other tools

```bash
# ps + lsof — what files does a process have open?
lsof -p <pid>

# ps + strace — what is it doing right now?
strace -p <pid> -e trace=all 2>&1 | head -20

# ps + /proc — raw kernel data
cat /proc/<pid>/status
cat /proc/<pid>/cmdline | tr '\0' ' '
cat /proc/<pid>/environ | tr '\0' '\n'
```

> *For a full guide on using `lsof`, `strace`, and `ss` together during incidents, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging).*

---

## Ubuntu vs Red Hat: ps Is the Same

The `ps` command behaves identically on Ubuntu and RHEL. It comes from the `procps-ng` package, installed by default on both.

```bash
# Ubuntu
dpkg -l | grep procps

# RHEL / CentOS / Rocky / AlmaLinux
rpm -q procps-ng
```

Where you will notice differences:

| Area | Ubuntu | RHEL |
|---|---|---|
| Service manager | systemd | systemd |
| Package manager | apt | dnf/yum |
| Init process | systemd (PID 1) | systemd (PID 1) |
| `/proc` filesystem | identical | identical |

Any `ps` command in this guide works on both distributions without modification.

---

## Best Practices: Production Mindset

**Never kill a process without understanding what it does.**
Check its parent, check its children, check what files it has open. An innocent-looking PID might be holding a database lock.

**Always check the parent process first.**
Most unexpected processes are children of something that spawned them intentionally. Kill the child without understanding the parent, and the parent spawns another one.

**Correlate with logs.**
`ps` tells you state. Logs tell you why. High CPU in `ps` + "processing batch job" in the log = expected. High CPU + no log activity = investigate.

**Use `pgrep` and `pkill` in scripts, not `ps | grep | awk | kill`.**
The pipeline approach has race conditions. Use atomic tools.

```bash
pkill -TERM -x nginx
pkill -TERM -u www-data
kill $(pgrep -x nginx)
```

**Document what you did.**
In a production incident, note the PID, state, command, parent, and time. This becomes your postmortem data.

---

## Quick Reference Cheat Sheet

```bash
# ── BASIC ─────────────────────────────────────────────────────────
ps aux                          # all processes, all users (BSD)
ps -ef                          # all processes with PPID (UNIX)
ps -ef --forest                 # process tree view

# ── FILTERING ─────────────────────────────────────────────────────
ps aux | grep '[n]ginx'         # filter (no self-match)
ps -C nginx                     # filter by command name
ps -p 1234                      # filter by PID
ps -u www-data                  # filter by user
pgrep -a nginx                  # pgrep with full command

# ── SORTING ───────────────────────────────────────────────────────
ps aux --sort=-%cpu | head -10  # top 10 by CPU
ps aux --sort=-%mem | head -10  # top 10 by memory
ps -eo pid,rss,comm --sort=-rss | head -10  # by RSS

# ── CUSTOM OUTPUT ─────────────────────────────────────────────────
ps -eo pid,ppid,user,%cpu,%mem,stat,comm
ps -p <pid> -o pid,rss,vsz,stat,comm

# ── ZOMBIES ───────────────────────────────────────────────────────
ps aux | awk '$8 == "Z"'
ps -eo pid,ppid,stat,comm | grep -E '\bZ\b'

# ── MEMORY TRACKING ───────────────────────────────────────────────
while true; do ps -p <pid> -o rss= ; sleep 5; done

# ── PROCESS TREE ──────────────────────────────────────────────────
pstree -p
ps -ef | awk -v ppid=<pid> '$3 == ppid'
```

---

## Frequently Asked Questions

**What is the difference between ps aux and ps -ef?**
Both show all processes. `ps aux` uses BSD syntax and shows `%CPU`, `%MEM`, `VSZ`, `RSS`, and `TTY`. `ps -ef` uses UNIX syntax and shows `PPID` and `STIME`. Use `ps aux` for resource usage, `ps -ef` when tracing process parentage or reading full command arguments.

**Why does ps show different CPU than top?**
`ps` shows CPU averaged over the entire lifetime of the process. `top` shows a recent interval (default 3 seconds). A process that just spiked will show high in `top` but low in `ps` if it has been running for hours at low CPU.

**Can I kill a zombie process?**
No. A zombie is already dead — it is waiting for its parent to call `wait()`. `kill -9` will not work. The only fix is for the parent to reap it, or to kill the parent so init adopts and reaps the orphan.

**Why does ps show a process but I cannot connect to the service?**
The process could be in `D` state (stuck on I/O), in a crash loop, or the socket is not bound. Check with `ps -eo stat` for state and `ss -tlnp` to confirm the port is actually listening.

**What is the difference between VSZ and RSS?**
VSZ is total virtual address space — includes shared libraries and unallocated reserved memory. RSS is actual physical RAM in use. Track RSS for memory leak investigation. VSZ is almost always misleadingly large.

---

## Conclusion

The `ps` command on Linux is foundational to production troubleshooting. Not because it is sophisticated — it is not — but because it gives you ground truth about what is running when everything else is uncertain.

In a production incident, `ps` answers the first question: is the process there, and what state is it in? Everything else — log analysis, strace, lsof, network checks — builds on that foundation.

Learn to read `ps` output fluently. Understand the STAT column. Know the difference between VSZ and RSS. Know when to use `ps aux` versus `ps -ef`. Avoid the common mistakes that slow down incident response.

**Engineers who resolve incidents fast do not know more tools. They know a few tools deeply.**

`ps` is one of them.

---

*Related reading: [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — the next layer of process debugging beyond ps. [Reading Logs Like a Detective: A Field Guide to Incident Triage](/blog/log-analysis-incident-triage) — correlating what ps shows you with what logs tell you.*