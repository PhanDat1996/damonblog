---
title: "Nginx 502 Bad Gateway Fix: Root Causes and Solutions"
date: "2026-04-22"
excerpt: "Fix nginx 502 bad gateway errors — identify the root cause from the error log, fix upstream connection issues, keepalive config, and timeout problems in production."
tags: ["nginx", "troubleshooting", "production", "debugging"]
featured: false
slug: "nginx-502-bad-gateway-fix-linux"
---

Nginx returns 502 when it can't get a valid response from the upstream. The fix depends on the exact error — there are four different root causes and each needs a different solution.

---

## TL;DR: Read the Error Log First

```bash
tail -f /var/log/nginx/error.log | grep -i "upstream\|connect"
```

| Error in log | Cause | Fix |
|---|---|---|
| `connect() failed (111: Connection refused)` | Upstream not running or port exhaustion | Start app or add keepalive |
| `upstream timed out (110)` | Upstream too slow | Tune `proxy_read_timeout` |
| `no live upstreams while connecting` | All upstream servers failed | Check all backend health |
| `upstream sent invalid header` | App crashed mid-response | Check app logs |

---

## Fix 1: Upstream Not Running

```bash
# Is the app running?
systemctl status myapp
ss -tlnp | grep :8080

# Not running → start it
systemctl start myapp

# Test directly
curl -sf http://127.0.0.1:8080/health && echo "OK"
```

---

## Fix 2: Port Exhaustion (Most Common Under Load)

502 errors that only appear under high traffic are almost always port exhaustion caused by missing upstream keepalive.

```bash
# Check TIME-WAIT count while under load
watch -n 0.5 'ss -s | grep time-wait'
# If climbing above 5000: this is your problem
```

Fix — add keepalive to your nginx upstream block:

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;               # idle keepalive connections per worker
    keepalive_requests 1000;
    keepalive_timeout 75s;
}

server {
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;         # REQUIRED for keepalive
        proxy_set_header Connection ""; # REQUIRED: clear Connection: close
    }
}
```

Both `proxy_http_version 1.1` and the cleared `Connection` header are mandatory. Without them, keepalive is configured but silently ignored.

---

## Fix 3: Upstream Timeout

```bash
tail /var/log/nginx/error.log | grep "timed out"
# upstream timed out (110: Connection timed out) while reading response header
```

The app is alive but slow. Fix by tuning timeouts:

```nginx
location /api/ {
    proxy_pass http://app_backend;
    proxy_connect_timeout  5s;   # time to connect to upstream
    proxy_read_timeout    60s;   # time to wait for response
    proxy_send_timeout    30s;   # time to send request
}
```

Also investigate why the app is slow — check app logs, database query times, and downstream dependencies.

---

## Fix 4: Worker Connection Limit

```bash
# Error in nginx log:
# worker_connections are not enough while connecting to upstream
```

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;    # increase from default 1024
    use epoll;
    multi_accept on;
}
```

---

## Full Diagnostic Workflow

```bash
# 1. Read exact error
tail -f /var/log/nginx/error.log

# 2. Is upstream alive?
curl -sf http://127.0.0.1:8080/health

# 3. Are there TIME-WAIT sockets?
ss -s | grep time-wait

# 4. Check nginx limits
nginx -T | grep -E "worker_connections|worker_processes"

# 5. Test config after changes
nginx -t && systemctl reload nginx
```

---

## Real Example: 0.3% Error Rate Under Load

```
# Error log during load test:
connect() failed (111: Connection refused) while connecting to upstream,
client: 10.0.1.42, upstream: "http://127.0.0.1:8080/api/v2/events"
```

The upstream (Node.js) was running and healthy. Direct curl worked fine. But under 200 req/s, 0.3% returned 502.

```bash
watch -n 0.5 'ss -s'
# TCP: TIME-WAIT 14823 and climbing
```

Root cause: no keepalive in upstream block. Nginx opened a new TCP connection for every request. At 200 req/s, TIME-WAIT sockets exhausted the ephemeral port range.

Fix: added `keepalive 64` to upstream block with `proxy_http_version 1.1`. TIME-WAIT dropped to under 50. 502 errors disappeared.

---

## Common Mistakes

**Restarting nginx without reading the error log.** The error message tells you exactly what's wrong. Read it before changing anything.

**Adding keepalive without `proxy_http_version 1.1`.** This is the most common mistake. The keepalive directive does nothing without HTTP/1.1.

**Setting `proxy_read_timeout` too low.** Default is 60s. If your app has legitimate slow requests (reports, exports), dropping it to 5s creates 502s that weren't there before.

**Not testing upstream health directly.** Always run `curl http://127.0.0.1:<port>/health` from the nginx server before blaming nginx.

---

## Conclusion

Read the exact error from `/var/log/nginx/error.log` first. `Connection refused` under load = missing keepalive. `Timed out` = slow upstream or wrong timeout value. After any nginx config change, always run `nginx -t` before `systemctl reload`.

---

*Related: [NGINX 502 Bad Gateway Under Load: Full Guide](/blog/nginx-502-under-load) — complete deep dive including TIME-WAIT diagnosis. [NGINX Upstream Keepalive Explained](/blog/nginx-upstream-keepalive) — why keepalive eliminates 502s.*
