---
title: "Monitor Real-Time Logs in Linux: tail -F and journalctl -f"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Watch Linux logs live without missing lines: tail -F vs -f after rotation, journalctl -f filters, and the pipe buffering that makes grep go silent."
tags: ["linux", "logs", "monitoring", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You're about to deploy, or you just changed a config, and you want to see the first error the second it happens. So you run `tail -f /var/log/app.log | grep ERROR` and... nothing. The app is clearly logging errors, but the screen stays blank. Or `tail -f` worked fine for an hour, then went quiet at midnight while the app kept running.

Both are classic. The first is pipe buffering, the second is log rotation. This post covers watching **one stream** live and reliably. If you need several files at once with labels or a split screen, see [tail multiple files](/blog/linux-tail-multiple-files).

---

## TL;DR

```bash
tail -n 0 -F /var/log/nginx/error.log                  # file: new lines only, survives rotation
journalctl -u myapp -f                                 # systemd service
journalctl -f -p err                                   # every unit, errors and worse
journalctl -k -f                                       # kernel (OOM kills, disk errors)

tail -F /var/log/app.log | grep --line-buffered ERROR | awk '{print $1, $2, $5; fflush()}'
less +F /var/log/app.log                               # follow, Ctrl+C to search, F to resume
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

`-p` filters on the priority the program assigned. Apps that print everything to stdout are stored at `info`, so `-p err` hides their errors. When in doubt, use `--grep` instead (systemd 237+):

```bash
journalctl -u myapp -f --grep "error|timeout"       # regex, case-insensitive if all lowercase
```

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

---

## Common mistakes

- **`tail -f` on a log that rotates by rename.** It goes quiet at rotation time. Use `-F`.
- **Missing `--line-buffered` in the middle of a pipe.** Lines arrive minutes late or not at all.
- **Following the journal for an app that logs to a file.** `journalctl -u nginx -f` won't show access or error log lines.
- **Following an unfiltered access log on a busy server.** Thousands of lines a second flood the terminal and your SSH connection. Filter first.
- **Expecting `-p err` to catch stdout errors.** journald stores plain stdout as `info`.

---

## FAQ

**What's the difference between `tail -f` and `tail -F`?**
`-f` follows the open file. If the file is renamed during rotation, it keeps reading the old one. `-F` follows the file name and reopens it when it's replaced or recreated, so it survives rotation.

**How do I follow logs of a systemd service?**
`journalctl -u <service> -f`. Add `-n 0` to skip old entries, `-p warning` to filter by priority, or `--grep` for a regex.

**Why does `tail -f | grep | awk` print nothing?**
grep's output into a pipe is block-buffered. Use `grep --line-buffered` and `fflush()` in awk.

---

*Related: [journalctl time filters](/blog/journalctl-filter-time-range) to look back at what you missed, the [Linux log analysis guide](/blog/linux-log-analysis-guide) for what the lines mean, and [incident triage with logs](/blog/log-analysis-incident-triage) for the full outage workflow.*
