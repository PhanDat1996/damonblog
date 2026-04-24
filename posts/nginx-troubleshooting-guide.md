---
title: "NGINX Troubleshooting Guide: Complete Production Reference"
date: "2026-04-21"
excerpt: "The complete NGINX troubleshooting reference — 502/504 errors, upstream failures, SSL issues, connection limits, keepalive misconfiguration, and production debugging workflows with real commands."
tags: ["nginx", "troubleshooting", "production", "infrastructure"]
featured: true
slug: "nginx-troubleshooting-guide"
category: "nginx"
---

## TL;DR

- **502 Bad Gateway** = NGINX cannot reach upstream. Check upstream health, then TIME-WAIT, then worker_connections
- **504 Gateway Timeout** = upstream is alive but too slow. Tune `proxy_read_timeout`
- **Missing keepalive** in upstream block is the #1 cause of 502s under load
- **Always read the exact error log message** — `connect() failed (111)` vs `timed out (110)` need different fixes
- **SSL grade below A** = weak ciphers, no HSTS, missing OCSP stapling
- Reload with `nginx -t && systemctl reload nginx` — never restart in production

---

## Introduction

NGINX sits in front of almost every production web service. When it breaks, everything breaks. When it is misconfigured, the symptoms are often misleading — 502s that only appear under load, SSL issues that look like application errors, timeouts that blame the wrong service.

This is the reference guide for NGINX production troubleshooting. It covers the most common failure modes, the exact commands to diagnose them, and the configurations that fix them.

---

## Reading NGINX Error Logs

Before anything else, read the exact error message. NGINX error log messages are specific — each points to a different root cause.

```bash
# Follow live
tail -f /var/log/nginx/error.log

# Last 100 lines, no pager
journalctl -u nginx -n 100 --no-pager

# Filter to upstream errors only
grep "upstream" /var/log/nginx/error.log | tail -20
```

### Error message decoder

| Error message | Root cause | First action |
|---|---|---|
| `connect() failed (111: Connection refused)` | Upstream not running or port exhausted | Check upstream process + ss -s |
| `connect() failed (99: Cannot assign requested address)` | Ephemeral port exhaustion | Add keepalive, widen port range |
| `upstream timed out (110: Connection timed out)` | Upstream too slow | Check app performance, tune timeouts |
| `upstream sent invalid header` | Upstream crashed mid-response | Check app error logs |
| `worker_connections are not enough` | NGINX connection limit hit | Increase worker_connections |
| `no live upstreams while connecting to upstream` | All upstream servers failed | Check all upstream health |
| `SSL_do_handshake() failed` | TLS handshake failure | Check cert, cipher compatibility |

---

## 502 Bad Gateway: Complete Diagnosis

### Step 1: Read the exact error

```bash
tail -f /var/log/nginx/error.log | grep "502\|upstream\|connect"
```

### Step 2: Is the upstream running?

```bash
# Is the port listening?
ss -tlnp | grep <upstream_port>

# Does it respond directly?
curl -sf http://127.0.0.1:<port>/health && echo "OK"
```

### Step 3: Check for TIME-WAIT buildup (most common cause)

```bash
# Watch while load is active
watch -n 0.5 'ss -s | grep time-wait'
```

If TIME-WAIT is climbing: missing `keepalive` in upstream block.

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;
    keepalive_requests 1000;
    keepalive_timeout 75s;
}

server {
    location /api/ {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;         # required for keepalive
        proxy_set_header Connection ""; # clear Connection: close
    }
}
```

### Step 4: Check worker connection limits

```bash
nginx -T 2>/dev/null | grep worker_connections
ss -tnp | grep nginx | wc -l  # current connection count
```

If current > worker_connections × worker_processes:

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}
```

> **Complete guide:** [NGINX 502 Bad Gateway Under Load: Causes, Debugging, and Fixes](/blog/nginx-502-under-load)

> **Keepalive deep dive:** [NGINX Upstream Keepalive Explained: Why Missing It Causes 502 Errors](/blog/nginx-upstream-keepalive)

---

## 504 Gateway Timeout

504 means NGINX reached the upstream but the upstream took too long to respond.

```bash
# Confirm: look for timeout errors in log
grep "timed out" /var/log/nginx/error.log | tail -10
```

```nginx
location /api/ {
    proxy_pass http://app_backend;
    proxy_connect_timeout  5s;   # time to establish connection
    proxy_send_timeout    60s;   # time to send request
    proxy_read_timeout    60s;   # time to wait for response
}
```

Tighten timeouts if your SLA requires fast failure. Increase them if the upstream is legitimately slow (batch jobs, heavy queries).

---

## SSL/TLS Issues

### Check current SSL grade

Test at [SSL Labs](https://www.ssllabs.com/ssltest/) or from CLI:

```bash
# Check supported protocols
openssl s_client -connect yourdomain.com:443 -tls1 2>&1 | grep -E "SSL|error"
# Should fail — TLS 1.0 should be disabled

# Check cipher
openssl s_client -connect yourdomain.com:443 2>&1 | grep "Cipher"
```

### Production-hardened SSL config

```nginx
# /etc/nginx/snippets/ssl-params.conf

ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers on;
ssl_dhparam /etc/nginx/ssl/dhparam.pem;  # generate: openssl dhparam -out 4096
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
```

> **Complete SSL hardening guide:** [NGINX SSL Hardening: From C Grade to A+ on SSL Labs](/blog/nginx-ssl-hardening)

---

## Common Misconfigurations

### Missing `proxy_http_version 1.1`

Keepalive silently does nothing without this line:

```nginx
# BROKEN — keepalive configured but not actually used
upstream app { server 127.0.0.1:8080; keepalive 64; }
location / { proxy_pass http://app; }  # missing proxy_http_version 1.1

# CORRECT
location / {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

### Wrong `proxy_pass` trailing slash

```nginx
# These behave differently:
location /api/ { proxy_pass http://backend; }      # passes /api/foo
location /api/ { proxy_pass http://backend/; }     # strips /api/, passes /foo
location /api/ { proxy_pass http://backend/api/; } # passes /api/foo
```

### Using `if` in location blocks

```nginx
# WRONG — "if is evil" in NGINX
location / {
    if ($request_method = POST) { proxy_pass http://backend; }  # unreliable
}

# CORRECT
location / { proxy_pass http://backend; }
limit_except GET HEAD { deny all; }  # or handle in upstream
```

### Reload vs Restart

```bash
# ALWAYS test config before applying
nginx -t

# RELOAD — graceful, zero downtime
systemctl reload nginx
# or: nginx -s reload

# RESTART — kills existing connections
# Only needed for: changing listen port, changing worker count
systemctl restart nginx
```

---

## Performance Tuning Checklist

```nginx
# worker_processes should match CPU cores
worker_processes auto;

# Increase if hitting connection limits
worker_connections 4096;
worker_rlimit_nofile 65535;

# Enable sendfile for static files
sendfile on;
tcp_nopush on;
tcp_nodelay on;

# Upstream keepalive (see above)
keepalive 64;

# Gzip compression
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;

# Client timeouts
client_body_timeout 30s;
client_header_timeout 30s;
keepalive_timeout 65s;
send_timeout 30s;
```

---

## Quick Diagnostic Workflow

```bash
# 1. What error is NGINX logging?
tail -f /var/log/nginx/error.log

# 2. Is NGINX running and config valid?
systemctl status nginx
nginx -t

# 3. Is the upstream reachable?
ss -tlnp | grep <upstream_port>
curl -sf http://127.0.0.1:<port>/health

# 4. Connection state under load?
ss -s | grep time-wait
watch -n 1 'ss -tnp | grep nginx | wc -l'

# 5. Worker connection limit hit?
nginx -T | grep worker_connections

# 6. SSL issue?
openssl s_client -connect domain.com:443 2>&1 | grep -E "Cipher|Protocol|Verify"
```

---

## FAQ

**502 only appears under load — what is it?**
Almost certainly ephemeral port exhaustion from missing `keepalive` in the upstream block. Check `ss -s` while load is active — TIME-WAIT count will be climbing. Fix: add `keepalive 64` to the upstream block plus `proxy_http_version 1.1` and `proxy_set_header Connection ""` in the location block.

**nginx -t passes but the site is still broken after reload — why?**
`nginx -t` validates syntax but not runtime behavior. Common causes: upstream DNS not resolving at startup (use `resolver` directive), file permissions on SSL cert, or a `lua_` or `njs_` module error that only triggers on first request.

**What is the difference between `proxy_read_timeout` and `proxy_connect_timeout`?**
`proxy_connect_timeout` is how long NGINX waits to establish a TCP connection to the upstream. `proxy_read_timeout` is how long NGINX waits between two successive read operations from the upstream response. Both default to 60s. For most APIs, `proxy_connect_timeout 5s` and `proxy_read_timeout 30s` are more appropriate.

---

*Related reading: [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load) — complete 502 diagnosis guide. [NGINX Upstream Keepalive Explained](/blog/nginx-upstream-keepalive) — deep dive on keepalive and TCP connection reuse. [NGINX SSL Hardening](/blog/nginx-ssl-hardening) — TLS configuration for A+ SSL Labs score.*
