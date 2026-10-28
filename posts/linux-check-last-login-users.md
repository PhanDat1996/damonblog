---
title: "Check Last Login on Linux: last, lastb, lastlog and who"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "See who logged in to a Linux server, from where and when: read last, lastb and lastlog output correctly, spot brute force, and know what these logs miss."
tags: ["linux", "security", "troubleshooting", "infrastructure"]
featured: false
category: "linux"
---

Something changed on the server overnight and nobody admits to it. Or you saw a login alert from an IP you don't recognize. First question: who logged in, from where, and when?

```bash
last -Fi | head -20      # recent logins and logouts, full timestamps, IPs
sudo lastb -Fi | head    # recent FAILED login attempts (root needed)
lastlog                  # most recent login per account
who                      # who is logged in right now
w                        # ... and what they're running
```

Each reads a different file, and each has blind spots. Both matter when you're relying on them for a security question.

---

## `last`: login and logout history

`last` reads `/var/log/wtmp`, a binary file that records every session start and end, plus reboots.

```bash
last -Fi
```

```
deploy   pts/1        198.51.100.23    Tue Oct 28 03:12:44 2026 - Tue Oct 28 03:19:02 2026  (00:06)
damon    pts/0        10.0.1.42        Mon Oct 27 09:15:10 2026   still logged in
ops      pts/2        10.0.1.50        Sun Oct 26 22:15:03 2026 - Sun Oct 26 23:45:40 2026  (01:30)
ops      pts/1        10.0.1.50        Sun Oct 26 14:00:12 2026 - crash                     (03:10)
reboot   system boot  0.0.0.0          Sun Oct 26 17:11:30 2026   still running

wtmp begins Wed Oct  1 00:00:04 2026
```

| Column | Meaning |
|---|---|
| User | Account that logged in. `reboot` lines are boots, not users. |
| Terminal | `pts/N` = pseudo-terminal (SSH or a terminal emulator), `tty1` = local console |
| Host | Source address. With `-i` it's an IP; `0.0.0.0` means local (console or boot record). |
| Times | Login, logout, and duration in `(hh:mm)` or `(days+hh:mm)` |

The end column matters:

| Shows | Meaning |
|---|---|
| `still logged in` | Session is open now |
| `- 03:19 (00:06)` | Normal logout |
| `gone - no logout` | Session ended without a logout record (connection dropped, process killed) |
| `down` | System was shut down while the user was logged in |
| `crash` | No clean shutdown was recorded before the next boot |

The last line, `wtmp begins ...`, is how far back this file goes. Anything older is in a rotated file or gone.

### Useful options

```bash
last -n 20                        # last 20 entries
last deploy                       # one user
last -x reboot shutdown           # boots and shutdowns (-x adds shutdown/runlevel records)
last -i -s "2026-10-27" -t "2026-10-28 06:00"     # time window
last -s -7days                    # last 7 days
last -f /var/log/wtmp.1           # the previous (rotated) file
```

`wtmp` is usually rotated monthly by logrotate, keeping one old copy. So `last` alone covers roughly one to two months.

---

## `lastb`: failed logins

`lastb` reads `/var/log/btmp`, which records failed login attempts. It's readable only by root.

```bash
sudo lastb -Fi | head
```

```
root     ssh:notty    203.0.113.45     Tue Oct 28 03:11:52 2026 - Tue Oct 28 03:11:52 2026  (00:00)
admin    ssh:notty    203.0.113.45     Tue Oct 28 03:11:50 2026 - Tue Oct 28 03:11:50 2026  (00:00)
deploy   ssh:notty    203.0.113.45     Tue Oct 28 03:11:47 2026 - Tue Oct 28 03:11:47 2026  (00:00)
```

`ssh:notty` means the attempt came over SSH and never got a terminal, which is normal for failed SSH logins.

Who's trying, and which accounts:

```bash
sudo lastb -i | awk 'NF > 3 {print $3}' | sort | uniq -c | sort -rn | head    # by source IP
sudo lastb    | awk 'NF > 3 {print $1}' | sort | uniq -c | sort -rn | head    # by username
```

Hundreds of failures from internet IPs against `root`, `admin`, `test` are background noise on any server with port 22 open. They matter when:

- the usernames are **your** real account names (targeted, not random), or
- a failure burst from an IP is followed by a **successful** login from the same IP in `last`.

```bash
IP=203.0.113.45
sudo lastb -i | grep -c "$IP"         # failed attempts
last -i | grep "$IP"                  # any success from the same address?
```

If `btmp` is empty but you know there were attempts, it may be rotated, or failures may not be recorded there for every authentication method. The auth log is the complete record (below).

---

## `lastlog`: most recent login per account

`lastlog` reads `/var/log/lastlog` and shows one line per account in `/etc/passwd`:

```
Username         Port     From             Latest
root             pts/0    10.0.1.42        Mon Oct 27 08:02:11 +0000 2026
daemon                                     **Never logged in**
deploy           pts/1    198.51.100.23    Tue Oct 28 03:12:44 +0000 2026
postgres                                   **Never logged in**
```

```bash
lastlog -t 7          # accounts that logged in during the last 7 days
lastlog -b 90         # accounts with no login in the last 90 days (candidates to lock)
lastlog -u deploy     # one account
```

A service account like `postgres` or `www-data` with a recent login is a red flag: those accounts shouldn't have interactive sessions.

`/var/log/lastlog` is a sparse file indexed by UID. `ls -l` can show it as gigabytes on systems with high UIDs; `du -h` shows its real size. That's normal, don't delete it.

---

## `who` and `w`: right now

```bash
who
```

```
damon    pts/0        2026-10-28 09:15 (10.0.1.42)
deploy   pts/1        2026-10-28 09:20 (198.51.100.23)
```

```bash
w           # adds idle time, load, and the command each session is running
who -b      # time of last boot
who -a      # everything, including dead processes and run level
```

`w` is the one to use when you're worried someone is on the box now: it shows what they're doing.

---

## What these tools don't show

This is where investigations go wrong.

- **`su` and `sudo` aren't logins.** They don't appear in `last`. They're in the auth log (`/var/log/auth.log` on Debian/Ubuntu, `/var/log/secure` on RHEL) or the journal.
- **Not every SSH session creates a wtmp entry.** Commands run over SSH without a terminal (scripts, automation) may not show up in `last`. sshd logs every accepted login regardless.
- **Web and database logins** never touch wtmp.
- **root can edit these files.** An attacker with root can remove their lines. Compare with the journal or a remote log copy before trusting `last` as evidence.

The authoritative record of SSH authentication is sshd's own log:

```bash
# Files (rsyslog)
grep -E "Accepted|Failed password|Invalid user" /var/log/auth.log | tail -50    # Debian/Ubuntu
grep -E "Accepted|Failed password|Invalid user" /var/log/secure   | tail -50    # RHEL

# Journal (works even without rsyslog). Unit is ssh on Debian/Ubuntu, sshd on RHEL
journalctl -u ssh -u sshd --since "7 days ago" --grep "Accepted|Failed|Invalid user" --no-pager
```

```
Oct 28 03:12:44 web01 sshd[8812]: Accepted publickey for deploy from 198.51.100.23 port 51022 ssh2: ED25519 SHA256:Qm9v...
```

That line tells you more than `last` does: the **method** (`publickey` vs `password`) and the key fingerprint, which you can match against `~deploy/.ssh/authorized_keys` with `ssh-keygen -lf`.

To read wtmp as text (for diffing or archiving), use `utmpdump /var/log/wtmp`.

---

## Quick security review

```bash
# Logins from outside private ranges, last 100 entries
last -Fi -n 100 | awk '$1 != "reboot" && $1 != "wtmp" && NF > 3 &&
  $3 !~ /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|0\.0\.0\.0)/'

# Logins between 00:00 and 05:59
last -Fi | awk '$1 != "reboot" && NF > 7 {h = substr($7, 1, 2); if (h < "06") print}'

# Direct root logins (should normally be none over SSH)
last -i root | head
grep "Accepted .* for root" /var/log/auth.log
```

If root can log in directly over SSH, set `PermitRootLogin no` (or `prohibit-password`) in `sshd_config`. The [CIS Ubuntu hardening guide](/blog/cis-level1-ubuntu-hardening) covers the related SSH settings.

---

## Newer distributions: wtmpdb and lastlog2

The classic wtmp, btmp and lastlog formats use 32-bit timestamps that overflow in 2038. Some newer distributions are replacing them with `wtmpdb` (an SQLite-based wtmp, read with `wtmpdb last`) and `lastlog2`. If `last` or `lastlog` is missing or returns nothing on a recent system, check whether those are installed. The sshd log in the journal works the same everywhere.

---

## FAQ

**How do I see failed login attempts on Linux?**
`sudo lastb` reads `/var/log/btmp`. For full detail, including invalid usernames and the auth method, check `/var/log/auth.log` (Debian/Ubuntu), `/var/log/secure` (RHEL), or `journalctl -u ssh -u sshd --grep Failed`.

**What does "gone - no logout" mean in `last`?**
The session ended without a logout record, usually because the network connection dropped or the session process was killed.

**Why doesn't `last` show older logins?**
`/var/log/wtmp` is rotated, typically monthly. Read the previous file with `last -f /var/log/wtmp.1`.

---

*Related: [security log analysis](/blog/log-analysis-security-windows-webserver) for tracing what happened after a suspicious login, and [grep for log searching](/blog/search-text-in-files-linux-grep) for digging through rotated auth logs.*
