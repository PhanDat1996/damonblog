---
title: "Linux Check Last Login Users: last, lastlog, who"
date: "2026-04-22"
excerpt: "Check last login history in Linux using last, lastlog, and who — find recent logins, failed attempts, and suspicious access patterns for security audits."
tags: ["linux", "security", "troubleshooting", "infrastructure"]
featured: false
slug: "linux-check-last-login-users-command"
category: "linux"
---

Security audit, suspicious activity, or just tracking who's been on the server — Linux keeps a detailed login history. Here's how to read it.

---

## TL;DR

```bash
last                    # login/logout history for all users
last -n 20              # last 20 entries
lastlog                 # last login time for every account
who                     # who is currently logged in
last -F | grep "still"  # currently active sessions with full timestamps
```

---

## last: Login History

`last` reads from `/var/log/wtmp` — a binary log of all logins and logouts.

```bash
last
```

```
damon    pts/0        10.0.1.42        Mon Apr 22 09:15   still logged in
ops      pts/1        192.168.1.100    Mon Apr 22 08:30 - 09:00  (00:30)
deploy   pts/2        10.0.1.50        Sun Apr 21 22:15 - 23:45  (01:30)
damon    pts/0        10.0.1.42        Sun Apr 21 14:00 - 18:22  (04:22)
reboot   system boot  5.15.0-91        Mon Apr  8 06:44   still running
```

Columns:
- **Username** — who logged in
- **Terminal** — `pts/0` = SSH/remote, `tty1` = physical console
- **From** — source IP address
- **Login time** — when the session started
- **Duration/Status** — `still logged in`, time range, or `gone - no logout`

---

## last: Useful Filters

```bash
# Last 20 entries
last -n 20

# Specific user
last damon

# With full timestamps (no date truncation)
last -F

# Show IP addresses (not hostnames)
last -i

# Show reboots only
last reboot

# Show specific terminal
last pts/0

# Filter by date range (last 7 days)
last --since -7days --until today
```

---

## lastb: Failed Login Attempts

`lastb` reads from `/var/log/btmp` — failed authentication attempts:

```bash
sudo lastb
```

```
root     ssh:notty    1.2.3.4          Mon Apr 22 03:12 - 03:12  (00:00)
root     ssh:notty    5.6.7.8          Mon Apr 22 03:11 - 03:11  (00:00)
admin    ssh:notty    1.2.3.4          Mon Apr 22 03:11 - 03:11  (00:00)
```

This is where brute force attempts show up. Hundreds of failed root logins from a single IP = someone scanning for weak passwords.

```bash
# Count failed attempts by source IP
sudo lastb -i | awk '{print $3}' | sort | uniq -c | sort -rn | head -10

# Count failed attempts by username
sudo lastb | awk '{print $1}' | sort | uniq -c | sort -rn | head -10
```

---

## lastlog: Last Login for Every Account

```bash
lastlog
```

```
Username         Port     From             Latest
root             pts/0    192.168.1.1      Mon Apr 22 09:00:12 +0000 2026
bin              **Never logged in**
daemon           **Never logged in**
damon            pts/1    10.0.1.42        Mon Apr 22 08:30:05 +0000 2026
postgres         **Never logged in**
```

Useful for finding accounts that have never logged in (possible unused accounts to disable) or accounts with old last logins.

```bash
# Find accounts with recent logins
lastlog | grep -v "Never logged in" | grep -v "^Username"

# Find unused accounts (never logged in)
lastlog | grep "Never logged in" | awk '{print $1}'
```

---

## who: Current Sessions

```bash
who
```

```
damon    pts/0        2026-04-22 09:15 (10.0.1.42)
ops      pts/1        2026-04-22 08:30 (192.168.1.100)
```

```bash
# Who + what they're doing
w

# who am I (current session info)
who am i
whoami         # just the username
```

---

## Real Examples

### Security audit: recent logins from external IPs

```bash
# Logins from outside your internal network
last -i -n 100 | awk '$3 !~ /^10\.|^192\.168\.|^172\.|localhost/ && $3 ~ /[0-9]/ {print}'
```

### Find suspicious login patterns

```bash
# Multiple logins in a short window (possible credential spray)
last -F | awk '{print $4}' | sort | uniq -c | sort -rn | head -20

# Logins at unusual hours (e.g., 2am-5am)
last -F | awk '{if ($5 >= "02:00" && $5 <= "05:00") print}' | head -20
```

### Find active sessions right now

```bash
# Currently logged in users with their source
last -F | grep "still logged in"

# Or use who
who -a
```

### Check if root logged in directly (should be disabled)

```bash
last root | head -10
# If you see recent entries: root should only login via su/sudo, not SSH
```

---

## Common Mistakes

**Mistake 1: Trusting `last` without checking log rotation**
`last` reads `/var/log/wtmp`. If that file was deleted or rotated, history is gone.

```bash
ls -la /var/log/wtmp*
# Check if rotated copies exist
```

**Mistake 2: Not using `sudo` with `lastb`**
`lastb` needs root to read `/var/log/btmp`:

```bash
sudo lastb
```

**Mistake 3: Relying solely on `last` for security audits**
`last` only shows successful logins. Always check `lastb` for failed attempts and `/var/log/auth.log` (Ubuntu) or `/var/log/secure` (RHEL) for the full picture.

```bash
# Complete login audit
grep "Accepted\|Failed" /var/log/auth.log | tail -50      # Ubuntu
grep "Accepted\|Failed" /var/log/secure | tail -50         # RHEL
```

**Mistake 4: Missing PAM-authenticated logins**
`last` doesn't capture logins through PAM for non-SSH applications (database clients, application logins). Those go to auth.log.

---

## Pro Tips

```bash
# Parse logins by hour of day (find unusual patterns)
last -F | awk 'NF>8 {print $5}' | cut -d: -f1 | sort | uniq -c | sort -n

# Export login history to CSV
last -F -i | awk '{print $1","$3","$4" "$5","$7" "$8}' > /tmp/logins.csv

# Watch for new logins in real time
tail -f /var/log/auth.log | grep "Accepted"

# Find all logins from a specific IP
last -i | grep "192.168.1.100"

# Count login duration by user
last | awk '!/reboot|wtmp/ && NF>4 {
  split($NF, t, ":")
  hrs = t[1]*60 + t[2]
  user[$1] += hrs
} END {for (u in user) print user[u], u}' | sort -rn | head
```

---

## Conclusion

`last` for history, `lastb` for failed attempts, `who` for current sessions, `lastlog` for per-account last login. For security auditing, always check `lastb` — the failed login log — alongside successful logins. Hundreds of failed root attempts from external IPs means brute force in progress; your first action is to check if any succeeded.

---

*Related: [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — correlate login events with application logs. [CIS RHEL Level 1 Hardening](/blog/cis-rhel-level1-hardening) — SSH hardening to reduce unauthorized login attempts.*
