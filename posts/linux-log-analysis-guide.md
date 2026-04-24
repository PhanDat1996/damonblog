---
title: "Linux Log Analysis: How to Debug Issues Like a Senior Engineer"
date: "2026-04-21"
excerpt: "A practical Linux log analysis guide — journalctl usage, grep techniques, log correlation across services, and real-world debugging workflows used in production incident response."
tags: ["linux", "logs", "troubleshooting", "debugging", "monitoring"]
featured: false
slug: "linux-log-analysis-debugging-guide"
category: "linux"
---

## TL;DR

- **`journalctl -u service -n 100`** — last 100 lines from a systemd service
- **`journalctl -f`** — follow live log output (like tail -f but for systemd)
- **`journalctl --since "1 hour ago"`** — time-bounded log query
- **`grep -E "ERROR|WARN|FAIL" /var/log/app.log`** — find errors in flat log files
- **Always note the exact timestamp when a problem started** before opening any log
- Log files live in `/var/log/` — application logs vary but service logs go through journald on systemd systems
- **Correlate timestamps across services** — the first error in the chain is the root cause

---

## Introduction: Log Analysis Is the Core Skill

Every production incident ends in the same place: reading logs. Not metrics dashboards, not alert emails — the actual log lines that show what happened, in what order, and why.

**Linux log analysis** is the skill that separates engineers who diagnose fast from engineers who restart services and hope. The tools are simple — `journalctl`, `grep`, `awk`, `tail`. The skill is knowing what to look for, in what order, and how to correlate events across multiple services.

This guide covers the actual workflow: where logs live, how to query them efficiently, how to use grep to find patterns, and how to build a timeline from multiple log sources during an incident.

---

## Where Logs Live on Linux

### systemd Journal (Modern Linux)

On systemd-based distributions (RHEL 7+, Ubuntu 16.04+, Debian 8+), service logs go through `journald` and are queryable with `journalctl`.

```bash
# All logs, newest first
journalctl -r

# Logs for a specific service
journalctl -u nginx

# Logs for multiple services
journalctl -u nginx -u php-fpm
```

Journal logs are binary, stored in `/var/log/journal/`. Do not try to read them directly — always use `journalctl`.

### Flat Log Files

Many applications write directly to `/var/log/` or application-specific directories:

| Log | Location |
|---|---|
| Auth events | `/var/log/auth.log` (Ubuntu) / `/var/log/secure` (RHEL) |
| System messages | `/var/log/syslog` (Ubuntu) / `/var/log/messages` (RHEL) |
| Kernel messages | `/var/log/kern.log` / `dmesg` |
| NGINX access | `/var/log/nginx/access.log` |
| NGINX error | `/var/log/nginx/error.log` |
| Apache | `/var/log/apache2/` or `/var/log/httpd/` |
| Audit | `/var/log/audit/audit.log` |
| Custom apps | `/var/log/<appname>/` or configured in app |

---

## journalctl: The Primary Tool for System Logs

### Basic Queries

```bash
# Last N lines from a service
journalctl -u nginx -n 100 --no-pager

# Follow live (like tail -f)
journalctl -u nginx -f

# Show only errors and above
journalctl -u nginx -p err

# Priority levels: emerg, alert, crit, err, warning, notice, info, debug
journalctl -u nginx -p warning  # warning and above
```

### Time-Bounded Queries

This is the most important skill in incident response. **Always start with a time window.**

```bash
# Since a specific time
journalctl -u nginx --since "2026-04-20 14:30:00"

# Between two times
journalctl -u nginx --since "2026-04-20 14:00:00" --until "2026-04-20 15:00:00"

# Relative time
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx --since "30 minutes ago"
journalctl -u nginx --since "yesterday"
```

### Find Logs for a Specific Process

```bash
# By PID
journalctl _PID=1234

# By executable
journalctl _EXE=/usr/sbin/nginx

# By user
journalctl _UID=1000
```

### Cross-Service Log View

```bash
# All services between two times (to build a timeline)
journalctl --since "14:30:00" --until "14:35:00" --no-pager

# All services, errors only, last hour
journalctl -p err --since "1 hour ago"
```

---

## grep Techniques for Flat Log Files

### Finding Errors

```bash
# Case-insensitive search
grep -i "error" /var/log/nginx/error.log

# Multiple patterns (OR)
grep -E "ERROR|FATAL|CRITICAL|WARN" /var/log/app.log

# Count matches by type
grep -oE "ERROR|WARN|FATAL" /var/log/app.log | sort | uniq -c | sort -rn
```

### Context Around Matches

```bash
# 3 lines before and after each match
grep -B3 -A3 "connection refused" /var/log/nginx/error.log

# 5 lines after (useful for stack traces)
grep -A5 "Exception" /var/log/app.log
```

### Time-Based Filtering in Flat Logs

Most flat log files include timestamps. Extract a time window:

```bash
# Logs between two timestamps (ISO format)
awk '/2026-04-20T14:30/,/2026-04-20T14:35/' /var/log/app.log

# Logs from the last hour (if timestamp is at start of line)
grep "$(date -d '1 hour ago' '+%Y-%m-%dT%H')" /var/log/app.log
```

### Normalize and Count Error Patterns

When you have many error lines with dynamic data (UUIDs, IPs, timestamps), normalize them before counting:

```bash
# Replace UUIDs and IPs with placeholders, then count unique patterns
grep "ERROR" /var/log/app.log \
  | sed 's/[0-9a-f-]\{36\}/UUID/g' \
  | sed 's/[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}/IP/g' \
  | sort | uniq -c | sort -rn | head -20
```

This shows you the 20 most common error patterns, with UUIDs and IPs normalized so identical errors group together.

---

## Real-World Debugging Workflow

### Step 1: Anchor the Timeline

Before opening any log, get the exact timestamp of the first symptom.

```bash
# When did the alert fire?
# When did the first 502 appear?
# When did the last successful transaction happen?

# Check monitoring for exact timestamp
# Check user reports for approximate time

INCIDENT_START="2026-04-20 14:22:00"
```

Everything you search for should be anchored to this timestamp or slightly before it.

### Step 2: Check the Obvious Service First

```bash
# What service is failing?
systemctl status nginx
journalctl -u nginx --since "14:20:00" --until "14:30:00" --no-pager
```

### Step 3: Find the First Error

```bash
# When did errors start?
journalctl -u nginx -p err --since "14:00:00" | head -5
# Shows the first error message after 14:00

# In flat logs:
grep -n "ERROR" /var/log/app.log | head -5
# Line numbers help you find context
```

### Step 4: Correlate Across Services

Most incidents involve multiple services. The first error in the chain is the root cause.

```bash
# All service errors in a 5-minute window
journalctl -p err --since "14:20:00" --until "14:25:00" --no-pager \
  | sort -k1,2  # sort by timestamp if not already sorted
```

**Pattern to look for:** Service A logged an error at 14:22:01. Service B logged an error at 14:22:03. Service C logged an error at 14:22:05. The root cause is Service A — B and C are downstream effects.

### Step 5: Build the Timeline

Write it down as you find entries:

```
14:22:01 - database connection timeout in app.log
14:22:03 - nginx: upstream timed out (connection to app server)
14:22:05 - monitoring: health check failed
14:22:31 - database: max_connections reached (in postgresql.log)
```

Now the story is clear: database hit max_connections → app server could not connect → nginx got timeouts → health checks failed.

---

## Real Incident Scenarios

### Scenario 1: Service Down After Deployment

New version deployed at 15:30. Service went down at 15:31.

```bash
# Check what happened right after deployment
journalctl -u myapp --since "15:29:00" --until "15:35:00" --no-pager

# Look for startup errors specifically
journalctl -u myapp --since "15:29:00" | grep -iE "error|fail|exception|panic"
```

### Scenario 2: Intermittent 502 Errors

Nginx returning 502s randomly, about 0.5% of requests.

```bash
# Find 502s in nginx access log with timestamps
grep " 502 " /var/log/nginx/access.log | tail -20

# Get the timestamp of first 502
grep " 502 " /var/log/nginx/access.log | head -1 | awk '{print $4}' | tr -d '['

# Check nginx error log around that time
journalctl -u nginx --since "14:22:00" --until "14:23:00" | grep -i upstream
```

### Scenario 3: SSH Login Failures (Security Incident)

```bash
# Auth log for failed logins
grep "Failed password" /var/log/auth.log | tail -20

# Who is trying to log in?
grep "Failed password" /var/log/auth.log \
  | grep -oP 'from \K[0-9.]+' \
  | sort | uniq -c | sort -rn | head -10

# Successful logins around the same time
grep "Accepted" /var/log/auth.log --since "1 hour ago"
```

### Scenario 4: Disk Full — What Filled It?

```bash
# Find large log files
du -sh /var/log/* | sort -rh | head -10

# Find the log that grew recently
ls -lath /var/log/ | head -10

# Check if audit log is the culprit
du -sh /var/log/audit/
ls -lah /var/log/audit/

# Identify what is generating audit events
ausearch -ts today -i | head -50
```

---

## Advanced Techniques

### Watch a Log Live With Filtering

```bash
# Follow nginx error log, only show upstream errors
tail -f /var/log/nginx/error.log | grep -i upstream

# Follow journald with filter
journalctl -f -u nginx | grep -v "access" | grep -v "favicon"
```

### Count Events Per Minute

```bash
# How many errors per minute? (for flat logs with ISO timestamps)
grep "ERROR" /var/log/app.log \
  | awk '{print $1, $2}' \
  | cut -d: -f1-2 \
  | uniq -c
```

### Extract Specific Fields

```bash
# Get response codes from nginx access log
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# Get slow requests (>1 second response time — if logged in last field)
awk '$NF > 1.0 {print $0}' /var/log/nginx/access.log | tail -20
```

### Multi-file Log Search

```bash
# Search across all nginx logs including rotated
grep "error" /var/log/nginx/error.log*

# Search across all app logs
grep -r "FATAL" /var/log/myapp/
```

---

## Quick Reference

```bash
# ── JOURNALCTL ────────────────────────────────────────────────────
journalctl -u nginx -n 100 --no-pager    # last 100 lines
journalctl -u nginx -f                   # follow live
journalctl -u nginx -p err               # errors only
journalctl -u nginx --since "1 hour ago" # time filter
journalctl -p err --since "14:00:00"     # all services, errors

# ── GREP ─────────────────────────────────────────────────────────
grep -i "error" /var/log/app.log         # case-insensitive
grep -E "ERROR|WARN|FAIL"                # multiple patterns
grep -B3 -A3 "pattern"                   # context lines
grep -c "error"                          # count matches
grep -n "error"                          # show line numbers

# ── ANALYSIS ─────────────────────────────────────────────────────
# Count errors by type
grep -oE "ERROR|WARN|FATAL" app.log | sort | uniq -c

# Top error patterns
grep "ERROR" app.log | sed 's/[0-9a-f-]\{36\}/UUID/g' | sort | uniq -c | sort -rn | head

# Response code distribution (nginx)
awk '{print $9}' access.log | sort | uniq -c | sort -rn
```

---

## Conclusion

**Linux log analysis** is a structured process, not a random search. Anchor to a timestamp. Find the first error. Correlate across services. Build the timeline.

The tools are secondary — `grep`, `journalctl`, `awk` are all you need. The skill is knowing which log to open first and what pattern to look for when you open it.

**Every incident has a first error.** Find it, and the root cause usually follows immediately.

---

*Related reading: [Reading Logs Like a Detective: A Field Guide to Incident Triage](/blog/log-analysis-incident-triage) — full incident triage workflow. [Linux Process States Explained](/blog/linux-process-states-guide) — correlating D-state processes with log entries. [Check Open Ports in Linux](/blog/check-open-ports-linux-ss-netstat) — verifying network state alongside log analysis.*
