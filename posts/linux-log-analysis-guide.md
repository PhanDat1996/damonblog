---
title: "Linux Log Analysis: System Logs, Root Cause and Last Logins"
date: "2026-04-21"
updated: "2026-11-02"
excerpt: "Where Linux logs live, how to read syslog, journald and kernel lines, the patterns behind OOM kills and failed units, and who logged in with last and lastb."
tags: ["linux", "logs", "troubleshooting", "debugging", "monitoring", "security"]
featured: false
category: "linux"
---

A server rebooted overnight, a process vanished without a stack trace, or a filesystem went read-only. The application log ends mid-sentence. The answer is almost always in the system logs, but only if you know which log, which time window, and which line pattern to look for.

This guide is about Linux **system** logs: journald, rsyslog files and the kernel. For a multi-service outage workflow, see [incident triage with logs](/blog/log-analysis-incident-triage). For attacker activity on Windows and web servers, see [security log analysis](/blog/log-analysis-security-windows-webserver).

---

## TL;DR

```bash
journalctl --list-boots                      # did the box reboot? when?
journalctl -b -1 -n 50 --no-pager            # last lines before the previous shutdown/crash
journalctl -b -p err --no-pager              # errors and worse, current boot
journalctl -k -b | grep -iE "oom|i/o error|segfault|blocked for more"
journalctl -u myapp --since "2026-10-28 02:00" --until "2026-10-28 02:30"
grep -E "Failed|Accepted" /var/log/auth.log  # Debian/Ubuntu; /var/log/secure on RHEL
```

---

## Where Linux logs live

On any systemd distribution, two logging paths usually run side by side:

```
 service stdout/stderr ─┐
 syslog() calls ────────┼──> systemd-journald ──> /var/log/journal/  (binary, journalctl)
 kernel (printk) ───────┘            │
                                     └──> rsyslog (if installed) ──> /var/log/syslog, auth.log, messages, secure
 apps with their own logger ─────────────────────────────────────> /var/log/nginx/, /var/log/myapp/ ...
```

| What | Debian / Ubuntu | RHEL / Rocky / Alma |
|---|---|---|
| General system messages | `/var/log/syslog` | `/var/log/messages` |
| Authentication (sshd, sudo, su) | `/var/log/auth.log` | `/var/log/secure` |
| Kernel | `/var/log/kern.log`, `journalctl -k` | `journalctl -k` (kernel lines also go to `messages`) |
| Package installs | `/var/log/apt/history.log`, `/var/log/dpkg.log` | `/var/log/dnf.log` |
| Audit (SELinux denials, auditd rules) | `/var/log/audit/audit.log` if auditd is installed | `/var/log/audit/audit.log` |
| Login records (binary) | `/var/log/wtmp`, `btmp`, `lastlog` | same |

Two traps:

- **No rsyslog, no text files.** Debian 12 and many minimal cloud images don't install rsyslog, so `/var/log/syslog` and `auth.log` simply don't exist. Everything is in the journal.
- **Volatile journal.** If `/var/log/journal/` doesn't exist, journald usually keeps logs only in `/run/log/journal/` (RAM) and they're lost on reboot. Check this *before* you need logs from a crash. The [journalctl time-range guide](/blog/monitor-real-time-logs-linux) covers making it persistent.

---

## Anatomy of a log line

You read faster when you know what every field is.

### Classic syslog line (rsyslog files)

```
Oct 28 02:14:07 web01 sshd[2817]: Failed password for invalid user admin from 203.0.113.45 port 52314 ssh2
└──── time ───┘ └host┘ └ident┘└pid┘ └──────────────────────── message ────────────────────────────────┘
```

- **Time** has no year and no timezone in the traditional format. It's the server's local time. Newer rsyslog configs may write ISO 8601 instead (`2026-10-28T02:14:07.512331+00:00`), which is far easier to sort and compare.
- **ident[pid]** is the program name and PID. The PID lets you follow one process across lines.
- **Message** is free text, and its format is entirely up to the program.

### journald entry

The default `journalctl` output looks like syslog, but every entry carries structured fields underneath. See them with `-o verbose`:

```bash
journalctl -u nginx -n 1 -o verbose
```

```
Tue 2026-10-28 02:14:07.512331 UTC [s=3f1c...;i=1a2b;b=8d4e...;m=...;t=...;x=...]
    PRIORITY=3
    SYSLOG_IDENTIFIER=nginx
    _PID=1187
    _UID=0
    _COMM=nginx
    _EXE=/usr/sbin/nginx
    _SYSTEMD_UNIT=nginx.service
    _BOOT_ID=8d4e...
    MESSAGE=nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)
```

Those fields are filters. Filtering on a field is more reliable than grepping text:

```bash
journalctl _SYSTEMD_UNIT=nginx.service      # same as -u nginx
journalctl _COMM=sshd                        # by process name
journalctl _PID=1187
journalctl -F _SYSTEMD_UNIT                  # list every unit that has logged anything
```

`PRIORITY` is the syslog severity: `0` emerg, `1` alert, `2` crit, `3` err, `4` warning, `5` notice, `6` info, `7` debug. `journalctl -p err` means "3 and below", so err, crit, alert and emerg.

> Priority is set by the program, not by the content. Many apps log everything to stdout, which journald stores as `info` (6). If `-p err` returns nothing for your app, that's probably why. Fall back to grep on the message.

### Kernel line

```
[183421.552310] Out of memory: Killed process 4521 (java) total-vm:8123456kB, anon-rss:6234112kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:12800kB oom_score_adj:0
```

The bracketed number is **seconds since boot**, not wall-clock time. `journalctl -k` and `dmesg -T` convert it to a date. `dmesg -T` can drift after suspend/resume, so prefer `journalctl -k` for exact times.

---

## Patterns that tell you what happened

These are the lines worth searching for first, because each one points at a specific cause.

| Pattern | Where | What it means |
|---|---|---|
| `Out of memory: Killed process 4521 (java)` | kernel | The global OOM killer picked this process. `anon-rss` is the memory it actually held. |
| `Memory cgroup out of memory: Killed process` | kernel | A container or a systemd unit with `MemoryMax=` hit **its own** limit. The host may have plenty of free RAM. |
| `segfault at 0 ip ... error 4 in myapp[...]` | kernel | The process read from an invalid address (`at 0` = null pointer). `error 6` would be a write. It's a crash in the program, not a system problem. |
| `I/O error, dev sda, sector 2048` | kernel | The disk or controller failed a request. Check `smartctl -a /dev/sda`. Repeated lines mean hardware. |
| `EXT4-fs error` / `Remounting filesystem read-only` | kernel | ext4 found corruption or an I/O failure and protected itself. Writes now fail with `EROFS`. Recovery steps: [read-only file system fix](/blog/linux-read-only-file-system-fix). |
| `INFO: task <name>:<pid> blocked for more than 120 seconds` | kernel | A task was stuck in D state (uninterruptible I/O) for 2 minutes. Usually slow or dead storage, or a hung NFS mount. |
| `<unit>: Main process exited, code=exited, status=1/FAILURE` | systemd | The service's own process exited with code 1. The reason is in the lines just **before** this one. |
| `<unit>: Main process exited, code=killed, status=9/KILL` | systemd | Something sent SIGKILL: the OOM killer, a stop timeout, or a person. Check the kernel log at the same second. |
| `<unit>: Start request repeated too quickly.` | systemd | The unit hit its start rate limit and systemd stopped trying. See [restart failures](/blog/systemctl-service-not-starting-fix). |
| `Failed password for <user> from <ip>` | sshd | Wrong password. `invalid user` in the line means the account doesn't exist at all. |
| `Accepted publickey for <user> from <ip>` | sshd | Successful login. This is the line that matters after a burst of failures. |

Find all of them at once for the current boot:

```bash
journalctl -b -k --no-pager | grep -E "Out of memory|cgroup out of memory|segfault|I/O error|Remounting filesystem read-only|blocked for more than"
```

If the OOM killer is involved, the [memory leak guide](/blog/linux-memory-leak-troubleshooting) explains how to tell a leak from an undersized limit. If you see `blocked for more than 120 seconds`, the [process states guide](/blog/linux-process-states-guide) covers D state.

---

## A workflow for "something happened on this server"

### 1. Pin the time, then check for a reboot

Get the time of the first symptom from monitoring or the user report. Then check whether the machine rebooted, because that changes which logs you need.

```bash
journalctl --list-boots --no-pager | tail -3
```

```
IDX BOOT ID                          FIRST ENTRY                 LAST ENTRY
 -1 8d4e2f0c5b6a4e1f9a3c7d2e1b0f6a5c Mon 2026-10-20 09:01:12 UTC Tue 2026-10-28 02:14:41 UTC
  0 1f6b3a9e0d7c4b2a8e5f1c3d9a7b6e2f Tue 2026-10-28 02:16:03 UTC Tue 2026-10-28 09:30:15 UTC
```

(Older systemd versions print the same columns without the header row.)

A new boot at 02:16 that nobody planned: read the end of the previous one.

```bash
journalctl -b -1 -n 80 --no-pager
```

- Ends with a clean `Reached target System Shutdown` / `Power-Off`: someone or something shut it down. Check `last -x shutdown reboot` and the auth log.
- Ends abruptly in the middle of normal messages: power loss, hypervisor reset, kernel panic or watchdog. A panic is often **not** in the journal because the disk was never written. Check the hypervisor console, IPMI/iLO event log, or kdump in `/var/crash/` if configured.

### 2. Errors in the window, all sources

```bash
journalctl -p warning --since "2026-10-28 01:50" --until "2026-10-28 02:20" --no-pager
```

Start wide (warning, all units), then narrow. A narrow filter too early hides the kernel line that explains the service failure.

### 3. Compare with a normal day

Many servers log the same harmless errors all day. Before you blame a message, check whether it was there yesterday:

```bash
journalctl -p err --since "yesterday 01:50" --until "yesterday 02:20" --no-pager | wc -l
journalctl -p err --since "today 01:50"     --until "today 02:20"     --no-pager | wc -l
```

The root cause is usually the first error that is **new**, not the first error in the window.

### 4. Drill into the unit and its flat-file logs

```bash
journalctl -u myapp --since "01:50" --until "02:20" --no-pager
grep -n "2026-10-28 02:1" /var/log/myapp/app.log | head
```

Use the timestamp format the file actually uses. NGINX error logs use `2026/10/28 02:14:07`, access logs use `[28/Oct/2026:02:14:07 +0000]`.

### 5. Don't forget rotated and compressed files

logrotate renames `app.log` to `app.log.1` and later `app.log.2.gz`. If the event is a few days old, it's probably not in the current file.

```bash
ls -la /var/log/myapp/
zgrep -h "OutOfMemory" /var/log/myapp/app.log*      # zgrep reads plain and .gz files
```

---

## Counting and grouping

Once you know what you're looking for, you usually want "how many, from where, since when".

```bash
# Errors per minute (lines starting with "2026-10-28 02:14:07 ...")
grep "ERROR" /var/log/myapp/app.log | cut -c1-16 | uniq -c

# Top error messages with IDs and IPs normalized so duplicates group together
grep "ERROR" /var/log/myapp/app.log \
  | sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<uuid>/g; s/([0-9]{1,3}\.){3}[0-9]{1,3}/<ip>/g; s/[0-9]+/<n>/g' \
  | sort | uniq -c | sort -rn | head -20

# Which units logged errors this boot (strip the [pid] so one service = one row)
journalctl -b -p err -o json --no-pager | jq -r '._SYSTEMD_UNIT // .SYSLOG_IDENTIFIER' | sort | uniq -c | sort -rn

# Failed SSH logins by source IP
grep "Failed password" /var/log/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn | head
```

More grep patterns, including context lines and searching compressed logs, are in [grep for log searching](/blog/linux-find-file-by-name-and-size).

---

## Check last logins: last, lastb, lastlog, who

Something changed on the server overnight and nobody admits to it, or you saw a login alert from an IP you don't recognize. First question: who logged in, from where, and when?

```bash
last -Fi | head -20      # recent logins and logouts, full timestamps, IPs   (/var/log/wtmp)
sudo lastb -Fi | head    # recent FAILED login attempts, root needed       (/var/log/btmp)
lastlog                  # most recent login per account                   (/var/log/lastlog)
who                      # who is logged in right now
w                        # ... and what they're running
```

### `last`: login and logout history

```
deploy   pts/1        198.51.100.23    Tue Oct 28 03:12:44 2026 - Tue Oct 28 03:19:02 2026  (00:06)
damon    pts/0        10.0.1.42        Mon Oct 27 09:15:10 2026   still logged in
ops      pts/1        10.0.1.50        Sun Oct 26 14:00:12 2026 - crash                     (03:10)
reboot   system boot  0.0.0.0          Sun Oct 26 17:11:30 2026   still running

wtmp begins Wed Oct  1 00:00:04 2026
```

`pts/N` is SSH or a terminal emulator, `tty1` the local console, `0.0.0.0` a local or boot record. `reboot` lines are boots, not users. The end column matters:

| Shows | Meaning |
|---|---|
| `still logged in` | Session is open now |
| `- 03:19 (00:06)` | Normal logout |
| `gone - no logout` | Session ended without a logout record (connection dropped, process killed) |
| `down` | System was shut down while the user was logged in |
| `crash` | No clean shutdown was recorded before the next boot |

```bash
last deploy                                       # one user
last -x reboot shutdown                           # boots and shutdowns
last -i -s "2026-10-27" -t "2026-10-28 06:00"     # time window
last -f /var/log/wtmp.1                           # the previous (rotated) file
```

`wtmp begins ...` is how far back the file goes. It's usually rotated monthly, keeping one old copy, so `last` alone covers roughly one to two months.

### `lastb`: failed logins and brute force

`ssh:notty` in `lastb` output means the attempt came over SSH and never got a terminal, which is normal for failed SSH logins.

```bash
sudo lastb -i | awk 'NF > 3 {print $3}' | sort | uniq -c | sort -rn | head    # by source IP
sudo lastb    | awk 'NF > 3 {print $1}' | sort | uniq -c | sort -rn | head    # by username

IP=203.0.113.45
sudo lastb -i | grep -c "$IP"         # failed attempts
last -i | grep "$IP"                  # any success from the same address?
```

Hundreds of failures against `root`, `admin`, `test` are background noise on any server with port 22 open. They matter when the usernames are **your** real account names, or when a failure burst is followed by a **successful** login from the same IP.

### `lastlog`, `who` and `w`

```bash
lastlog -t 7          # accounts that logged in during the last 7 days
lastlog -b 90         # accounts with no login in the last 90 days (candidates to lock)
who -b                # time of last boot
w                     # idle time, load, and the command each session is running
```

A service account like `postgres` or `www-data` with a recent login is a red flag: those accounts shouldn't have interactive sessions. `/var/log/lastlog` is a sparse file indexed by UID; `ls -l` can show it as gigabytes, `du -h` shows its real size. Don't delete it.

### What these tools don't show

- **`su` and `sudo` aren't logins.** They don't appear in `last`. They're in the auth log or the journal.
- **Not every SSH session creates a wtmp entry.** Commands run over SSH without a terminal may not show up in `last`.
- **root can edit these files.** Compare with the journal or a remote log copy before trusting `last` as evidence.

The authoritative record of SSH authentication is sshd's own log:

```bash
grep -E "Accepted|Failed password|Invalid user" /var/log/auth.log | tail -50    # /var/log/secure on RHEL
journalctl -u ssh -u sshd --since "7 days ago" --grep "Accepted|Failed|Invalid user" --no-pager
```

`Accepted publickey for deploy ... ED25519 SHA256:Qm9v...` tells you more than `last` does: the **method** and the key fingerprint, which you can match against `~deploy/.ssh/authorized_keys` with `ssh-keygen -lf`.

Newer distributions are replacing wtmp and lastlog (32-bit timestamps, overflow in 2038) with `wtmpdb` (read with `wtmpdb last`) and `lastlog2`. If `last` or `lastlog` is missing or empty on a recent system, check for those. The sshd log in the journal works the same everywhere.

---

## Quick checklist

1. Write down the time of the first symptom and the server's timezone (`timedatectl`).
2. `journalctl --list-boots`: did it reboot? If yes, read the end of `-b -1`.
3. `journalctl -p warning` across **all** units for the window, kernel included.
4. Compare against the same window on a normal day; chase what's new.
5. Read the lines right before each `Failed`/`exited` line. That's where the cause is.
6. Check rotated `.1` and `.gz` files if the event is older than the current log.
7. Unexplained change? `last -Fi`, `sudo lastb` and the sshd log: who was on the box, and how.

---

*Related: [Monitor Linux logs](/blog/monitor-real-time-logs-linux) for precise journalctl time windows and watching a problem as it happens, and [disk full cleanup](/blog/check-disk-usage-linux-du-df) when logs themselves are what filled the disk.*
