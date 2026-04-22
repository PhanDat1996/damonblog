---
title: "How to Monitor Real-Time Logs in Linux: tail, journalctl, multitail"
date: "2026-04-22"
excerpt: "Monitor real-time logs in Linux using tail -f, journalctl -f, and multitail — follow multiple log files simultaneously, filter live output, and build production log monitoring workflows."
tags: ["linux", "logs", "monitoring", "troubleshooting", "debugging"]
featured: false
slug: "monitor-real-time-logs-linux-guide"
---

Watching logs in real time is how you catch errors as they happen — during deployments, under load tests, or when chasing an intermittent bug. Here's every way to do it.

---

## TL;DR

```bash
tail -f /var/log/nginx/error.log                    # follow a flat file
journalctl -fu nginx                                # follow systemd service logs
journalctl -f -p err                                # all services, errors only
tail -f /var/log/nginx/error.log | grep ERROR       # follow + filter
multitail /var/log/nginx/error.log /var/log/app.log # multiple files, split view
```

---

## tail -f: The Standard Tool

```bash
tail -f /var/log/nginx/error.log
```

`-f` follows the file as it grows. Output stops when the file stops changing.

```bash
# Follow + filter (only show ERROR lines)
tail -f /var/log/app/app.log | grep "ERROR"

# Follow with color highlighting
tail -f /var/log/nginx/error.log | grep --color=always -E "error|warn|$"

# Follow last 100 lines, then stream
tail -n 100 -f /var/log/app/app.log

# Follow multiple flat files (alternates between them)
tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

---

## journalctl -f: For systemd Services

`journalctl -f` is the equivalent of `tail -f` for services managed by systemd:

```bash
# Follow a specific service
journalctl -fu nginx

# Follow + filter by priority (errors and above)
journalctl -fu nginx -p err

# Follow multiple services
journalctl -f -u nginx -u php-fpm

# All services, errors only
journalctl -f -p err

# Follow + grep
journalctl -fu myapp | grep -i "exception\|fatal\|crash"
```

The `-u` flag (unit) targets a specific service. Without it, you see all system logs.

---

## Real-Time Filtering Techniques

### grep with color

```bash
# Highlight errors in red while showing everything
tail -f /var/log/nginx/error.log | grep --color=always -iE "error|crit|alert|$"

# Show only 502 and 504 in access log
tail -f /var/log/nginx/access.log | grep -E " 50[24] "
```

### awk for structured parsing

```bash
# Show only lines where response time > 1 second (if logged as last field)
tail -f /var/log/nginx/access.log | awk '$NF > 1.0 {print}'

# Show 5xx errors with timestamp and IP
tail -f /var/log/nginx/access.log | awk '$9 >= 500 {print $1, $7, $9}'
```

### Watch for specific patterns with alert

```bash
# Alert when error rate spikes
tail -f /var/log/app/app.log | awk '
  /ERROR/ {count++}
  count > 10 {
    print "ALERT: " count " errors in last lines"
    count = 0
  }
'
```

---

## multitail: Multiple Logs in Split View

`multitail` splits the terminal and shows multiple log files simultaneously:

```bash
# Install
apt install multitail    # Ubuntu
dnf install multitail    # RHEL

# Two files side by side
multitail /var/log/nginx/error.log /var/log/app/app.log

# Three files
multitail /var/log/nginx/error.log /var/log/nginx/access.log /var/log/app/app.log

# With color schemes
multitail -ci green /var/log/nginx/access.log -ci red /var/log/nginx/error.log

# Follow journald output alongside a file
multitail -j /var/log/app/app.log
```

Navigate with arrow keys. Press `q` to quit.

---

## Real Examples

### Monitor a deployment

```bash
# Watch application log while deploy runs
tail -f /var/log/app/app.log &
LOG_PID=$!

# Run deployment
./deploy.sh

# Stop following when done
kill $LOG_PID
```

### Watch nginx 502 errors in real time

```bash
# Tail error log, show only upstream errors
tail -f /var/log/nginx/error.log | grep -i "upstream\|502\|connect"
```

### Monitor for OOM kills in real time

```bash
# Follow kernel log for OOM events
journalctl -f -k | grep -i "oom\|killed"
```

### Watch all service errors simultaneously

```bash
journalctl -f -p err --no-hostname
```

### Live response code breakdown

```bash
# Count response codes every 5 seconds from nginx access log
tail -f /var/log/nginx/access.log | awk '
{codes[$9]++; count++}
count % 100 == 0 {
  print "--- Last 100 requests ---"
  for (c in codes) print c":", codes[c]
  delete codes
}'
```

---

## Follow Logs That Rotate

Standard `tail -f` loses the file handle when a log is rotated (the file gets renamed and a new one created). Use `tail -F` (capital F):

```bash
# -F follows by filename, not file descriptor
# Works across log rotation
tail -F /var/log/nginx/error.log
```

`journalctl -f` handles rotation automatically since it reads from the journal, not a file.

---

## Common Mistakes

**Mistake 1: Using `tail -f` on a log that gets rotated**
Use `tail -F` (capital F) instead. `-f` follows the file descriptor; `-F` follows the filename and reopens when the file changes.

**Mistake 2: Not using `--no-pager` with journalctl in scripts**
`journalctl` sends output through `less` by default. In scripts, add `--no-pager`. For `-f` mode this doesn't matter, but when piping to grep it does:

```bash
journalctl -u nginx --no-pager | grep ERROR
```

**Mistake 3: Missing logs because buffer is full**
When piping `tail -f` through multiple filters, the pipe buffer can cause delayed output. Add `stdbuf -oL` to disable buffering:

```bash
tail -f /var/log/app.log | stdbuf -oL grep "ERROR" | stdbuf -oL awk '{print $0}'
```

**Mistake 4: Following a log that grows too fast**
On a busy server, `tail -f` on an access log can flood your terminal. Filter first:

```bash
tail -f /var/log/nginx/access.log | grep " 5[0-9][0-9] "
# Only show 5xx errors, not every request
```

---

## Pro Tips

```bash
# Follow log and timestamp each line as it arrives
tail -f /var/log/app.log | ts '[%Y-%m-%d %H:%M:%.S]'
# (requires 'ts' from moreutils package)

# Follow with context — show N lines before/after a match
tail -f /var/log/app.log | grep -A 3 "ERROR"

# Save real-time output to file AND show on screen
tail -f /var/log/app.log | tee /tmp/incident_$(date +%Y%m%d_%H%M%S).log

# Combine systemd and file log in one stream
{ journalctl -fu nginx & tail -f /var/log/app/app.log; } | grep -iE "error|warn"

# Alert on pattern match with sound
tail -f /var/log/nginx/error.log | grep --line-buffered "CRIT" | \
  while read line; do echo "$line"; echo -e '\007'; done
```

---

## Conclusion

`tail -F` (capital F) for flat files — it handles log rotation. `journalctl -f -u <service>` for systemd services. Filter with `grep --color=always -E "pattern|$"` to highlight matches while keeping all output. For watching multiple services during a deployment or incident, `journalctl -f -p err` gives you a filtered view across everything at once.

---

*Related: [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — the full log investigation workflow beyond just watching. [journalctl Filter by Time Range](/blog/journalctl-filter-time-range-guide) — go back in time to investigate past events.*
