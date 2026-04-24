---
title: "journalctl Filter by Time Range: Real Examples"
date: "2026-04-22"
excerpt: "Filter journalctl output by time range, unit, priority, and keyword — with real command examples for production incident investigation and log triage."
tags: ["linux", "logs", "troubleshooting", "debugging"]
featured: false
slug: "journalctl-filter-time-range-guide"
category: "devops"
---

# journalctl Filter by Time Range: Real Examples

When debugging a production incident, you need logs from a specific window — not everything since boot. `journalctl` has precise time filtering built in. Here's exactly how to use it.

---

## TL;DR

```bash
# Last hour
journalctl --since "1 hour ago"

# Specific window
journalctl --since "2026-04-20 14:00:00" --until "2026-04-20 14:30:00"

# Service in time range
journalctl -u nginx --since "10 minutes ago"

# Errors only, last hour
journalctl -p err --since "1 hour ago"
```

---

## --since and --until Syntax

`journalctl` accepts both absolute timestamps and relative expressions.

### Absolute timestamps

```bash
# ISO format — most precise
journalctl --since "2026-04-20 14:22:00"
journalctl --since "2026-04-20 14:22:00" --until "2026-04-20 14:35:00"

# Date only (from midnight)
journalctl --since "2026-04-20"

# Yesterday
journalctl --since "yesterday"

# Today
journalctl --since "today"
```

### Relative expressions

```bash
journalctl --since "1 hour ago"
journalctl --since "30 minutes ago"
journalctl --since "2 days ago"
journalctl --since "1 week ago"
```

Both `--since` and `--until` work together or independently.

---

## Filter by Service Unit

```bash
# Single service
journalctl -u nginx
journalctl -u postgresql

# Multiple services at once
journalctl -u nginx -u php-fpm

# Service + time range
journalctl -u nginx --since "14:00" --until "14:30"
```

If you don't know the exact unit name:

```bash
systemctl list-units | grep -i nginx
```

---

## Filter by Priority (Severity)

```bash
# Errors and above only
journalctl -p err

# Warning and above
journalctl -p warning

# Priority levels (0=emerg to 7=debug):
# emerg, alert, crit, err, warning, notice, info, debug

# Errors from nginx in the last hour
journalctl -u nginx -p err --since "1 hour ago"
```

---

## Real Examples

### Find when a service crashed

```bash
# Get the last crash time
journalctl -u myapp --since "today" | grep -iE "killed|crashed|error|failed" | tail -10

# Get logs 5 minutes before the crash
journalctl -u myapp --since "14:20:00" --until "14:25:00"
```

### Correlate events across services in a 5-minute window

```bash
# All service errors in a specific window
journalctl -p err --since "14:20:00" --until "14:25:00" --no-pager
```

This gives you a chronological view of what broke across all services. The first error in the list is typically the root cause.

### Find OOM kills

```bash
# OOM killer events
journalctl -k --since "1 hour ago" | grep -i "oom\|killed\|out of memory"
# -k = kernel messages only
```

### Check logs from a previous boot (after a crash)

```bash
# List all boots
journalctl --list-boots

# Output:
# -2  abc123  Mon 2026-04-20 09:00 — Mon 2026-04-20 14:22 (crash)
# -1  def456  Mon 2026-04-20 14:30 — Tue 2026-04-21 08:00
#  0  ghi789  Tue 2026-04-21 08:00 — now

# Get logs from the boot before last
journalctl -b -1 -u myapp | tail -50

# Get errors from two boots ago
journalctl -b -2 -p err | tail -30
```

### Follow logs live with a time anchor

```bash
# Start from 30 minutes ago, then follow live
journalctl -u nginx --since "30 minutes ago" -f
```

---

## Output Explanation

Default journalctl output:

```
Apr 20 14:22:03 web01 nginx[1234]: 2026/04/20 14:22:03 [error] 1234#1234: *18423 connect() failed
Apr 20 14:22:03 web01 systemd[1]: nginx.service: Main process exited, code=killed
Apr 20 14:22:04 web01 systemd[1]: nginx.service: Failed with result 'signal'.
```

- `Apr 20 14:22:03` — timestamp (journal time, not log time)
- `web01` — hostname
- `nginx[1234]` — process name and PID
- rest — the actual log message

---

## Useful Output Flags

```bash
# No pager (pipe directly to grep or less)
journalctl --no-pager

# Short output (default)
journalctl -u nginx --no-pager | tail -50

# JSON output (for scripting)
journalctl -u nginx --output=json | jq '.MESSAGE'

# Show only the message field
journalctl -u nginx --output=cat

# With timestamps in UTC
journalctl --utc --since "1 hour ago"
```

---

## Common Mistakes

**Mistake 1: Time format causing "Failed to parse timestamp"**

```bash
# WRONG
journalctl --since "20/04/2026 14:00"

# CORRECT
journalctl --since "2026-04-20 14:00:00"
```

**Mistake 2: Forgetting the journal isn't always persistent**
By default on some systems, the journal lives in memory and is lost on reboot. Check:

```bash
ls /var/log/journal    # if this exists, journal is persistent
ls /run/log/journal    # if only this exists, it's volatile
```

To make it persistent:
```bash
mkdir -p /var/log/journal
systemctl restart systemd-journald
```

**Mistake 3: Missing logs because of journal size limits**
If `journalctl --since "7 days ago"` shows nothing before 2 days ago, the journal has been rotated.

```bash
journalctl --disk-usage     # check current usage
cat /etc/systemd/journald.conf | grep -E "SystemMax|SystemKeep"
```

---

## Pro Tips

```bash
# Count errors per hour (pattern analysis)
journalctl -u myapp --since "today" -p err --output=cat \
  | awk '{print substr($0,1,13)}' | sort | uniq -c

# Export logs for sharing
journalctl -u myapp --since "14:00" --until "15:00" --no-pager > /tmp/incident_logs.txt

# Find which unit logged the most errors today
journalctl -p err --since "today" --output=json \
  | jq '._SYSTEMD_UNIT' | sort | uniq -c | sort -rn | head -10

# Watch a service log with highlighting
journalctl -fu nginx | grep --color=always -E "error|warn|$"
```

---

## Conclusion

The workflow for any incident: anchor to a timestamp, filter by service and priority, then expand the window if needed. `--since` and `--until` with ISO timestamps give you precision. `-p err` cuts out noise. `-b -1` gets you logs from a crashed boot.

---

*Related: [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — full log triage workflow including grep patterns. [Reading Logs Like a Detective](/blog/log-analysis-incident-triage) — how to correlate logs across services during an incident.*
