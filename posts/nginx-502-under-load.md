---
title: "NGINX 502 Bad Gateway Under Load: Causes, Debugging, and Fixes"
date: "2024-11-14"
excerpt: "NGINX returning 502 Bad Gateway only under high load? This guide covers every root cause — ephemeral port exhaustion, missing keepalive, proxy timeouts, worker limits — with step-by-step debugging commands and production-ready config fixes."
tags: ["nginx", "debugging", "production", "troubleshooting", "infrastructure"]
featured: true
seoKeywords: ["nginx 502 bad gateway", "fix nginx 502", "nginx upstream error", "nginx under load 502", "nginx keepalive upstream", "proxy_read_timeout nginx"]
---

## Introduction

It's 2am. Alerts are firing. Your monitoring shows a spike in 5xx errors — specifically **502 Bad Gateway** — but only on the production cluster. Staging is clean. The upstream app is running. You restart NGINX, errors drop... then come back the moment traffic picks up again.

This is one of the most frustrating failure patterns in production: a bug that hides at low traffic and only surfaces under real load. This guide covers every common root cause of **NGINX 502 Bad Gateway errors under load**, the exact commands to isolate them, and the configuration fixes that actually work.

> **Related:** If you are also seeing high TIME-WAIT counts or connection refused errors outside of NGINX, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) for a deeper look at socket-level debugging.

---

## What Does NGINX 502 Bad Gateway Mean?

When NGINX acts as a reverse proxy and returns a **502 Bad Gateway**, it means one thing: NGINX successfully received the client's request, attempted to forward it to an upstream server (your app, PHP-FPM, Node.js, Gunicorn, etc.), and **failed to get a valid response**.

NGINX itself is alive. The problem is downstream.

The upstream failure can happen in several ways:
- The upstream **refused the connection** entirely
- The upstream accepted the connection but **timed out** before responding
- The upstream returned a response NGINX could not parse
- The upstream **crashed** mid-request

The NGINX error log is your first clue — the specific error message tells you which of these happened, and determines your fix.

---

## Common Causes of NGINX 502 Under Load

### 1. Upstream Server Crash or Restart

The simplest case. Your app process died, was OOM-killed, or is restarting. At low traffic this might not trigger alerts; under load, every request hits a dead backend.

**Log signature:**
```
connect() failed (111: Connection refused) while connecting to upstream
```

### 2. Ephemeral Port Exhaustion (TIME-WAIT Buildup)

One of the most common and least-known causes of **NGINX 502 under load**. If NGINX opens a new TCP connection for every proxied request — which happens when `keepalive` is not configured in the upstream block — those connections close into `TIME-WAIT` state for 60 seconds. At 200 req/s, that is 12,000 sockets in TIME-WAIT. The Linux default ephemeral port range only provides ~28,000 ports. When the pool exhausts, new connections get `ECONNREFUSED`.

**Log signature:**
```
connect() failed (111: Connection refused) while connecting to upstream
```

Identical to a crashed upstream. The distinction: `ss -s` will show thousands of TIME-WAIT connections climbing under load.

### 3. Proxy Timeout

Your upstream is alive but slow. Under load, response times increase. If the response takes longer than `proxy_read_timeout` (default: 60s) or the connection takes longer than `proxy_connect_timeout` (default: 60s), NGINX gives up and returns 502.

**Log signature:**
```
upstream timed out (110: Connection timed out) while reading response header from upstream
```

### 4. Resource Exhaustion on the Upstream

The upstream server is running but overwhelmed — CPU at 100%, swap thrashing, or the process has hit its file descriptor limit. It accepts the connection but cannot serve it.

**Log signature:**
```
upstream sent invalid header while reading response header from upstream
```

### 5. NGINX Worker Connection Limits

NGINX drops connections before they even reach the upstream if `worker_connections` is too low. Each worker process can only hold `worker_connections` simultaneous connections. Under high load, new connections get dropped at the NGINX layer.

**Log signature:**
```
worker_connections are not enough while connecting to upstream
```

### 6. Backend Pool Limits (PHP-FPM, Gunicorn)

If your backend is PHP-FPM, `pm.max_children` caps simultaneous requests. Gunicorn has `--workers`. When the pool is full, excess requests are refused immediately.

**Log signature:**
```
connect() failed (11: Resource temporarily unavailable) while connecting to upstream
```

---

## Real-World Incident: The 0.3% Error Rate That Only Appeared at 200 req/s

**Setup:** NGINX reverse proxying a Node.js API on the same host, port 8080. Passed all staging load tests at 50 req/s without a single error.

**Symptom:** Three days after a traffic surge from a product launch, 502 errors started appearing — 0.3% error rate, completely random, only under sustained load above ~180 req/s.

**Error log:**
```
2024/11/14 02:41:08 [error] 31#31: *18423 connect() failed (111: Connection refused)
while connecting to upstream, client: 10.0.1.42, server: api.example.com,
request: "POST /api/v2/events HTTP/1.1", upstream: "http://127.0.0.1:8080/api/v2/events"
```

Connection refused — but Node.js was running, health checks passed, and its own logs were clean. CPU was 40%. Memory was fine.

**The tell:** Running `watch -n 0.5 'ss -s'` during a load test showed TIME-WAIT climbing past 14,000 and still going. The ephemeral port pool was draining. New outbound connections were being refused at the kernel level — before they ever reached the app.

Root cause: no `keepalive` directive in the upstream block. NGINX was opening a brand-new TCP connection for every single proxied request.

---

## How to Debug NGINX 502 Errors: Step by Step

### Step 1: Read the Exact Error Log Message

```bash
tail -f /var/log/nginx/error.log
```

`connect() failed (111)` vs `timed out (110)` vs `invalid header` are three different problems requiring different fixes. Read it before assuming.

> **Tip:** For a full walkthrough on reading and correlating logs across services, see [Reading Logs Like a Detective: A Field Guide to Incident Triage](/blog/log-analysis-incident-triage).

### Step 2: Verify the Upstream Directly

```bash
# Is the port listening?
ss -tlnp | grep 8080

# Does it respond to a direct request?
curl -sf http://127.0.0.1:8080/health && echo "upstream OK"

# Check the upstream process logs
journalctl -u app-server -n 100 --no-pager
```

If the upstream responds normally to direct requests, the problem is in the connection layer between NGINX and the app — not the app itself.

### Step 3: Watch Socket State Under Load

Run this while traffic is active:

```bash
watch -n 0.5 'ss -s'
```

| What you see | What it means |
|---|---|
| TIME-WAIT > 5,000 and climbing | Ephemeral port exhaustion — missing keepalive |
| CLOSE-WAIT climbing | Upstream not closing connections properly |
| SYN-SENT stuck | Upstream not accepting new connections |

```bash
# Check current ephemeral port range (~28,000 ports by default)
cat /proc/sys/net/ipv4/ip_local_port_range

# Count TIME-WAIT sockets right now
ss -tn state time-wait | wc -l
```

> **Related:** For a deeper dive into `ss`, `lsof`, and socket-level debugging, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging).

### Step 4: Check System Resources

```bash
# CPU, memory, load average
top -bn1 | head -5

# Is the upstream process hitting FD limits?
PID=$(pgrep -f app-server | head -1)
echo "Limit:   $(cat /proc/$PID/limits | grep 'open files' | awk '{print $4}')"
echo "Current: $(ls /proc/$PID/fd | wc -l)"

# Is the system swapping?
vmstat 1 3
```

### Step 5: Check NGINX Worker Limits

```bash
# Current setting
nginx -T 2>/dev/null | grep worker_connections

# Active NGINX connections right now
ss -tnp | grep nginx | wc -l
```

---

## Fix and Configuration

### Fix 1: Add Upstream Keepalive — The Most Common Fix for NGINX 502 Under Load

```nginx
upstream app_backend {
    server 127.0.0.1:8080;

    keepalive 64;            # idle keepalive connections per worker
    keepalive_requests 1000; # requests before recycling a connection
    keepalive_timeout 75s;   # idle timeout before closing
}

server {
    location /api/ {
        proxy_pass http://app_backend;

        proxy_http_version 1.1;         # required — HTTP/1.0 has no keepalive
        proxy_set_header Connection ""; # clear client's "Connection: close" header
    }
}
```

**Why it works:** NGINX reuses existing TCP connections instead of opening a new one per request. TIME-WAIT sockets stop accumulating. The two required lines — `proxy_http_version 1.1` and the cleared `Connection` header — are both mandatory. Without them, keepalive silently degrades to HTTP/1.0 behavior and does nothing.

> **See also:** [NGINX SSL Hardening: From C Grade to A+ on SSL Labs](/blog/nginx-ssl-hardening) for a complete production-ready NGINX server block setup.

### Fix 2: Increase Worker Connections

```nginx
worker_processes auto;        # one per CPU core
worker_rlimit_nofile 65535;   # OS file descriptor limit for NGINX processes

events {
    worker_connections 4096;  # per worker (total = processes × this value)
    use epoll;                 # most efficient I/O model on Linux
    multi_accept on;
}
```

**Why it works:** `worker_processes × worker_connections` is the maximum simultaneous connection count NGINX can hold. The default of 1024 connections per worker is far too low for production traffic.

### Fix 3: Tune Proxy Timeouts

```nginx
location /api/ {
    proxy_pass http://app_backend;

    proxy_connect_timeout  5s;  # time to establish connection to upstream
    proxy_send_timeout    30s;  # time to transmit the full request
    proxy_read_timeout    30s;  # time to wait for upstream response
}
```

**Why it works:** The 60s defaults are too generous for most APIs. Tighter timeouts make NGINX fail fast, freeing connections instead of holding them open for a minute while the upstream is struggling.

### Fix 4: Widen the Ephemeral Port Range

Even with keepalive configured, widening the port range adds safety margin:

```bash
# Temporary (lost on reboot)
echo "1024 65535" > /proc/sys/net/ipv4/ip_local_port_range

# Permanent
echo "net.ipv4.ip_local_port_range = 1024 65535" >> /etc/sysctl.conf
echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
sysctl -p
```

### Fix 5: Tune Backend Pool Size (PHP-FPM)

```ini
; /etc/php/8.x/fpm/pool.d/www.conf
pm = dynamic
pm.max_children = 50
pm.start_servers = 10
pm.min_spare_servers = 5
pm.max_spare_servers = 20
pm.max_requests = 500
```

Reload after changes: `systemctl reload php8.x-fpm`

---

## Verifying the Fix

Run a load test while watching socket state and the error log simultaneously:

```bash
# Terminal 1: watch socket state
watch -n 1 'ss -s'

# Terminal 2: watch for errors
tail -f /var/log/nginx/error.log

# Terminal 3: generate load
ab -n 10000 -c 200 https://api.example.com/health
```

After adding upstream keepalive: TIME-WAIT count stays below 200 (instead of climbing into the thousands), and the error log stays silent.

---

## Lessons Learned and Best Practices

**Always configure upstream keepalive.** There is almost no valid reason for NGINX to open a new TCP connection for every request to a local upstream. Add it to every reverse proxy config by default.

**Load test at 2–3x expected peak.** The bug above was invisible at 50 req/s and catastrophic at 200 req/s. Low-concurrency staging tests miss resource exhaustion entirely.

**Monitor socket state, not just error rate.** By the time 502s appear, port exhaustion is already severe. A rising TIME-WAIT count in your monitoring is an early warning you can act on before users are affected.

**Know your connection limits.** `worker_connections`, `worker_rlimit_nofile`, `ulimit -n`, `pm.max_children` — these interact. When traffic grows, one becomes the bottleneck. Document and review them when you scale.

**The exact error message matters.** `Connection refused (111)` and `timed out (110)` are different problems. Read before you act.

---

## Quick Reference: NGINX 502 Diagnostic Table

| Error message | Likely cause | First action |
|---|---|---|
| `connect() failed (111)` + high TIME-WAIT | Missing keepalive | Add `keepalive` to upstream block |
| `connect() failed (111)` + low TIME-WAIT | Upstream crashed | `systemctl status app` |
| `timed out (110)` reading response | Slow upstream / timeout too short | Check app perf + tune `proxy_read_timeout` |
| `worker_connections are not enough` | NGINX limit hit | Increase `worker_connections` |
| `connect() failed (11)` | Backend pool full | Increase `pm.max_children` / workers |
| `upstream sent invalid header` | App crash mid-response | Check app error logs |

---

## Conclusion

**NGINX 502 Bad Gateway errors under load** are almost always a connection management problem — not a code bug. The most common culprit is missing upstream keepalive causing ephemeral port exhaustion, but timeouts, worker limits, and backend pool saturation all produce similar symptoms.

The debugging path is fast once you know it: read the exact error log message, check socket state with `ss -s` under load, verify the upstream directly, then work through resource limits from the OS up through the application layer.

Add upstream keepalive to every reverse proxy config. Monitor TIME-WAIT socket counts. Load test at realistic traffic levels before launch. You will not be debugging this at 2am.

---

*Found this useful? The same debugging approach applies to Docker containers — see [Docker Ate My Disk: Fixing Log Rotation Before It Kills Production](/blog/docker-log-rotation) for another common production incident breakdown.*