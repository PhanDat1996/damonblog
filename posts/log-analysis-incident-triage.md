---
title: "Log Analysis for Incident Triage: Find the First Failure"
date: "2024-08-11"
updated: "2026-10-28"
excerpt: "Alerts firing, error rate climbing, logs everywhere. A triage order for production outages: scope it, read NGINX and app logs, and build the timeline."
tags: ["logs", "debugging", "incident", "troubleshooting", "security-ops"]
featured: false
category: "linux"
---

The alert fires at 14:24. The error rate is at 12%, Slack is filling up, and you have NGINX logs, application logs, database logs and the journal on four different hosts. Reading them top to bottom is how you lose the first 30 minutes.

Triage is a different job from log analysis after the fact. You aren't trying to understand everything. You're trying to answer three questions fast: **what is failing, since when, and which component failed first.** This post is the order to do it in.

For the Linux system side (journald, kernel, OOM, disk errors), see the [Linux log analysis guide](/blog/linux-log-analysis-guide). For suspected attacks, see [security log analysis](/blog/log-analysis-security-windows-webserver).

---

## The triage order

```
1. Scope      when did it start? what changed? who is affected?
2. Edge       the load balancer / NGINX access log: what are users getting?
3. Proxy      the NGINX error log: why is the proxy failing?
4. App        application log: what does the backend say at that second?
5. Dependency DB, cache, queue, DNS, disk: is the app the victim?
6. Timeline   write it down; find the first abnormal event
```

Work from the user inward. Each layer tells you which layer to open next, so you don't read logs that don't matter.

---

## 1. Scope before you open a log (2 minutes)

- **Start time.** Take it from the monitoring graph, not from "about half two". You'll filter every log by it.
- **What changed.** Deploys, config pushes, certificate renewals, cron jobs, autoscaling events, a dependency's maintenance window. A change 1 to 5 minutes before the start time is your first hypothesis.
- **Blast radius.** All endpoints or one? All hosts or one? One customer? A single host points to that host (disk, memory, bad deploy). Everything at once points to a shared dependency.

Also check the clocks. If hosts disagree by a few seconds, your timeline lies.

```bash
timedatectl | grep -E "Time zone|synchronized"
chronyc tracking | grep "System time"     # offset from NTP, on chrony systems
```

---

## 2. The access log: what users are actually getting

An NGINX or Apache line in the default `combined` format:

```
198.51.100.7 - - [28/Oct/2026:14:23:11 +0000] "GET /v1/orders HTTP/1.1" 504 167 "-" "okhttp/4.12.0"
 $1 client IP     $4 + $5 time + tz           $6-$8 request        $9 status, $10 bytes, referer, user agent
```

If your `log_format` is custom (many add `$request_time` and `$upstream_response_time` at the end), check it in `nginx.conf` first, or the awk column numbers below will be wrong.

**Error rate per minute.** This shows the exact minute it started, and whether it's still going:

```bash
awk '{m=substr($4,2,17); t[m]++; if ($9 ~ /^5/) e[m]++}
     END {for (m in t) printf "%s  total=%-6d 5xx=%-5d %5.1f%%\n", m, t[m], e[m], 100*e[m]/t[m]}' \
  /var/log/nginx/access.log | sort | tail -30
```

```
28/Oct/2026:14:21  total=4821   5xx=3     0.1%
28/Oct/2026:14:22  total=4790   5xx=2     0.0%
28/Oct/2026:14:23  total=4655   5xx=412   8.9%
28/Oct/2026:14:24  total=4702   5xx=571  12.1%
```

It started at 14:23. Now everything you read is anchored to that minute.

**Which status, which endpoints:**

```bash
# Status breakdown in the incident window
awk '$4 >= "[28/Oct/2026:14:23" && $4 < "[28/Oct/2026:14:40"' /var/log/nginx/access.log \
  | awk '{print $9}' | sort | uniq -c | sort -rn

# Which endpoints are failing
awk '$9 ~ /^5/ {print $7}' /var/log/nginx/access.log | sed 's/?.*//' | sort | uniq -c | sort -rn | head
```

The status code is your first real clue:

| Status | Usually means |
|---|---|
| `502` | NGINX reached the backend but the connection was refused, reset or closed early. Backend down, crashing or restarting. |
| `504` | NGINX connected but the backend didn't answer within `proxy_read_timeout`. Backend alive but slow, often waiting on its own dependency. |
| `503` | Often deliberate: rate limiting (`limit_req`), maintenance, or no healthy upstream in a load balancer. |
| `500` | The backend answered, and its answer was an error. The cause is in the application log. |
| `499` | The client gave up before NGINX responded. Lots of these = slowness that users notice. |

(The string comparison on `$4` works because the timestamps share the same day and month. It's a quick filter, not a parser.)

---

## 3. The proxy error log: why NGINX is failing

```
2026/10/28 14:23:11 [error] 1187#1187: *48213 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 198.51.100.7, server: api.example.com, request: "GET /v1/orders HTTP/1.1", upstream: "http://10.0.2.15:8080/v1/orders", host: "api.example.com"
```

| Field | Meaning |
|---|---|
| `2026/10/28 14:23:11` | Local server time (note: different format from the access log) |
| `[error]` | Severity |
| `1187#1187` | Worker PID and thread ID |
| `*48213` | Connection number. Grep for it to see every line about the same request. |
| `(110: Connection timed out)` | The errno. This is the most useful part. |
| `upstream: "http://10.0.2.15:8080/..."` | Exactly which backend failed |

Group the errors by message and by backend:

```bash
grep -E "^2026/10/28 14:2" /var/log/nginx/error.log \
  | grep -oE "\([0-9]+: [^)]*\)|no live upstreams|prematurely closed" | sort | uniq -c | sort -rn

grep -E "^2026/10/28 14:2" /var/log/nginx/error.log \
  | grep -oE 'upstream: "[^"]*"' | cut -d/ -f3 | sort | uniq -c | sort -rn
```

| Error log message | What it tells you |
|---|---|
| `(111: Connection refused) while connecting to upstream` | Nothing listening on that port. Backend crashed, is restarting, or listens on a different port/address. |
| `(110: Connection timed out) while connecting to upstream` | No answer at all to the TCP SYN: host down, firewall dropping, or backend's accept queue full. |
| `upstream timed out (110...) while reading response header` | Connected fine, response too slow. Look at what the backend was waiting for. |
| `(104: Connection reset by peer)` | Backend killed the connection mid-request (crash, OOM kill, worker recycled). |
| `upstream prematurely closed connection` | Backend closed without a full response. Same family as 104. |
| `no live upstreams while connecting to upstream` | Every server in the upstream block is marked failed. It's a consequence, not a cause. Look at the earlier errors. |

If one backend IP dominates, go to that host. If all of them fail equally, suspect a shared dependency. The [NGINX 502 guide](/blog/nginx-502-bad-gateway-fix-linux) goes deeper on each of these.

---

## 4. The application log at the same second

Jump straight to the first minute of the incident on the backend you identified:

```bash
grep -n "2026-10-28 14:2[2-3]" /var/log/myapp/app.log | grep -E "ERROR|WARN|FATAL" | head -20
journalctl -u myapp --since "14:22" --until "14:25" --no-pager | head -50
```

Then group the messages, so 4,000 lines become 5 patterns:

```bash
grep "ERROR" /var/log/myapp/app.log \
  | sed -E 's/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/<id>/g; s/([0-9]{1,3}\.){3}[0-9]{1,3}/<ip>/g; s/[0-9]+/<n>/g' \
  | sort | uniq -c | sort -rn | head
```

```
   3912 <n>-<n>-<n> <n>:<n>:<n> ERROR [pool-<n>] OrderRepo: could not acquire connection within <n>ms
     41 <n>-<n>-<n> <n>:<n>:<n> ERROR [http-<n>] RequestHandler: upstream payment timeout
      3 <n>-<n>-<n> <n>:<n>:<n> WARN  [main] Config: deprecated property ...
```

The top line is the story: the app can't get a database connection. The app is the victim; the database (or the pool) is the next place to look.

For a stack trace, show what follows the first occurrence:

```bash
grep -m1 -A 25 "could not acquire connection" /var/log/myapp/app.log
```

### Follow one request end to end

If NGINX sets a request ID and passes it on, one grep follows a request across every layer:

```nginx
log_format main_rid '$remote_addr [$time_local] "$request" $status $request_time rid=$request_id';
proxy_set_header X-Request-ID $request_id;
```

```bash
grep "rid=4f8a2c19e0b7" /var/log/nginx/access.log
grep "4f8a2c19e0b7" /var/log/myapp/app.log
```

That only works if the application logs the header. It's worth setting up before the next incident.

---

## 5. Dependencies: is the app the victim?

When the app log says "timeout" or "could not connect", the cause is one hop further. Typical lines:

```
# PostgreSQL
FATAL:  sorry, too many clients already
FATAL:  remaining connection slots are reserved for non-replication superuser connections
LOG:  duration: 18342.117 ms  statement: SELECT ... FROM orders ...   (needs log_min_duration_statement)

# Kernel on the DB host
Out of memory: Killed process 2211 (postgres) ...

# Disk
No space left on device
```

Also check the boring layers on the affected host, because they cause a lot of incidents:

```bash
df -h; df -i                                          # full disk or out of inodes
journalctl -k --since "14:15" | grep -iE "oom|i/o error|blocked for more"
journalctl --since "14:15" | grep -i "Suppressed"     # journald dropped messages (rate limit)
```

That last one matters: journald rate-limits noisy services by default (`RateLimitBurst=10000` per `RateLimitIntervalSec=30s`). A line like `Suppressed 4821 messages from myapp.service` means part of your evidence is missing for that window.

---

## 6. Build the timeline

Write each finding down with its source as soon as you find it, all in the same timezone:

```
14:21:40  deploy   orders-api v2.4.1 rolled out (CI log)
14:22:55  app      first "could not acquire connection within 5000ms" (app.log, host api-2)
14:23:02  postgres first "sorry, too many clients already" (postgresql.log)
14:23:11  nginx    first upstream timed out to 10.0.2.15:8080 (error.log)
14:23:45  alert    5xx rate > 5% (monitoring)
14:31:22  action   rollback started
14:35:44  nginx    5xx back to baseline
```

Read it bottom-up: the alert was caused by NGINX timeouts, caused by the app waiting for DB connections, caused by the DB refusing new clients, and that started a minute after the deploy. The new version most likely opens more connections per instance (pool size × instances > `max_connections`).

Two cautions:

- **The first error in the window isn't automatically the cause.** Noisy services log errors all day. The cause is the first event that is *new*. Compare with the same window yesterday.
- **Symptoms can be logged before the cause.** A connection pool can log timeouts seconds before the DB logs the refusal, depending on timeouts and buffering. Use the timeline to form a hypothesis, then confirm it (here: count DB connections against `max_connections`).

---

## Traps that waste triage time

- **Rotated logs.** If the incident spans midnight or a rotation, part of it is in `access.log.1` or `.gz`. Use `zgrep`, which reads plain and compressed files: `zgrep " 502 " /var/log/nginx/access.log*`.
- **Timezones.** NGINX writes local time with an offset, many apps write UTC, journald shows local. Convert everything to one zone (`journalctl --utc` helps).
- **Sampling only one host.** Check that the pattern is the same on every backend before blaming code. One bad host is a different incident from all hosts.
- **Fixing before writing down.** A restart destroys state: open connections, in-memory queues, the process that was stuck. Capture `ss -s`, `top -bn1` and the relevant log tail first, then act.

---

## Quick checklist

1. Start time from monitoring, last change, blast radius, clocks in sync.
2. Access log: error rate per minute, status code mix, failing endpoints.
3. Error log: errno and upstream address. 502 vs 504 points you to "down" vs "slow".
4. App log at the same second, grouped into patterns.
5. Dependencies and the host: DB, disk, OOM, journald suppression.
6. Timeline in one timezone. The cause is the first *new* abnormal event.

---

*Related: [Monitor logs in real time](/blog/monitor-real-time-logs-linux) to watch the fix take effect, [journalctl time filters](/blog/journalctl-filter-time-range) for exact windows, and [NGINX 502 under load](/blog/nginx-502-under-load) when the errors only appear at peak traffic.*
