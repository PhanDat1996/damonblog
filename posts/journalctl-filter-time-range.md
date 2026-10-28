---
title: "journalctl --since and --until: Filter Logs by Time"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Pull journal logs for an exact window: --since/--until formats that parse, -b for boots, -p levels, output modes, and why older logs may be missing."
tags: ["linux", "logs", "troubleshooting", "debugging"]
featured: false
noindex: true
category: "devops"
---

The incident was at 14:22. You want the journal from 14:15 to 14:35, not 40,000 lines since boot. `journalctl` can do this precisely, but it's picky about time formats, and it can silently return nothing when the logs you want were never kept.

---

## TL;DR

```bash
journalctl --since "2026-10-28 14:15" --until "2026-10-28 14:35"   # exact window
journalctl -u nginx --since "1 hour ago"                            # one unit, relative
journalctl --since today -p err                                     # errors since midnight
journalctl --since "14:15" --until "14:35"                          # today, by clock time
journalctl -b -1 -p warning                                         # previous boot, warning and worse
journalctl -S -30min -U -10min                                      # short forms, relative to now
```

---

## Time formats `--since` / `--until` accept

`--since` (`-S`) and `--until` (`-U`) use the systemd time syntax (`man systemd.time`):

| You write | Means |
|---|---|
| `"2026-10-28 14:15:00"` | Exact time, local timezone |
| `"2026-10-28 14:15"` | Seconds default to `:00` |
| `"2026-10-28"` | Midnight at the start of that day |
| `"14:15"` | 14:15 **today** |
| `today`, `yesterday`, `now` | Midnight today, midnight yesterday, current time |
| `"1 hour ago"`, `"30 min ago"`, `"2 days ago"` | Relative to now |
| `-30min`, `-2h`, `-1d` | Same, compact form |
| `"2026-10-28 14:15 UTC"` | Explicit timezone (UTC, or a zone like `Europe/Berlin`) |
| `@1793197800` | Unix epoch seconds (here: 2026-10-28 14:30 UTC) |

What fails:

```bash
journalctl --since "28/10/2026 14:15"
# Failed to parse timestamp: 28/10/2026 14:15
journalctl --since "Oct 28 14:15"
# Failed to parse timestamp: Oct 28 14:15
```

Day-first dates and syslog-style "Oct 28" aren't accepted. Use `YYYY-MM-DD`.

**Timezones bite during incidents.** Without a zone, times are interpreted in the server's local timezone. If your alert says 14:22 UTC and the server runs `Asia/Ho_Chi_Minh`, either convert or say so explicitly:

```bash
journalctl --since "2026-10-28 14:15 UTC" --until "2026-10-28 14:35 UTC" --utc
```

`--utc` changes how timestamps are **displayed**. The `UTC` suffix changes how your input is **interpreted**. You usually want both.

---

## Combine time with other filters

Filters stack. Use time plus one or two others to get a short, relevant result:

```bash
journalctl -u myapp -u nginx --since "14:15" --until "14:35"     # several units
journalctl -k --since "14:15"                                     # kernel only
journalctl _COMM=sshd --since today                               # by process name
journalctl _PID=4521 --since "1 hour ago"                         # by PID
journalctl --since "14:15" --grep "timeout|refused"               # regex on message (systemd 237+)
```

Don't know the unit name? List what has actually logged:

```bash
journalctl -F _SYSTEMD_UNIT | grep -i postgres
```

### Priority levels with `-p`

| Number | Name |
|---|---|
| 0 | `emerg` |
| 1 | `alert` |
| 2 | `crit` |
| 3 | `err` |
| 4 | `warning` |
| 5 | `notice` |
| 6 | `info` |
| 7 | `debug` |

`-p err` means **err and everything more severe** (0 to 3). You can use the name or the number: `-p 3` is the same.

The priority is whatever the program assigned. A service that just prints to stdout gets `info` (6) for every line, including its errors. If `-p err` is empty for your app but you know it failed, drop `-p` and use `--grep`.

---

## Boots: `-b` and `--list-boots`

After a crash or unexpected reboot, filter by boot instead of guessing times:

```bash
journalctl --list-boots
```

```
IDX BOOT ID                          FIRST ENTRY                 LAST ENTRY
 -2 3a7f0c1e9b2d4f6a8c5e7b1d3f9a2c4e Fri 2026-10-17 08:02:11 UTC Mon 2026-10-20 09:00:37 UTC
 -1 8d4e2f0c5b6a4e1f9a3c7d2e1b0f6a5c Mon 2026-10-20 09:01:12 UTC Tue 2026-10-28 02:14:41 UTC
  0 1f6b3a9e0d7c4b2a8e5f1c3d9a7b6e2f Tue 2026-10-28 02:16:03 UTC Tue 2026-10-28 09:30:15 UTC
```

(Older systemd versions print the same data without the header.)

```bash
journalctl -b                      # current boot
journalctl -b -1 -n 100            # last 100 lines of the previous boot: how did it end?
journalctl -b -1 -p err            # errors during the previous boot
journalctl -b 8d4e2f0c5b6a4e1f9a3c7d2e1b0f6a5c -u myapp
```

`-b -1` only works if the journal is **persistent** (next section). On a volatile journal, `--list-boots` shows only the current boot.

---

## Output formats with `-o`

| Option | Use |
|---|---|
| `short` (default) | Syslog-like: `Oct 28 14:22:03 web01 myapp[4521]: message` |
| `short-iso` | ISO 8601 timestamps, easy to sort and compare across hosts |
| `short-precise` | Microseconds, for ordering events within the same second |
| `short-monotonic` | Seconds since boot, matching kernel/dmesg timestamps |
| `with-unit` | Shows the unit name instead of the process name (systemd 236+) |
| `cat` | Message only, no metadata |
| `verbose` | Every field of every entry (great for finding filterable fields) |
| `json` / `json-pretty` | For `jq` and scripts |

Add `--no-pager` when you redirect output or in scripts where a pager would get in the way. When output goes to a pipe or file, journalctl doesn't page anyway.

Example output in the default format:

```
Oct 28 14:22:03 web01 myapp[4521]: ERROR could not acquire DB connection within 5000ms
Oct 28 14:22:04 web01 systemd[1]: myapp.service: Main process exited, code=exited, status=1/FAILURE
Oct 28 14:22:04 web01 systemd[1]: myapp.service: Failed with result 'exit-code'.
```

- `Oct 28 14:22:03`: when journald received the entry, in local time
- `web01`: hostname
- `myapp[4521]`: syslog identifier and PID (`systemd[1]` lines are systemd itself talking about your unit)
- the rest: the message

---

## Why logs from last week aren't there

### The journal may be volatile

journald's default `Storage=auto` writes to disk only if `/var/log/journal/` exists. Otherwise it keeps logs in `/run/log/journal/`, in RAM, and they're gone at reboot. Distributions differ on whether that directory is created at install time.

```bash
ls -d /var/log/journal /run/log/journal 2>/dev/null
journalctl --header | grep -i "file path"     # shows which journal files are in use
```

Make it persistent:

```bash
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal   # correct owner, group and ACLs
sudo systemctl restart systemd-journald
```

Or set it explicitly in a drop-in, which documents the intent:

```ini
# /etc/systemd/journald.conf.d/persistent.conf
[Journal]
Storage=persistent
```

### The journal hit its size limit

Old entries are deleted to stay within limits. The defaults: the journal may use up to **10% of the filesystem** (`SystemMaxUse=`), capped at 4 GB, and must leave **15% free** (`SystemKeepFree=`), also capped at 4 GB, whichever is stricter.

```bash
journalctl --disk-usage
journalctl --list-boots | head -2            # how far back does it go?
systemd-analyze cat-config systemd/journald.conf | grep -E "^(SystemMaxUse|SystemKeepFree|MaxRetentionSec)"
```

To keep more, raise `SystemMaxUse=` in a `journald.conf.d` drop-in and restart `systemd-journald`. To free space on purpose, `journalctl --vacuum-time=14d` or `--vacuum-size=1G`. Vacuuming permanently deletes archived journal files, so export what you need first.

### Messages were rate-limited

journald drops messages from a service that logs faster than `RateLimitBurst=` (default 10000) per `RateLimitIntervalSec=` (default 30s), and says so:

```bash
journalctl --since "14:15" --until "14:35" | grep "Suppressed"
# systemd-journald[412]: Suppressed 4821 messages from myapp.service
```

If you see this in your incident window, part of the evidence is gone. A very noisy service can set `LogRateLimitIntervalSec=`/`LogRateLimitBurst=` in its unit (systemd 240+).

---

## Useful recipes

```bash
# Errors per hour today, for one unit
journalctl -u myapp --since today -p err -o short-iso -q --no-pager | cut -c1-13 | uniq -c

# Which units logged the most errors since yesterday
journalctl -p err --since yesterday -o json --no-pager \
  | jq -r '._SYSTEMD_UNIT // .SYSLOG_IDENTIFIER' | sort | uniq -c | sort -rn | head

# Window before a crash: 10 minutes up to the moment it died
journalctl -u myapp --since "14:12" --until "14:22:30" --no-pager

# Export a window to attach to a ticket
journalctl -u myapp --since "14:00" --until "15:00" -o short-iso --no-pager > myapp-1400-1500.log

# Start in the past, then keep following live
journalctl -u nginx --since "30 min ago" -f
```

---

## FAQ

**What time format does `journalctl --since` accept?**
`YYYY-MM-DD HH:MM:SS` (seconds and time optional), `HH:MM` for today, `today`/`yesterday`/`now`, relative forms like `"1 hour ago"` or `-30min`, and `@epoch`. Append `UTC` or a timezone name to avoid local-time confusion.

**How do I see logs from before the last reboot?**
`journalctl -b -1`. It needs a persistent journal; check that `/var/log/journal/` exists.

**Why does `journalctl -p err` show nothing for my application?**
journald stores plain stdout/stderr output at `info` priority. Use `--grep "error"` or filter the text with grep instead.

---

*Related: the [Linux log analysis guide](/blog/linux-log-analysis-guide) for what to look for once you have the window, [monitor real-time logs](/blog/monitor-real-time-logs-linux) for `journalctl -f`, and [systemd service won't start](/blog/systemctl-service-not-starting-fix) when the window shows a failed unit.*
