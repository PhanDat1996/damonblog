---
title: "Monitor Linux Logs: tail -F, Multiple Files, journalctl Filters"
seoTitle: "Monitor Linux Logs in Real Time: tail -F and journalctl"
date: "2026-04-22"
updated: "2026-11-08"
excerpt: "Follow and filter Linux logs: tail -F vs -f after rotation, tail multiple files with labels, journalctl -f and --since/--until, and grep pipe buffering."
tags: ["linux", "logs", "monitoring", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You're about to deploy, or you just changed a config, and you want to see the first error the second it happens. So you run `tail -f /var/log/app.log | grep ERROR` and... nothing. The app is clearly logging errors, but the screen stays blank. Or `tail -f` worked fine for an hour, then went quiet at midnight while the app kept running.

Both are classic. The first is pipe buffering, the second is log rotation. This post covers following one stream reliably, watching several files at once, and pulling an exact time window out of the journal afterwards (the incident was at 14:22, you want 14:15 to 14:35, not 40,000 lines since boot).

---

## TL;DR

```bash
tail -n 0 -F /var/log/nginx/error.log                  # file: new lines only, survives rotation
tail -n 0 -F /var/log/nginx/error.log /var/log/myapp/app.log   # several files at once
journalctl -u myapp -f                                 # systemd service
journalctl -f -u nginx -u myapp -u postgresql          # several units, merged in time order
journalctl -f -p err                                   # every unit, errors and worse
journalctl -k -f                                       # kernel (OOM kills, disk errors)

journalctl --since "2026-10-28 14:15" --until "2026-10-28 14:35"   # exact window
journalctl -u nginx --since "1 hour ago"               # one unit, relative
journalctl -b -1 -p warning                            # previous boot, warning and worse

tail -F /var/log/app.log | grep --line-buffered ERROR | awk '{print $1, $2, $5; fflush()}'
less +F /var/log/app.log                               # follow, Ctrl+C to search, F to resume
multitail /var/log/nginx/error.log /var/log/myapp/app.log   # split screen
```

---

## Files: use `tail -F`, not `tail -f`

```bash
tail -F /var/log/nginx/error.log
```

The difference matters as soon as logrotate runs:

```
tail -f   follows the FILE DESCRIPTOR
          logrotate renames error.log -> error.log.1, creates a new error.log
          tail keeps reading error.log.1, which nobody writes to anymore -> silence

tail -F   follows the NAME (same as --follow=name --retry)
          notices error.log was replaced, reopens it
          "tail: '/var/log/nginx/error.log' has been replaced;  following new file"
```

With `copytruncate` rotation the file is truncated in place instead of renamed. Both `-f` and `-F` print `file truncated` and carry on, so you only see the problem with rename-style rotation. Use `-F` and stop thinking about it.

Useful variants:

```bash
tail -n 0 -F app.log        # skip the last 10 lines, show only what's new from now
tail -n 200 -F app.log      # some context first, then follow
tail -F --pid=4521 app.log  # stop following when PID 4521 exits (GNU tail)
```

### `less +F` when you'll need to scroll back

```bash
less +F /var/log/app.log
```

It follows like `tail -f`. Press `Ctrl+C` to stop following and you're in normal `less`: `/pattern` to search, `?` to search backwards, `n` for next match. Press `F` to start following again. During an incident this beats restarting `tail` with different filters.

---

## tail multiple files

`tail -F` accepts several files at once and prints a `==> file <==` header whenever the source changes:

```bash
tail -n 0 -F /var/log/nginx/error.log /var/log/myapp/app.log
```

That's fine for a quick look. For readable output under pressure (a label on every line, the journal mixed with flat files, split-screen panes with multitail, or a true timeline with lnav), see [tail Multiple Files in Linux](/blog/linux-tail-multiple-files).

---

## systemd services: `journalctl -f`

```bash
journalctl -u myapp -f                       # one unit (last 10 lines, then follow)
journalctl -u myapp -u nginx -f              # two units, merged in time order
journalctl -u myapp -f -n 0                  # only new entries
journalctl -u myapp --since "10 min ago" -f  # last 10 minutes, then keep following
journalctl -f -p warning                     # all units, warning and above
journalctl -k -f                             # kernel ring buffer, live
journalctl -u myapp -f -o cat                # message only, no timestamp/host prefix
journalctl -u myapp -f -o short-precise      # microsecond timestamps
```

journald handles its own rotation, so there's no `-f`/`-F` problem here.

What the journal does **not** contain matters more. A service's journal has whatever the process writes to stdout/stderr or sends via syslog. NGINX, Apache, PostgreSQL and many Java apps write their real logs to their own files, so `journalctl -u nginx -f` shows startup messages and little else. For those, follow the file.

`-p` filters on the priority the program assigned (levels below). Apps that print everything to stdout are stored at `info`, so `-p err` hides their errors. When in doubt, use `--grep` instead (systemd 237+):

```bash
journalctl -u myapp -f --grep "error|timeout"       # regex, case-insensitive if all lowercase
```

---

## journalctl --since and --until

Looking back at what you missed is the same tool with a time window. `journalctl` can do this precisely, but it's picky about time formats, and it can silently return nothing when the logs you want were never kept.

```bash
journalctl --since "2026-10-28 14:15" --until "2026-10-28 14:35"   # exact window
journalctl -u nginx --since "1 hour ago"                            # one unit, relative
journalctl --since today -p err                                     # errors since midnight
journalctl --since "14:15" --until "14:35"                          # today, by clock time
journalctl -S -30min -U -10min                                      # short forms, relative to now
```

### Time formats `--since` / `--until` accept

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

### Combine time with other filters

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

### Boots: `-b` and `--list-boots`

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

`-b -1` only works if the journal is **persistent** (see "Why logs from last week aren't there" below). On a volatile journal, `--list-boots` shows only the current boot.

### Output formats with `-o`

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

### Why logs from last week aren't there

**The journal may be volatile.** journald's default `Storage=auto` writes to disk only if `/var/log/journal/` exists. Otherwise it keeps logs in `/run/log/journal/`, in RAM, and they're gone at reboot. Distributions differ on whether that directory is created at install time.

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

**The journal hit its size limit.** Old entries are deleted to stay within limits. The defaults: the journal may use up to **10% of the filesystem** (`SystemMaxUse=`), capped at 4 GB, and must leave **15% free** (`SystemKeepFree=`), also capped at 4 GB, whichever is stricter.

```bash
journalctl --disk-usage
journalctl --list-boots | head -2            # how far back does it go?
systemd-analyze cat-config systemd/journald.conf | grep -E "^(SystemMaxUse|SystemKeepFree|MaxRetentionSec)"
```

To keep more, raise `SystemMaxUse=` in a `journald.conf.d` drop-in and restart `systemd-journald`. To free space on purpose, `journalctl --vacuum-time=14d` or `--vacuum-size=1G`. Vacuuming permanently deletes archived journal files, so export what you need first.

**Messages were rate-limited.** journald drops messages from a service that logs faster than `RateLimitBurst=` (default 10000) per `RateLimitIntervalSec=` (default 30s), and says so:

```bash
journalctl --since "14:15" --until "14:35" | grep "Suppressed"
# systemd-journald[412]: Suppressed 4821 messages from myapp.service
```

If you see this in your incident window, part of the evidence is gone. A very noisy service can set `LogRateLimitIntervalSec=`/`LogRateLimitBurst=` in its unit (systemd 240+).

---

## Why `| grep` shows nothing: pipe buffering

This is the most common "live log" problem.

```bash
tail -F app.log | grep ERROR                    # works: grep writes to the terminal
tail -F app.log | grep ERROR | awk '{print $5}' # looks dead for minutes
```

When a program's output is a terminal, C stdio flushes after every line. When the output is a **pipe**, it flushes only when a buffer (typically 4 KB) is full. The grep in the middle sits on matches until it has 4 KB of them. At a few errors a minute, that can take an hour.

Fix every stage that isn't the last one:

| Tool | Line-buffered output |
|---|---|
| `grep` | `grep --line-buffered` |
| `sed` | `sed -u` (GNU) |
| `awk` | call `fflush()` after `print`; with mawk you can also run `mawk -W interactive` |
| `cut`, `tr` and other stdio tools | `stdbuf -oL cut ...` |
| `python` | `python3 -u` |

```bash
tail -n 0 -F /var/log/nginx/access.log \
  | grep --line-buffered -E '" 5[0-9]{2} ' \
  | awk '{print $4, $7, $9; fflush()}'
```

---

## Filtering live output

### Highlight instead of hiding

Sometimes you want to see everything but spot errors instantly. Match the pattern **or** the end of line (`$`), which matches every line but colors only the real hits:

```bash
tail -F /var/log/app.log | grep --line-buffered --color=always -iE "error|fatal|timeout|$"
```

### Only 5xx responses, live

```bash
tail -n 0 -F /var/log/nginx/access.log | awk '$9 >= 500 {print $4, $1, $7, $9; fflush()}'
```

This assumes the default `combined` log format (status in field 9). Check your `log_format` if the output looks wrong.

### Rolling status-code count

Live stream processing is fiddly; a repeated snapshot is often clearer:

```bash
watch -n 5 "tail -n 2000 /var/log/nginx/access.log | awk '{print \$9}' | sort | uniq -c | sort -rn"
```

### Watch for OOM kills and disk errors

```bash
journalctl -k -f | grep --line-buffered -iE "out of memory|killed process|i/o error|blocked for more than"
```

---

## Practical recipes

### Watch a deploy and stop when the app is up

```bash
T=$(date '+%Y-%m-%d %H:%M:%S')
systemctl restart myapp
timeout 120 grep -m1 -E "Listening on|Started" <(journalctl -u myapp -f --since "$T")
echo "exit: $?"    # 0 = matched, 124 = nothing matched within 120 seconds
```

`grep -m1` exits on the first match, and `timeout` makes sure a failed start doesn't leave you waiting forever. Starting the journal at `$T` (instead of `-n 0`) means you can't miss a line that was logged before `journalctl` attached.

### Keep a copy of what you watched

```bash
tail -n 0 -F /var/log/app.log | tee -a ~/incident-$(date +%Y%m%d-%H%M).log
```

### Add arrival timestamps to lines that don't have them

```bash
tail -F /var/log/app.log | ts '%Y-%m-%d %H:%M:%.S'    # ts is in the moreutils package
```

### Beep or notify on a critical line

```bash
tail -n 0 -F /var/log/nginx/error.log | grep --line-buffered "\[crit\]" |
  while read -r line; do
    printf '\a%s\n' "$line"
    logger -t logwatch -p user.warning "$line"     # also lands in the journal
  done
```

For anything permanent, use real alerting (your monitoring stack, or a journald/rsyslog forwarder). A `tail | while read` loop dies with your SSH session.

### Look back at a window from the journal

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
```

---

## Common mistakes

- **`tail -f` on a log that rotates by rename.** It goes quiet at rotation time. Use `-F`.
- **Missing `--line-buffered` / `sed -u` in the middle of a pipe.** Lines arrive minutes late, in bursts, or not at all.
- **Following the journal for an app that logs to a file.** `journalctl -u nginx -f` won't show access or error log lines.
- **Following an unfiltered access log on a busy server.** Thousands of lines a second flood the terminal and your SSH connection. Filter first.
- **Expecting `-p err` to catch stdout errors.** journald stores plain stdout as `info`.
- **Pasting background `tail` jobs into an interactive shell.** `Ctrl+C` doesn't stop them; they keep running after you leave. Use one pipeline, or a script with a `trap`.
- **Reading interleaved `tail` output as a timeline.** `tail` order is arrival order. Use `journalctl` with multiple `-u` or `lnav` when the order matters.
- **Using `grep -v "^==>"` to remove headers.** `-q` does it properly, and a per-line label is better than either (see [tail Multiple Files in Linux](/blog/linux-tail-multiple-files)).
- **Day-first dates in `--since`.** `"28/10/2026"` fails to parse. Use `YYYY-MM-DD`.

---

## FAQ

**What's the difference between `tail -f` and `tail -F`?**
`-f` follows the open file. If the file is renamed during rotation, it keeps reading the old one. `-F` follows the file name and reopens it when it's replaced or recreated, so it survives rotation.

**How do I tail multiple files and see which file each line came from?**
`tail -n 0 -F file1 file2` prints a `==> file <==` header when the source changes. To label every line, split the screen or merge by timestamp, see [tail Multiple Files in Linux](/blog/linux-tail-multiple-files).

**How do I follow logs of a systemd service?**
`journalctl -u <service> -f`. Add `-n 0` to skip old entries, `-p warning` to filter by priority, or `--grep` for a regex.

**What time format does `journalctl --since` accept?**
`YYYY-MM-DD HH:MM:SS` (seconds and time optional), `HH:MM` for today, `today`/`yesterday`/`now`, relative forms like `"1 hour ago"` or `-30min`, and `@epoch`. Append `UTC` or a timezone name to avoid local-time confusion.

**How do I see logs from before the last reboot?**
`journalctl -b -1`. It needs a persistent journal; check that `/var/log/journal/` exists.

**Why does `journalctl -p err` show nothing for my application?**
journald stores plain stdout/stderr output at `info` priority. Use `--grep "error"` or filter the text with grep instead.

**Why does `tail -f | grep | awk` print nothing?**
grep's output into a pipe is block-buffered. Use `grep --line-buffered` and `fflush()` in awk.

---

*Related: the [Linux log analysis guide](/blog/linux-log-analysis-guide) for what the lines mean, [incident triage with logs](/blog/log-analysis-incident-triage) for the full outage workflow and which files to watch, [grep for log searching](/blog/linux-find-file-by-name-and-size) once you need to search history instead of the live stream, and [systemd service won't start](/blog/systemctl-service-not-starting-fix) when the window shows a failed unit.*
