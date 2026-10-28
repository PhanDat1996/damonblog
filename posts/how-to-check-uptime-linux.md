---
title: "How to Check Uptime in Linux (and Read the Load Average)"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Check Linux uptime and last boot time with uptime, who -b and /proc/uptime, read the load average correctly, and find out whether a reboot was a crash."
tags: ["linux", "monitoring", "infrastructure", "troubleshooting"]
featured: false
category: "linux"
---

Monitoring says the server went away for four minutes overnight. Did it reboot? When? Was it planned, or did it crash? And while you're at it, what does that load average next to the uptime actually mean?

```bash
uptime                # up how long + users + load average
uptime -s             # exact boot time: 2026-10-21 06:44:11
uptime -p             # pretty duration: up 1 week, 2 hours, 31 minutes
who -b                # boot time, another way
journalctl --list-boots | tail -5   # recent boots with time ranges (systemd)
```

---

## Reading `uptime`

```
 09:15:42 up 14 days,  2:31,  3 users,  load average: 1.24, 0.87, 0.63
```

| Part | Meaning |
|---|---|
| `09:15:42` | Current time |
| `up 14 days, 2:31` | Time since boot: 14 days, 2 hours, 31 minutes |
| `3 users` | Login sessions in utmp (each SSH session, terminal or tmux window can count) |
| `load average: 1.24, 0.87, 0.63` | 1, 5 and 15-minute load averages |

Under a day, the format changes to `up 3:12` or `up 47 min`, so don't parse `uptime` output with fixed field numbers in scripts. Use `/proc/uptime` (below).

**In a container**, `uptime` shows the **host's** uptime, because `/proc/uptime` isn't per-container. For a container's age, use `docker inspect -f '{{.State.StartedAt}}' <name>`.

---

## Load average: what the three numbers mean

They're exponentially damped moving averages over 1, 5 and 15 minutes of the number of tasks that are:

- running on a CPU,
- waiting for a CPU, **or**
- in uninterruptible sleep (`D` state), usually waiting on disk or NFS.

That third group is Linux-specific and it's why load is **not** a CPU percentage. Twenty processes stuck on a dead NFS mount produce a load of about 20 while the CPU is almost idle.

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

The same load of 4.0 is saturation on a 2-CPU VM and light work on a 32-core server. And because of the `D`-state rule, always confirm what kind of waiting it is before calling it a CPU problem. [How to Check CPU Usage in Linux](/blog/check-cpu-usage-linux) and [Linux Process States](/blog/linux-process-states-guide) cover both sides.

### Read the trend

- `6.20, 3.10, 1.05`: 1-minute much higher than 15-minute. Something started recently and is getting worse.
- `0.50, 2.40, 4.10`: falling. A spike is over or recovering.
- `4.10, 4.05, 4.12`: steady. This is the normal level for this workload, high or not.

---

## When did it boot, and was it a crash?

### Boot time

```bash
uptime -s
# 2026-10-21 06:44:11
who -b
#          system boot  2026-10-21 06:44
```

### Reboot history

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

A clean shutdown ends with systemd stopping units and messages like `Reached target ... Shutdown` or `System Power Off`. A crash ends mid-stream, often with nothing unusual at all, since the logs may not have been flushed. Check the hypervisor or cloud console for the host side of the story. More on filtering the journal in [journalctl by Time Range](/blog/journalctl-filter-time-range).

### Is it the service or the server?

`uptime` is OS uptime. A service can crash and restart without the server rebooting:

```bash
systemctl show nginx -p ActiveEnterTimestamp -p NRestarts
# ActiveEnterTimestamp=Tue 2026-10-28 02:14:07 UTC
# NRestarts=3
```

`NRestarts` (systemd 235+) counts automatic restarts by the unit's `Restart=` policy. See [Check Running Services with systemctl](/blog/linux-check-running-services-systemctl).

---

## `w`: uptime plus who's logged in

```bash
w
```

```
 09:15:42 up 14 days,  2:31,  3 users,  load average: 1.24, 0.87, 0.63
USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT
damon    pts/0    10.0.1.42        09:00    0.00s  0.10s  0.01s w
ops      pts/1    192.168.1.100    08:30    5:23   0.20s  0.00s -bash
deploy   pts/2    10.0.1.50        09:10    1.00s  2:10   2:09  npm run build
```

`IDLE` is time since the last keystroke. `JCPU` is CPU time used by all processes on that terminal; `PCPU` is CPU time used by the current process shown in `WHAT`. Both are cumulative CPU time, not percentages. Useful during an incident to see if someone else is already working on the box. For login history, see [Check Last Login Users](/blog/linux-check-last-login-users).

---

## Uptime in scripts

`/proc/uptime` holds two numbers in seconds: time since boot, and total idle time summed across all CPUs (so it can exceed the first number).

```bash
cat /proc/uptime
# 1218701.42 4790215.88
```

```bash
up=$(cut -d. -f1 /proc/uptime)
printf 'up %dd %dh %dm\n' $((up/86400)) $((up%86400/3600)) $((up%3600/60))
```

Alert if the machine booted in the last 10 minutes:

```bash
up=$(cut -d. -f1 /proc/uptime)
if [ "$up" -lt 600 ]; then
  echo "rebooted $((up / 60)) minutes ago (boot: $(uptime -s))"
fi
```

Load averages for scripts, without parsing `uptime`:

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

**What is a good load average for Linux?**
There's no fixed number. Compare it with the CPU count (`nproc`) and with this machine's normal level. Sustained load well above the CPU count deserves a look, but check whether it's CPU queueing or tasks blocked on I/O first.

**Why does uptime show more users than are logged in?**
It counts login sessions recorded in utmp, and each terminal, SSH session or multiplexer window can be one. Some sessions linger after a disconnect.

**How do I see uptime in seconds?**
`cut -d. -f1 /proc/uptime`.

---

*Related: [Linux Performance Troubleshooting](/blog/linux-performance-troubleshooting-guide) for what to do when that load average is too high.*
