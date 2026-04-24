---
title: "How to Check Running Processes in Linux: Complete Guide"
date: "2026-04-21"
excerpt: "How to check running processes in Linux using ps, top, and htop — with filtering techniques, real troubleshooting workflows, and common mistakes engineers make when investigating process issues."
tags: ["linux", "troubleshooting", "debugging", "monitoring"]
featured: false
slug: "check-running-process-linux-guide"
category: "linux"
---

## TL;DR

- **`ps aux`** — best snapshot of all running processes, pipe to grep
- **`ps -ef`** — same but shows PPID (parent PID), use for process tree tracing
- **`top`** — live view, sorts by CPU by default, press `M` for memory
- **`htop`** — better UI version of top, `/` to search, mouse support
- **`pgrep`** — find process by name, use in scripts instead of `ps | grep`
- **`pidof`** — get PID of a process by name
- Checking process state (R/S/D/Z) is more important than just knowing it exists

---

## Introduction: Why Checking Running Processes Matters

A service is not responding. A server is slow. An alert fired for high memory. The first thing you do on any Linux system is **check what processes are actually running**.

`ps`, `top`, and `htop` are the three tools every Linux engineer uses to check running processes. Each answers a slightly different question, and knowing when to reach for which one is what separates fast incident diagnosis from fumbling around.

This guide covers how to check running processes in Linux effectively — not just the commands, but how to read the output and what to do with it.

---

## Using ps to Check Running Processes

`ps` takes a snapshot of the process table. It does not refresh — it captures the state at the exact moment you run it. That makes it perfect for grepping, sorting, and scripting.

### ps aux — The Default Starting Point

```bash
ps aux
```

Output:
```
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.0 169316 13312 ?        Ss   Apr20   0:05 /sbin/init
www-data  1234  2.1  0.8  89344 12288 ?        S    09:15   1:23 nginx: worker
app       5678 45.2  4.1 512000 65536 ?        R    09:20   3:41 java -jar app.jar
```

Key columns to read:
- **`%CPU`** — averaged over process lifetime, not instantaneous
- **`RSS`** — actual RAM used (ignore VSZ — it is misleading)
- **`STAT`** — process state: `R`=running, `S`=sleeping, `D`=I/O wait, `Z`=zombie
- **`TIME`** — total CPU time consumed since start

### ps -ef — When You Need the Full Picture

```bash
ps -ef
```

Use this when you need:
- **PPID** (parent process ID) to trace who spawned a process
- Full command line with all arguments
- Process hierarchy investigation

```bash
# See full command — critical for Java/Python processes with many flags
ps -ef | grep java
# app  5678  1000  ... java -Xmx4g -Xms1g -jar /opt/app/service.jar --config /etc/app/prod.conf
```

### ps -eo — Custom Columns

```bash
# Show exactly what you need
ps -eo pid,ppid,user,%cpu,%mem,rss,stat,comm --sort=-%cpu | head -15

# Just PIDs and names for a service
ps -eo pid,comm | grep nginx
```

> *For a complete deep-dive on ps, see [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide).*

---

## Using top and htop to Check Running Processes

`ps` gives you a snapshot. `top` and `htop` give you a live view — processes sorted by resource usage, updating every few seconds.

### top

```bash
top
```

Essential keys:
- **`P`** — sort by CPU (default)
- **`M`** — sort by memory
- **`1`** — toggle per-core CPU view
- **`k`** — kill a process
- **`u`** — filter by user
- **`o`** — filter by condition (`%CPU>5.0`)

```bash
# Jump straight to a specific PID
top -p 5678

# Batch mode — for scripting
top -b -n 1 | head -20
```

### htop

```bash
htop
```

`htop` is not installed by default but provides better navigation:
- **`/`** — search by process name
- **`F4`** — filter
- **`F5`** — process tree view
- **`F9`** — kill with signal menu
- Mouse click on column headers to sort

```bash
# Install
apt install htop    # Ubuntu
dnf install htop    # RHEL/Fedora
```

> *For a detailed comparison, see [htop vs top: Which Should You Use in Production?](/blog/htop-vs-top-linux-comparison).*

---

## Filtering and Finding Specific Processes

### grep — Quick Filter

```bash
# Find nginx processes
ps aux | grep nginx

# Avoid matching grep itself (the self-match problem)
ps aux | grep '[n]ginx'
ps aux | grep -v grep | grep nginx
```

### pgrep — Better for Scripts

```bash
# Get PID by name
pgrep nginx

# Show full command
pgrep -a nginx

# By user
pgrep -u www-data nginx

# Count instances
pgrep -c nginx
```

### pidof — Single Service PID

```bash
pidof nginx
# 1234 1235 1236  ← master + workers
```

### Filter by User

```bash
# ps: all processes by user
ps -u www-data

# top: filter at launch
top -u www-data

# htop: press 'u' inside
```

### Filter by Port (Find What's Listening)

```bash
# What process is using port 8080?
ss -tlnp | grep :8080
# or
lsof -i :8080
```

### Find by Resource Usage

```bash
# Top 10 CPU consumers right now
ps aux --sort=-%cpu | head -11

# Top 10 memory consumers (by RSS)
ps aux --sort=-%mem | head -11

# Processes over 100MB RSS
ps aux | awk '$6 > 102400 {print $2, $6/1024"MB", $11}'
```

---

## Real Troubleshooting Use Cases

### Use Case 1: Service Is Down — Did It Crash?

```bash
# Check if the process exists at all
ps -C nginx
pgrep -a nginx

# If nothing returns:
systemctl status nginx
journalctl -u nginx -n 50 --no-pager
```

### Use Case 2: Server Is Slow — What Is Using CPU?

```bash
# Snapshot top consumers
ps aux --sort=-%cpu | head -10

# Is it sustained? Watch it
watch -n 2 'ps aux --sort=-%cpu | head -5'

# Or use top with sort
top  # press P, check top 3 processes
```

### Use Case 3: Memory Is High — What Is Consuming It?

```bash
# Sort by RSS (actual physical RAM)
ps aux --sort=-%mem | head -10

# Check a specific process over time (leak detection)
PID=5678
while true; do
  echo "$(date): $(ps -p $PID -o rss= | tr -d ' ') KB"
  sleep 30
done
```

### Use Case 4: Process Exists But Service Is Unresponsive

```bash
# Check the process state
ps -p <pid> -o pid,stat,comm

# If state is D (uninterruptible sleep):
cat /proc/<pid>/wchan  # what kernel function it is stuck in
# nfs4_... = NFS problem
# jbd2_... = disk I/O problem
```

A `D`-state process cannot be killed. The I/O source must be fixed.

### Use Case 5: Finding Zombie Processes

```bash
# Find all zombies
ps aux | awk '$8 == "Z"'

# Count them
ps -eo stat | grep '^Z' | wc -l

# Find the parent
ps -eo pid,ppid,stat,comm | grep ' Z'
```

---

## Common Mistakes When Checking Running Processes

**Mistake 1: Using VSZ instead of RSS for memory.**
VSZ includes shared libraries and unmapped memory. A Java process showing 4GB VSZ might use 400MB of actual RAM. Always use RSS for real memory usage.

**Mistake 2: Trusting `%CPU` in ps as current.**
`ps` shows CPU averaged over the process lifetime. A process that just spiked in the last 5 seconds will still show near-zero in `ps`. Use `top` to catch current spikes.

**Mistake 3: `ps aux | grep service | awk '{print $2}' | xargs kill`**
This has a race condition — the PID may belong to a different process by the time `kill` runs. Use `pkill` or `pgrep` instead:
```bash
pkill -TERM nginx      # safer
kill $(pgrep -x nginx) # explicit and controlled
```

**Mistake 4: Trying to kill a `D`-state process.**
`kill -9` on a D-state process queues the signal but the process will not die until the I/O completes. Find the I/O problem instead.

**Mistake 5: Not checking PPID before killing.**
A process you want to kill might be a child that the parent will immediately respawn. Always check the parent first:
```bash
ps -o ppid= -p <pid>
```

---

## Quick Reference

```bash
# ── CHECK ALL PROCESSES ───────────────────────────────────────────
ps aux                        # all processes, all users
ps -ef                        # all processes with parent PID
top                           # live view, sort by CPU
htop                          # live view, better UI

# ── FIND A SPECIFIC PROCESS ──────────────────────────────────────
ps aux | grep '[n]ginx'       # by name (no self-match)
ps -C nginx                   # exact name match
pgrep -a nginx                # by name, show command
pidof nginx                   # PID only
top -p 1234                   # monitor specific PID

# ── SORT BY RESOURCE ──────────────────────────────────────────────
ps aux --sort=-%cpu | head -10  # top CPU consumers
ps aux --sort=-%mem | head -10  # top memory consumers

# ── FILTER ───────────────────────────────────────────────────────
ps -u www-data                # by user
ps -eo pid,rss,comm | awk '$2 > 102400'  # RSS > 100MB

# ── CHECK STATE ───────────────────────────────────────────────────
ps -p <pid> -o pid,stat,comm  # check state of specific PID
ps aux | awk '$8 == "Z"'      # find zombies
ps -eo stat | grep '^D'       # find D-state (I/O stuck)
```

---

## Conclusion

Checking running processes in Linux is the first step in almost every troubleshooting workflow. `ps aux` for a quick snapshot. `top` to watch behavior live. `pgrep` in scripts.

The real skill is not remembering the flags — it is knowing what to look for after you run the command. Process state (`STAT` column), RSS vs VSZ, and PPID tell you more than just knowing a process exists.

**Read the state column. It tells you what the kernel is doing with that process right now — and what you can and cannot do about it.**

---

*Related reading: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — deep dive into ps output and production workflows. [Linux Process States Explained](/blog/linux-process-states-guide) — understanding R, S, D, Z states. [top Command Linux](/blog/top-command-linux-guide) — full top guide with real scenarios.*
