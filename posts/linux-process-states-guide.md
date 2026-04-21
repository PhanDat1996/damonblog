---
title: "Linux Process States Explained: R, S, D, Z and What They Mean for Troubleshooting"
date: "2026-04-21"
excerpt: "A practical guide to Linux process states — R, S, D, Z, T — what each means, how to read them in ps and top, why D state can freeze a system, and how to handle zombie processes in production."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "linux-process-states-guide"
---

# Linux Process States Explained: R, S, D, Z and What They Mean for Troubleshooting

## TL;DR

- **`R`** — Running or runnable. Process is on the CPU or waiting for a CPU slot. Normal.
- **`S`** — Sleeping. Waiting for an event (timer, input, network). Normal.
- **`D`** — Uninterruptible sleep. Waiting on I/O. **Cannot be killed.** Signals are ignored.
- **`Z`** — Zombie. Process finished but parent has not collected its exit status. Already dead.
- **`T`** — Stopped. Sent `SIGSTOP` or paused by a debugger.
- **High D-state count = I/O problem**, not a CPU or application problem
- **Zombies are harmless in small numbers** but indicate a parent process bug if accumulating
- You cannot kill a `D`-state or `Z`-state process with `kill -9` — different problems, different solutions

---

## Introduction: Why Process States Matter in Troubleshooting

You are debugging a hung process. Load average is 8. CPU looks idle. You run `ps aux` and see dozens of processes in state `D`. You run `kill -9` on the worst offender. Nothing happens.

Understanding **Linux process states** is the difference between diagnosing a problem correctly and wasting 30 minutes doing things that cannot work.

Every process on a Linux system is always in one of a small set of states. These states are visible in the `STAT` column of `ps` and the `S` column of `top`. They tell you exactly what the kernel is doing with that process at any given moment — and more importantly, what you can and cannot do about it.

This guide covers each state, what triggers it, what it means for your system, and how to use state information in real production troubleshooting.

---

## How to See Process States

```bash
# STAT column in ps aux
ps aux
# USER  PID  %CPU %MEM  ... STAT  ... COMMAND
# app   1234  2.1  0.8  ... S     ... myapp
# root  5678  0.0  0.0  ... Z     ... defunct

# S column in top
top
# PID  USER  S  %CPU  %MEM  COMMAND
# 1234 app   S   2.1   0.8  myapp

# Focused state query
ps -eo pid,stat,comm

# Count processes by state
ps -eo stat | grep -oE '^[A-Z]' | sort | uniq -c | sort -rn
```

The `STAT` column can contain multiple characters. The first character is the primary state. Additional characters are flags:

| Flag | Meaning |
|---|---|
| `s` | Session leader |
| `l` | Multi-threaded |
| `+` | Foreground process group |
| `N` | Low priority (niced) |
| `<` | High priority |
| `L` | Pages locked in memory |

So `Ss` = sleeping session leader. `Rl` = running, multi-threaded.

---

## R — Running or Runnable

A process in state `R` is either currently executing on a CPU, or it is ready to run and waiting in the scheduler queue for a CPU to become available.

```bash
ps aux | grep ' R '
# or
ps -eo pid,stat,comm | grep '^[0-9]* R'
```

**What it means:**
- The process is actively doing work
- Normal for application processes under load
- High number of `R` state processes = CPU contention

**When to investigate:**
- Single process stuck at `R` with 99%+ CPU that never decreases
- Many processes in `R` state combined with high load average

```bash
# Count running processes
ps -eo stat | grep '^R' | wc -l

# See all running processes
ps -eo pid,ppid,user,%cpu,stat,comm | grep ' R'
```

**Normal:** A server under load will have a few `R` processes. On a 4-core system, having 4 processes in `R` means all cores are at capacity.

**Abnormal:** Dozens of `R` processes accumulating while work is not completing — this indicates CPU starvation, a runaway process, or a priority inversion.

---

## S — Interruptible Sleep

A process in state `S` is sleeping, waiting for something to happen — a timer to fire, data to arrive on a socket, a lock to be released, a child process to finish.

This is the most common state. The majority of processes on any Linux system are sleeping most of the time.

```bash
# Count sleeping processes (will be the majority)
ps -eo stat | grep '^S' | wc -l
```

**What it means:**
- Process is idle, not consuming CPU
- Will wake up when the event it is waiting for occurs
- Can be interrupted by a signal (that is what "interruptible" means)

**When to investigate:**
- A process that should be active is stuck in `S` for an extended period
- A process is sleeping but accumulating `TIME+` (should not happen in pure sleep)

The `S` state itself is almost never a problem. What matters is *what* the process is waiting for. That is stored in the `wchan` (wait channel):

```bash
# See what a sleeping process is waiting on
cat /proc/<pid>/wchan

# Common values and meanings:
# wait_woken           → waiting for a futex (mutex/semaphore) — app-level lock
# tcp_recvmsg          → waiting for network data
# poll_schedule_timeout → waiting on I/O multiplexing (epoll/select)
# schedule             → voluntarily yielding CPU
# pipe_wait            → waiting for pipe data
```

If a process is in `S` state and `wchan` shows `tcp_recvmsg` for an unusually long time, it is waiting for a remote server to respond. That might be your upstream problem, not this process.

---

## D — Uninterruptible Sleep: The Dangerous State

**`D` state is the most important state to understand** because it behaves differently from everything else.

A process in `D` state is sleeping and **cannot be interrupted by any signal** — including `SIGKILL`. When you run `kill -9 <pid>` on a D-state process, the kernel queues the signal. The process does not die until it wakes up from the I/O it is waiting on. If the I/O never completes, the process never dies.

```bash
# Find all D-state processes
ps aux | awk '$8 ~ /^D/ {print}'

# Or
ps -eo pid,stat,comm | grep '^[0-9]* D'

# Count them
ps -eo stat | grep '^D' | wc -l
```

### What causes D state?

D-state is triggered when a process makes a kernel I/O call that the kernel cannot fulfill immediately, and cannot safely interrupt. The most common causes:

- **Local disk I/O** — disk is slow, failing, or overloaded
- **NFS mounts** — remote NFS server is unreachable or responding slowly
- **Block device issues** — SCSI/SAS errors, degraded RAID, failing disk
- **Memory management** — kernel swap operations (though this is usually brief)
- **Some network filesystems** — SMB/CIFS with improper timeouts

### Why D state is dangerous

```bash
# Check load average
uptime
# load average: 0.52, 8.45, 12.33  ← 15-minute avg is high

# Check D-state count
ps -eo stat | grep '^D' | wc -l
# 18
```

**D-state processes count toward load average** even though they are consuming zero CPU. A server with 18 processes in D state will show a load average of 18+ — regardless of CPU utilization. You will see `%id` at 90% in `top` while load average is 15 and the system feels completely unresponsive.

This is the classic symptom of **NFS mount hang** or **disk failure**:
- CPU is idle
- Load average is very high
- Processes in D state are piling up
- `kill -9` does nothing

```bash
# Identify what D-state processes are waiting on
for pid in $(ps -eo pid,stat | awk '$2 ~ /^D/ {print $1}'); do
  echo "PID $pid: $(cat /proc/$pid/wchan 2>/dev/null) | $(ps -p $pid -o comm= 2>/dev/null)"
done
```

### How to resolve D state

**You cannot resolve it from the process side.** The process is waiting for the kernel to complete an I/O operation. You must fix the underlying I/O problem.

```bash
# Check for disk errors
dmesg | tail -50 | grep -iE 'error|fail|warn|I/O'

# Check disk health
smartctl -a /dev/sda

# Check NFS mounts
mount | grep nfs
cat /proc/mounts | grep nfs

# Check if NFS server is reachable
showmount -e <nfs_server_ip>

# If it is a hung NFS mount, force unmount
umount -f -l /mnt/hung_nfs_mount
```

If the disk is failing, the D-state processes will remain until the I/O either completes or the system is rebooted. On a severely degraded storage system, **a reboot may be the only resolution** — and even that is only a temporary fix until the underlying hardware is replaced.

> *For deeper investigation into what a D-state process is doing at the kernel level, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging).*

---

## Z — Zombie Processes: Already Dead

A zombie process (`Z` state) is a process that has finished executing but whose parent has not yet called `wait()` to collect its exit status. The process is dead — its code is gone, its memory is freed — but its entry in the process table remains as a placeholder for the exit code.

```bash
# Find zombie processes
ps aux | awk '$8 == "Z"'

# With parent PID
ps -eo pid,ppid,stat,comm | grep ' Z'

# In top header
# Tasks: 287 total, 3 running, 281 sleeping, 0 stopped, 3 zombie
```

### Why zombies exist

When a process exits, the kernel does not immediately remove it from the process table. It keeps the entry with state `Z` until the parent process calls the `wait()` or `waitpid()` system call to retrieve the child's exit code. This is by design — it gives the parent a chance to learn how its child terminated.

If the parent collects the exit status promptly, the zombie disappears almost immediately. If the parent does not call `wait()` — because it has a bug, is too busy, or has itself crashed — the zombie persists.

### Why you cannot kill a zombie

A zombie is already dead. `kill -9` sends `SIGKILL` to a living process. There is nothing to kill. The zombie entry will disappear only when:

1. The parent calls `wait()` to collect its exit status
2. The parent process itself terminates (orphaning the zombie, which init then reaps)

```bash
# Find the parent of a zombie
ZOMBIE_PID=1234
PARENT_PID=$(ps -o ppid= -p $ZOMBIE_PID | tr -d ' ')
echo "Parent: $PARENT_PID"
ps -p $PARENT_PID -o pid,comm,stat

# Check what the parent is doing
cat /proc/$PARENT_PID/wchan
```

### When zombies are a problem

**A few zombies are normal** — brief moments between child exit and parent `wait()` call. One or two zombies visible at any moment is not concerning.

**Accumulating zombies are a bug signal.** If you see 50+ zombies, the parent process has a defect — it is creating children faster than it is reaping them, or it has stopped reaping entirely.

```bash
# Count zombies over time
watch -n 5 'ps aux | awk '\''$8 == "Z"'\'' | wc -l'
```

The practical resolution for accumulating zombies:

```bash
# Option 1: Restart the parent service (zombies disappear when parent exits)
systemctl restart <service>

# Option 2: If you cannot restart the parent, kill it
# (init adopts and reaps the orphaned zombies)
kill -15 $PARENT_PID
sleep 5
kill -9 $PARENT_PID  # if graceful shutdown failed

# Option 3: Send SIGCHLD to the parent (tells it to check for dead children)
kill -SIGCHLD $PARENT_PID
```

**Important:** Zombies consume almost no resources. They hold a PID and a slot in the process table, nothing else. On Linux, the default PID limit is 32768 (`/proc/sys/kernel/pid_max`). If zombie accumulation is severe enough to exhaust the PID space, new processes cannot be created — but this requires tens of thousands of zombies. In practice, zombie accumulation is a code quality signal more than an immediate operational problem.

---

## T — Stopped

A `T`-state process has been explicitly stopped — either by receiving `SIGSTOP`, by the user pressing Ctrl+Z in a terminal, or by a debugger (like `gdb` or `strace`) attaching to it.

```bash
ps aux | awk '$8 ~ /^T/'
```

**Common causes:**

- Developer pressed Ctrl+Z and forgot to `fg` or `kill` the process
- A `strace` or `gdb` session left attached
- A process that was stopped intentionally for inspection

```bash
# Resume a stopped process
kill -SIGCONT <pid>

# Or if it was stopped in a shell
fg   # bring to foreground
bg   # resume in background
```

If you see `T`-state processes in production that should not be stopped, check whether a debugging session is attached:

```bash
# Check for attached tracers
cat /proc/<pid>/status | grep TracerPid
# TracerPid: 5678  ← something is attached (pid 5678)
# TracerPid: 0     ← nothing attached
```

---

## Real-World Troubleshooting Scenarios

### Scenario 1: Load Average High, CPU Idle — D State Storm

```
load average: 18.32, 14.21, 9.83
%Cpu(s):  3.2 us,  1.1 sy,  0.0 ni, 93.2 id,  2.1 wa
```

High load, low CPU usage. Classic symptom.

```bash
# Confirm D-state accumulation
ps -eo stat | grep '^D' | wc -l
# 22

# Identify what they are waiting on
for pid in $(ps -eo pid,stat | awk '$2 ~ /^D/ {print $1}'); do
  echo "PID $pid: $(cat /proc/$pid/wchan 2>/dev/null)"
done
# PID 1823: nfs4_wait_bit_killable
# PID 1824: nfs4_wait_bit_killable
# PID 1901: nfs4_wait_bit_killable
# ...
```

All processes waiting on `nfs4_wait_bit_killable` — a hung NFS mount.

```bash
# Find the mount
mount | grep nfs
# 10.0.1.50:/data on /mnt/shared type nfs4

# Force unmount
umount -f -l /mnt/shared

# Investigate NFS server
ping 10.0.1.50
showmount -e 10.0.1.50
```

After the force unmount, the D-state processes will unblock, the load average will drop, and the system will recover — provided the application can handle the lost NFS mount gracefully.

### Scenario 2: Zombie Count Growing After Deployment

New version deployed. Ten minutes later:

```
Tasks: 312 total, 4 running, 289 sleeping, 0 stopped, 19 zombie
```

19 zombies. Growing.

```bash
# Find a sample zombie and its parent
ps -eo pid,ppid,stat,comm | awk '$3 ~ /Z/ {print}' | head -5
# 8823 8801 Z myapp-worker
# 8824 8801 Z myapp-worker
# 8825 8801 Z myapp-worker

# Parent is 8801
ps -p 8801 -o pid,comm,stat,%cpu
# 8801 myapp-master S 0.2

# Check how many children parent has spawned
ps -eo ppid | grep '^8801$' | wc -l
# 47
```

The master process is spawning workers but not reaping them. The new deployment introduced a bug in the worker management code — the `wait()` call is missing or unreachable in an error path.

```bash
# Immediate mitigation: restart the service
systemctl restart myapp

# Confirm zombies cleared
ps aux | awk '$8 == "Z"' | wc -l
# 0
```

The fix is a code change — the signal handler or wait loop in the master process is not calling `waitpid()` when workers exit.

### Scenario 3: Single Process Stuck in D, Everything Else Fine

One process in D state, load average is slightly elevated but system is otherwise healthy.

```bash
ps -p 4521 -o pid,stat,comm
# 4521 D mybackup

cat /proc/4521/wchan
# jbd2_journal_commit_transaction
```

Waiting on journal I/O. Check disk:

```bash
dmesg | tail -20 | grep -iE 'error|ata|scsi|I/O'
# [12345.67890] ata1.00: failed command: WRITE FPDMA QUEUED
# [12345.68012] ata1.00: status: { DRDY ERR }
```

Disk is throwing errors. The backup process hit a bad sector. This may resolve on its own (kernel will retry I/O), or the disk may be failing and needs replacement.

```bash
# Check SMART data
smartctl -a /dev/sda | grep -E 'Reallocated|Uncorrectable|Pending'
```

---

## Quick Reference: Process States

| State | Name | Can be killed? | Common cause | What to do |
|---|---|---|---|---|
| `R` | Running | Yes | Normal execution | Nothing, unless sustained 100% |
| `S` | Sleeping | Yes | Waiting for event | Check `wchan` if stuck |
| `D` | Uninterruptible sleep | **No** | Disk/NFS I/O | Fix the I/O source |
| `Z` | Zombie | N/A (already dead) | Parent not calling `wait()` | Restart parent |
| `T` | Stopped | Yes | SIGSTOP, debugger | `kill -SIGCONT` to resume |

---

## Conclusion

Linux process states are not abstract kernel internals — they are the fastest diagnostic signal available when something is wrong on a production system.

**`D` state tells you storage is the problem**, not the application. Trying to kill D-state processes or restart services when NFS is hung is wasted effort. Fix the I/O source.

**`Z` state tells you a parent process has a bug**, not that a zombie is consuming resources. Killing zombies is impossible. Fixing or restarting the parent is the solution.

**`S` state** is background noise — nearly every process is sleeping nearly all the time. The interesting question is *what* it is sleeping on, which `wchan` answers.

**`R` state** is where CPU consumption lives. Many `R` processes under high load is CPU contention. One `R` process at 100% CPU is a runaway.

Read the STAT column first. It narrows your diagnosis before you open a single log file.

---

*Related reading: [ps Command Linux: The Engineer's Troubleshooting Guide](/blog/ps-command-linux-troubleshooting-guide) — how to use process states in ps output for production troubleshooting. [top Command Linux: Real-World Guide to CPU and Process Monitoring](/blog/top-command-linux-guide) — reading process states in the top interface. [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — deeper investigation into what a D or S state process is actually doing.*