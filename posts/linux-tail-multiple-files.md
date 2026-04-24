---
title: "Linux tail Multiple Files: Real Examples and Techniques"
date: "2026-04-22"
excerpt: "tail multiple files in Linux simultaneously — using tail -f, multitail, and journalctl to monitor several log files at once in real production scenarios."
tags: ["linux", "logs", "troubleshooting", "monitoring", "debugging"]
featured: false
slug: "linux-tail-multiple-files-examples"
category: "linux"
---

Watching one log file is easy. The real challenge is correlating events across multiple files — application log, nginx error log, and system journal — at the same time.

---

## TL;DR

```bash
# Basic: tail multiple files (alternates output, shows filename)
tail -f /var/log/nginx/error.log /var/log/app/app.log

# Merge all output with timestamps
tail -f /var/log/nginx/error.log /var/log/app/app.log | ts

# Split view (requires multitail)
multitail /var/log/nginx/error.log /var/log/app/app.log

# Combine systemd + flat file
{ journalctl -fu nginx & tail -F /var/log/app/app.log; }
```

---

## tail -f with Multiple Files

The simplest approach — `tail` accepts multiple file arguments:

```bash
tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Output:

```
==> /var/log/nginx/access.log <==
1.2.3.4 - - [22/Apr/2026:09:15:01] "GET /api/v1/users HTTP/1.1" 200 1234

==> /var/log/nginx/error.log <==
2026/04/22 09:15:02 [error] 1234#1234: *18423 connect() failed

==> /var/log/nginx/access.log <==
5.6.7.8 - - [22/Apr/2026:09:15:03] "POST /api/v1/login HTTP/1.1" 429 89
```

`tail` alternates between files, printing a header `==> filename <==` whenever the source changes. The output is interleaved chronologically as new lines arrive.

### With capital -F (follow across rotation)

```bash
tail -F /var/log/nginx/error.log /var/log/app/app.log
# -F reopens files by name when they're rotated
# Essential for long-running sessions
```

---

## Merge Output Into One Stream

When you need a clean chronological stream without the file headers:

```bash
# Remove the "==> filename <==" headers
tail -f /var/log/nginx/error.log /var/log/app/app.log | grep -v "^==>"

# Add timestamps to each line
tail -f /var/log/nginx/error.log /var/log/app/app.log | ts '[%H:%M:%S]'
# (requires moreutils: apt install moreutils)
```

---

## Label Each Line With Its Source

```bash
# Run each tail in background, prefix with filename
tail -F /var/log/nginx/error.log | sed 's/^/[nginx] /' &
tail -F /var/log/app/app.log | sed 's/^/[app]   /' &
wait
```

Output:

```
[nginx] 2026/04/22 09:15:02 [error] connect() failed
[app]   2026/04/22 09:15:02 ERROR: upstream connection timeout
[nginx] 2026/04/22 09:15:03 [error] upstream timed out
```

Much easier to follow during an incident than unlabeled interleaved output.

---

## multitail: Split-Pane View

`multitail` divides the terminal into sections — one per log file:

```bash
# Install
apt install multitail    # Ubuntu
dnf install multitail    # RHEL

# Two files, split horizontally
multitail /var/log/nginx/error.log /var/log/app/app.log

# Three files
multitail /var/log/nginx/error.log /var/log/nginx/access.log /var/log/app/app.log

# With color labels
multitail \
  -ci red    /var/log/nginx/error.log \
  -ci green  /var/log/nginx/access.log \
  -ci yellow /var/log/app/app.log

# Split vertically (-s flag)
multitail -s 2 /var/log/nginx/error.log /var/log/app/app.log
```

Keyboard shortcuts inside multitail:
- `b` — scroll back in a pane
- `q` — quit
- `a` — add another file
- `/` — search/filter

---

## Mix systemd Journal + Flat Files

Many applications log to both systemd journal (via stdout) and flat files (via the app's logger). Watch both:

```bash
# Run both in parallel, output to same terminal
{
  journalctl -fu nginx --no-hostname
  &
  tail -F /var/log/app/app.log
} | grep -v "^$"
```

Or with labeling:

```bash
journalctl -fu nginx --no-hostname | sed 's/^/[systemd] /' &
tail -F /var/log/app/app.log | sed 's/^/[applog]  /' &
wait
```

---

## Real Examples

### Monitor a deployment across services

```bash
# Watch nginx + app + systemd journal during a deploy
multitail \
  -ci red    /var/log/nginx/error.log \
  -ci yellow /var/log/app/app.log \
  -j         # also include journal

# Or as background processes
tail -F /var/log/nginx/error.log | sed 's/^/NGINX: /' &
tail -F /var/log/app/app.log | sed 's/^/APP:   /' &
journalctl -fu myapp | sed 's/^/SRVD:  /' &
echo "Watching logs... Ctrl+C to stop"
wait
```

### Watch access + error log, filter to 5xx only

```bash
tail -F /var/log/nginx/access.log /var/log/nginx/error.log | \
  grep --line-buffered -E "\" [5][0-9][0-9] |error|upstream"
```

### Correlate app errors with nginx upstream failures

```bash
# Timestamped output, errors only
tail -F /var/log/nginx/error.log /var/log/app/app.log | \
  grep --line-buffered -iE "error|exception|fail" | \
  ts '[%Y-%m-%d %H:%M:%.S]'
```

### Save incident logs while watching

```bash
tail -F /var/log/nginx/error.log /var/log/app/app.log | \
  tee /tmp/incident_$(date +%Y%m%d_%H%M%S).log
```

---

## tail Wildcards

```bash
# All log files in a directory
tail -F /var/log/nginx/*.log

# All rotated logs too
tail -F /var/log/nginx/error.log*

# All application logs
tail -F /var/log/myapp/*.log
```

---

## Common Mistakes

**Mistake 1: Using -f instead of -F for long sessions**
`-f` (lowercase) follows the file descriptor. When a log rotates, the old descriptor is gone and tail stops receiving output. `-F` (uppercase) follows by filename and reopens when the file changes.

**Mistake 2: Output getting cluttered with "==> filename <==" headers**
When multiple files update rapidly, the headers make output hard to read:

```bash
# Remove headers
tail -F /var/log/nginx/error.log /var/log/app/app.log | grep -v "^==>"

# Or use sed to add label instead
tail -F /var/log/nginx/error.log | sed 's/^/NGINX: /' &
tail -F /var/log/app/app.log | sed 's/^/APP:   /' &
```

**Mistake 3: Missing buffered output in pipelines**
Piping `tail -f` through grep or awk can cause buffering — lines appear in bursts instead of as they arrive:

```bash
# Fix: add --line-buffered to grep
tail -F /var/log/app.log | grep --line-buffered "ERROR"

# Fix: unbuffer with stdbuf
tail -F /var/log/app.log | stdbuf -oL grep "ERROR"
```

---

## Pro Tips

```bash
# Follow all .log files added to a directory in real time
# (requires inotifywait from inotify-tools)
inotifywait -m -e create /var/log/nginx/ --format "%f" | \
  while read file; do tail -F "/var/log/nginx/$file" & done

# Merge multiple files and add source label in one line
for f in /var/log/nginx/error.log /var/log/app/app.log; do
  tail -F "$f" | sed "s|^|$(basename $f): |" &
done
wait

# Kill all background tail processes when done
trap "kill 0" EXIT
```

---

## Conclusion

`tail -F file1 file2` is the quickest way to watch multiple files. The `-F` flag handles log rotation — always use it instead of `-f` for production sessions. For labeled output, pipe each tail into `sed 's/^/[label] /'` and run in the background. For split-pane visual monitoring, `multitail` is significantly easier to navigate during a real incident.

---

*Related: [How to Monitor Real-Time Logs in Linux](/blog/monitor-real-time-logs-linux-guide) — broader real-time log monitoring including journalctl filtering. [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — once the incident is over, how to analyze what happened.*
