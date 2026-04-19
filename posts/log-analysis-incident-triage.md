---
title: "Reading Logs Like a Detective: A Field Guide to Incident Triage"
date: "2024-08-11"
excerpt: "The exact commands and mental models I use to go from 'something is wrong' to 'I know exactly what happened' in under 15 minutes."
tags: ["logs", "debugging", "incident", "troubleshooting", "security-ops"]
featured: false
---

## The Art of Log Triage

Every incident starts the same way: something is broken, alerts are firing, and you have a wall of logs. The engineers who resolve incidents quickly aren't reading every line — they're pattern-matching, sampling, and pivoting fast.

Here's the playbook.

## Phase 1: Get Your Bearings (2 minutes)

Before reading a single log line, answer these questions:

1. **When did it start?** Check your monitoring graphs. Find the exact timestamp of the first anomaly.
2. **What changed?** Deployments, config changes, traffic spikes, certificate renewals. Check your change log.
3. **What's the blast radius?** One service? One region? All users?

The answers narrow your search space before you open a single log file.

## Phase 2: The Quick Survey

```bash
# How many errors in the last hour?
grep -c "ERROR\|FATAL\|CRITICAL" /var/log/app/app.log

# What error types are appearing?
grep "ERROR" /var/log/app/app.log | \
  grep -oP '\[ERROR\] \K[^:]+' | \
  sort | uniq -c | sort -rn | head -20

# When did errors start?
grep "ERROR" /var/log/app/app.log | \
  awk '{print $1, $2}' | \
  cut -d: -f1-2 | \
  uniq -c | tail -30
```

The last command shows errors per minute. You can see exactly when the cliff happened.

## Phase 3: Correlate Across Services

Single-service logs rarely tell the full story. Use timestamps to jump between services:

```bash
# Set your incident window
START="2024-08-11T14:23:00"
END="2024-08-11T14:35:00"

# Query multiple log files in the window
for logfile in /var/log/nginx/access.log /var/log/app/app.log /var/log/db/postgresql.log; do
  echo "=== $logfile ==="
  awk -v s="$START" -v e="$END" '$0 >= s && $0 <= e' "$logfile" | tail -20
done
```

Look for the **first error** across services. The service that errors first is usually the root cause. Everything else is downstream.

## Useful One-Liners

**Top error messages by frequency:**

```bash
grep "ERROR" app.log | \
  sed 's/[0-9a-f-]\{36\}/UUID/g' | \
  sed 's/[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}/IP/g' | \
  sort | uniq -c | sort -rn | head -10
```

The `sed` commands normalize UUIDs and IPs so identical errors group together instead of appearing unique.

**NGINX: top IPs hitting 5xx errors:**

```bash
awk '$9 ~ /^5/ {print $1}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -10
```

**NGINX: which endpoints are erroring?**

```bash
awk '$9 ~ /^5/ {print $7}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | head -20
```

**Response time distribution (P50, P95, P99):**

```bash
awk '{print $NF}' /var/log/nginx/access.log | \
  sort -n | \
  awk 'BEGIN{c=0} {a[c++]=$1} END{
    p50=int(c*0.50); p95=int(c*0.95); p99=int(c*0.99);
    print "P50:", a[p50], "P95:", a[p95], "P99:", a[p99]
  }'
```

## Security Incident Patterns

**Brute force detection:**

```bash
# IPs with > 20 failed auth attempts in the last hour
grep "authentication failure\|Failed password\|Invalid user" /var/log/auth.log | \
  grep "$(date -d '1 hour ago' '+%b %d %H')\|$(date '+%b %d %H')" | \
  grep -oP 'from \K[0-9.]+' | \
  sort | uniq -c | sort -rn | awk '$1 > 20'
```

**Scanning behavior:**

```bash
# IPs hitting many different 404s (path scanning)
awk '$9 == "404" {print $1, $7}' /var/log/nginx/access.log | \
  awk '{ips[$1]++; paths[$1][$2]=1} END{
    for(ip in ips) if(ips[ip] > 50) print ips[ip], ip
  }' | sort -rn | head -10
```

**Unusual user agents:**

```bash
awk -F'"' '{print $6}' /var/log/nginx/access.log | \
  sort | uniq -c | sort -rn | \
  grep -v "Mozilla\|Chrome\|Safari\|curl\|python" | head -20
```

## Journald (Systemd) Tips

```bash
# Last 500 lines from a service with timestamps
journalctl -u nginx.service -n 500 --no-pager

# Since a specific time
journalctl -u app.service --since "2024-08-11 14:20:00" --until "2024-08-11 14:40:00"

# Priority: errors and above only
journalctl -u app.service -p err --since "1 hour ago"

# Follow live + filter
journalctl -u app.service -f | grep -i "error\|timeout\|refused"
```

## Building Your Timeline

When you find something significant, write it down immediately:

```
14:22:31 - Deployment of app v2.4.1 completed
14:23:04 - First DB connection timeout in app.log
14:23:11 - First 502 in nginx access.log (upstream: app-server)
14:23:45 - PagerDuty alert fires
14:31:00 - DB connection pool exhausted (max_connections hit)
14:31:22 - Rollback initiated
14:35:44 - Error rate returns to baseline
```

A timeline like this turns chaos into a story. It also becomes the foundation for your postmortem.

## The Mental Model

Logs are a crime scene. You're not looking for everything — you're looking for the **first anomaly** before things got bad. Work backwards from the visible symptom. Find the thread. Pull it.

The engineers who are fastest at incident triage aren't the ones who read the most logs. They're the ones who ask the best questions.
