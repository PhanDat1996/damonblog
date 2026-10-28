---
title: "Linux Process States: R, S, D, Z and What to Do About Each"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Load is 18, CPU is idle, and kill -9 does nothing? What R, S, D, Z, T and I mean in ps and top, why D tasks inflate load, and how to clear zombies."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

Load average is 18. CPU is 93% idle. The application is frozen. You find the stuck process, run `kill -9`, and it's still there. You run it again. Still there.

That process is in state `D`, and no signal will touch it until the I/O it's waiting on completes. Knowing what each process state means tells you, before you open a single log, whether the problem is CPU, storage, a parent process bug, or someone's forgotten `Ctrl+Z`.

---

## TL;DR

| State | Name | Can you kill it? | Usually means | Do this |
|---|---|---|---|---|
| `R` | Running / runnable | Yes | On a CPU or waiting for one | Fine, unless many more than `nproc` |
| `S` | Interruptible sleep | Yes | Waiting for an event | Normal. Check `wchan` if it should be working |
| `D` | Uninterruptible sleep | **Not until the wait ends** (some waits accept SIGKILL) | Disk, NFS or driver I/O | Fix the storage/NFS, not the process |
| `Z` | Zombie | No: it's already dead | Parent hasn't reaped it | Fix or restart the **parent** |
| `T` / `t` | Stopped / traced | Yes | `SIGSTOP`, `Ctrl+Z`, debugger | `kill -CONT`, or detach the debugger |
| `I` | Idle kernel thread | — | Kernel worker with nothing to do | Ignore |

```bash
ps -eo stat= | cut -c1 | sort | uniq -c | sort -rn    # count tasks by state
ps -eo stat,pid,ppid,wchan:32,args | awk '$1 ~ /^[DZ]/'  # stuck and zombie tasks
```

---

## Where you see states

- `ps`: the `STAT` column. The **first letter** is the state; anything after it is flags (`s` session leader, `l` multithreaded, `+` foreground, `<` high priority, `N` low priority). `Ssl` = sleeping, session leader, multithreaded.
- `top`: the `S` column, plus the `Tasks:` line in the header, which counts running, sleeping, stopped and zombie.
- `/proc/<PID>/status`: the `State:` line, e.g. `State:	D (disk sleep)`.

---

## R: running or runnable

The task is either on a CPU right now or in the run queue waiting for one. Linux doesn't distinguish the two in `ps`.

A few `R` tasks are normal on a busy server. Consistently **more runnable tasks than CPUs** means CPU contention. The cleanest way to see that is the `r` column of `vmstat 1`, compared with `nproc`. If it's one task pinned at 100% instead, see [Linux High CPU Usage](/blog/linux-high-cpu-usage-guide).

---

## S: interruptible sleep

Most processes spend most of their time here: waiting on a socket, a timer, a lock, a child. Any signal wakes them.

`S` is never the problem by itself. The useful question is *what* it's waiting on, which the kernel exposes as the wait channel:

```bash
ps -o pid,stat,wchan:32,args -p 8823
```

Values depend on the kernel version, but you'll typically see things like:

| wchan contains | Waiting for |
|---|---|
| `ep_poll`, `do_epoll_wait`, `do_select`, `poll_schedule_timeout` | Events on file descriptors: normal for servers |
| `futex_wait` (e.g. `futex_wait_queue`) | A userspace lock or condition variable |
| `sk_wait_data`, `wait_woken`, `inet_csk_accept` | Socket data or an incoming connection |
| `pipe_read`, `pipe_wait` | Data on a pipe |
| `do_wait` | A child process to exit |
| `hrtimer_nanosleep` | `sleep()` |

An API worker sitting in a socket wait for a long time is usually waiting on something upstream (a database, another service), not broken itself.

---

## D: uninterruptible sleep

The task is inside the kernel waiting for something it can't safely abandon halfway, almost always I/O: a block device read, a filesystem journal commit, an NFS reply, a device driver.

### Why `kill -9` doesn't work

Signals, including SIGKILL, are only acted on when the task returns from the wait. If the disk or NFS server never answers, the task never returns, so it never dies. Rebooting may even hang on it.

There's one useful exception: many waits (notably in NFS) use a **killable** variant. Those still show as `D`, but a fatal signal like SIGKILL does wake them. If `kill -9` works on a `D` task, that's why. If it doesn't, the wait isn't killable.

### Why it raises the load average

On Linux, the load average counts tasks in `D` as well as runnable ones. Twenty tasks blocked on a dead NFS mount add about 20 to the load while the CPU sits idle:

```
top - 14:02:11 up 31 days,  4:10,  2 users,  load average: 18.32, 14.21, 9.83
%Cpu(s):  3.2 us,  1.1 sy,  0.0 ni, 93.2 id,  2.1 wa,  0.0 hi,  0.4 si,  0.0 st
```

High load + idle CPU = look for `D`. In `top`, press `o` and type `S=D` to filter.

### Finding what they're blocked on

```bash
ps -eo stat,pid,wchan:32,args | awk '$1 ~ /^D/'
```

```
D     1823 rpc_wait_bit_killable           /usr/bin/rsync -a /data/ /mnt/shared/
D     1824 rpc_wait_bit_killable           ls /mnt/shared
D     1901 folio_wait_bit_common           /usr/bin/python3 /opt/etl/run.py
```

As root you can see the full kernel stack, which is much more telling than a single function name:

```bash
cat /proc/1823/stack
```

The kernel also logs tasks stuck in `D` for longer than `kernel.hung_task_timeout_secs` (120 seconds by default, where enabled):

```bash
journalctl -k | grep -A5 'blocked for more than'
```

```
INFO: task rsync:1823 blocked for more than 120 seconds.
```

### Fixing the cause

**Hung NFS mount** (waits in `rpc_*` or `nfs_*`):

```bash
findmnt -t nfs,nfs4                     # which NFS mounts exist
timeout 5 stat /mnt/shared || echo hung # test without hanging your shell
nc -zv 10.0.1.50 2049                   # can you reach the NFS server port?
```

The real fix is bringing the server or network back; with the default `hard` mount option, clients retry indefinitely and then resume normally. If you have to give up on the mount:

```bash
umount -f /mnt/shared          # aborts outstanding NFS requests
umount -l /mnt/shared          # last resort: detach now, clean up when no longer busy
```

> **Warning:** forcing an NFS unmount discards writes that haven't reached the server, and processes that were blocked get I/O errors. A lazy (`-l`) unmount hides the mount from new processes but doesn't necessarily unstick the ones already blocked.

**Local disk** (waits in the block layer, `jbd2_*`, `xfs_*`, `ext4_*`, or page/folio waits):

```bash
journalctl -k | grep -iE 'I/O error|ata[0-9]|nvme|scsi|reset' | tail -20
iostat -x 1 3                           # await and %util per device (sysstat)
smartctl -H -A /dev/sda                 # health and error counters (smartmontools)
```

High `await` and `%util` near 100% means the device is just overloaded; kernel I/O errors and resets mean it's failing. [Check Disk I/O with iostat](/blog/linux-check-disk-io-iostat) explains how to read those numbers. A full filesystem can also cause heavy writeback stalls; see [Disk Full on Linux](/blog/disk-full-linux-cleanup).

If the device is truly gone, `D` tasks may only clear with a reboot.

---

## Z: zombie

A zombie has already exited. Its memory and file descriptors are released; all that remains is a process-table entry holding its exit status until the parent collects it with `wait()`/`waitpid()`. `ps` shows it as `<defunct>`.

You can't kill a zombie, since there's nothing left to kill. It disappears when:

1. The parent reaps it (`wait()`), or
2. The parent exits, so the zombie is re-parented to PID 1 (or the nearest subreaper), which reaps it.

```bash
ps -eo stat,pid,ppid,etime,comm | awk '$1 ~ /^Z/'
```

```
Z     8823  8801    00:14:02 myapp-worker <defunct>
Z     8824  8801    00:13:57 myapp-worker <defunct>
Z     8825  8801    00:12:40 myapp-worker <defunct>
```

All share PPID 8801, so 8801 is the problem:

```bash
ps -p 8801 -o pid,stat,etime,args
```

### Does it matter?

A few transient zombies are normal. A steadily **growing** count means the parent isn't reaping its children, which is a bug in that program. Each zombie holds a PID, and PIDs are limited by `kernel.pid_max` (32768 in the kernel default; many current distros raise it to 4194304) and by any cgroup `pids.max` limit, which for containers and systemd services can be far lower. When that's exhausted, `fork()` fails with "Resource temporarily unavailable."

### Clearing them

- **Restart the parent service** (`systemctl restart myapp`). When the parent exits, its zombies are reaped. This is the usual mitigation.
- **Send SIGCHLD to the parent** (`kill -CHLD 8801`). It only helps if the parent has a handler that reaps children and missed a notification. Harmless to try.
- **In containers**, if PID 1 is your application rather than an init, nobody reaps orphaned grandchildren. Run with `docker run --init` (or use `tini`/`dumb-init` as the entrypoint).

---

## T and t: stopped

`T` is a task stopped by a signal (`SIGSTOP`, `SIGTSTP` from `Ctrl+Z`). `t` is stopped by a tracer such as `gdb` at a breakpoint.

```bash
kill -CONT 4521                          # resume a stopped process
grep TracerPid /proc/4521/status         # non-zero = something is attached (that's its PID)
```

A stopped production process is usually someone's forgotten `Ctrl+Z` in a terminal or a debugger left attached.

---

## I: idle kernel threads

Since kernel 4.14, idle kernel threads (like `kworker/...`) show as `I` instead of `D`, so they no longer inflate the load average or show up in `D` counts. Ignore them. On older kernels you may still see such threads as `D`.

---

## Quick checklist

1. `uptime` + `top`: high load with idle CPU? Count `D` tasks.
2. `ps -eo stat,pid,wchan:32,args | awk '$1 ~ /^D/'`: NFS (`rpc_`/`nfs_`) or disk?
3. Kernel log for `blocked for more than` and I/O errors.
4. Fix the storage or NFS server. Don't waste time on `kill -9`.
5. Zombies growing? Find the common PPID and fix or restart that parent.

---

*Related: [ps Command in Linux](/blog/ps-command-linux-troubleshooting) for STAT flags and `-o` recipes. [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) for the broader triage. [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for what an `S` process is waiting on.*
