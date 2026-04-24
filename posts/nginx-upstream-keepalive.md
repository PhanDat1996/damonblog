---
title: "NGINX Upstream Keepalive Explained: Why Missing It Causes 502 Errors"
date: "2024-11-28"
excerpt: "Missing keepalive in your NGINX upstream block silently kills connections under load. Here's exactly what keepalive does, how TCP connection reuse works, and the production-ready config that stops 502s before they start."
tags: ["nginx", "infrastructure", "production", "networking", "troubleshooting"]
featured: true
category: "nginx"
---

## Introduction

If you've read the [NGINX 502 Bad Gateway debugging guide](/blog/nginx-502-under-load), you know that a missing `keepalive` directive in the upstream block is the single most common cause of 502 errors under load. But *why* does one missing line cause thousands of connection failures? And what exactly does adding it do?

This article is the deep dive. We'll go from TCP fundamentals to production-ready NGINX configuration, covering every mistake engineers make along the way.

---

## What Is Keepalive?

Keepalive is a mechanism that allows a single TCP connection to be reused for multiple HTTP requests, instead of opening and closing a new connection for every request.

Without keepalive, every HTTP request follows this lifecycle:

```
Client → [TCP SYN] → Server
Client ← [TCP SYN-ACK] ← Server
Client → [TCP ACK] → Server          # 3-way handshake complete

Client → [HTTP Request] → Server
Client ← [HTTP Response] ← Server

Client → [TCP FIN] → Server          # teardown begins
Client ← [TCP FIN-ACK] ← Server
Client → [TCP ACK] → Server          # connection fully closed
```

That is **7 network round trips** just to send one HTTP request and receive one response. At low traffic, the overhead is invisible. At 200 req/s, you are opening and closing 200 TCP connections every second.

With keepalive:

```
Client → [TCP SYN] → Server
Client ← [TCP SYN-ACK] ← Server
Client → [TCP ACK] → Server          # handshake — done once

Client → [HTTP Request 1] → Server
Client ← [HTTP Response 1] ← Server

Client → [HTTP Request 2] → Server   # same connection reused
Client ← [HTTP Response 2] ← Server

Client → [HTTP Request N] → Server   # still the same connection
Client ← [HTTP Response N] ← Server

Client → [TCP FIN] → Server          # teardown — done once
```

The TCP handshake happens **once**. All subsequent requests ride the same connection. This is the difference between 7 round trips per request and 2.

---

## HTTP/1.0 vs HTTP/1.1: Why the Version Matters

This is the part most documentation skips over, and it is why NGINX keepalive configuration has two required lines that are easy to get wrong.

### HTTP/1.0 — Connection per Request

HTTP/1.0 (1996) has **no keepalive by default**. Every request requires a new TCP connection. There was an unofficial `Connection: Keep-Alive` header that some implementations supported, but it was not standardized.

### HTTP/1.1 — Persistent Connections by Default

HTTP/1.1 (1997) made persistent connections the default. If you do not explicitly send `Connection: close`, the connection stays open after the response. This is now how every browser, curl, and HTTP client works.

### Why This Matters for NGINX

When NGINX proxies a request to an upstream, it acts as an HTTP client making a request *to your backend*. By default, **NGINX uses HTTP/1.0 for upstream connections** — even if the original client used HTTP/1.1.

This means: even if you configure `keepalive 64` in the upstream block, NGINX will not actually reuse connections unless you explicitly tell it to use HTTP/1.1:

```nginx
proxy_http_version 1.1;
```

And there is a second trap. HTTP/1.1 keeps connections open by default — but if the original client sent a `Connection: close` header, NGINX will forward that header to the upstream, which tells the backend to close the connection immediately after responding. You must clear it:

```nginx
proxy_set_header Connection "";
```

Without both lines, `keepalive` in the upstream block does nothing.

---

## The TIME_WAIT Problem: What Happens Without Keepalive

Every time a TCP connection closes, it does not disappear immediately. The closing side enters `TIME_WAIT` state and holds the socket for **2 × MSL** (Maximum Segment Lifetime) — typically 60 seconds on Linux.

This exists for a good reason: to ensure any delayed packets from the old connection do not corrupt a new connection on the same port. But it creates a real problem at scale.

### The Math

Linux allocates **ephemeral ports** for outgoing connections from a range defined by:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
# 32768   60999
```

That is ~28,000 available ports. Each port can only be in TIME_WAIT once at a time.

Now do the math:
- **200 req/s** with no keepalive = 200 new TCP connections per second
- Each connection stays in TIME_WAIT for **60 seconds**
- After 60 seconds: **200 × 60 = 12,000 ports** consumed
- After 140 seconds: **200 × 140 = 28,000 ports** — port pool **exhausted**

New connection attempts get `ECONNREFUSED`. NGINX logs:

```
connect() failed (111: Connection refused) while connecting to upstream
```

Your app is fine. Your NGINX is fine. The kernel ran out of ports.

### Watching It Happen

Run this during a load test with no upstream keepalive:

```bash
watch -n 0.5 'ss -s'
```

You will see output like:

```
Total: 31847
TCP:   29203 (estab 187, closed 28901, orphaned 0, timewait 28893)
```

When `timewait` approaches your port range limit, 502s start appearing. This is the smoking gun.

---

## The Complete Production-Ready Configuration

Here is the full upstream keepalive configuration with every directive explained:

```nginx
upstream app_backend {
    server 127.0.0.1:8080;

    # Maximum number of idle keepalive connections per worker process.
    # These are kept open and reused for new requests.
    # Rule of thumb: (expected_rps / worker_processes) * 0.5
    keepalive 64;

    # Number of requests served through one keepalive connection
    # before it is closed and recycled. Prevents memory leaks in
    # long-running upstream connections.
    keepalive_requests 1000;

    # How long an idle keepalive connection is kept open.
    # Should be slightly less than the upstream's own keepalive timeout
    # to avoid race conditions where NGINX sends on a connection
    # the upstream has already decided to close.
    keepalive_timeout 65s;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    location /api/ {
        proxy_pass http://app_backend;

        # REQUIRED: Use HTTP/1.1 — keepalive does not work with HTTP/1.0
        proxy_http_version 1.1;

        # REQUIRED: Clear the Connection header so it is not forwarded
        # to the upstream. Forwarding "Connection: close" would
        # immediately close the keepalive connection.
        proxy_set_header Connection "";

        # Standard proxy headers
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts — tighten from the 60s defaults
        proxy_connect_timeout  5s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;
    }
}
```

### How `keepalive 64` Actually Works

The `keepalive 64` directive does not set a maximum connection limit per se. It sets the **maximum number of idle connections** that NGINX will keep open per worker process, waiting to be reused.

Under load, NGINX may have far more than 64 active connections to the upstream — that is fine. The `64` only controls how many idle ones are kept in the pool after requests complete. If all 64 idle connections are in use when a new request arrives, NGINX opens a new connection temporarily. If the pool is not full when a connection becomes idle, it goes back into the pool.

Think of it like a connection pool in a database driver.

---

## Common Mistakes

### Mistake 1: Setting keepalive but forgetting proxy_http_version

```nginx
# BROKEN — keepalive silently does nothing
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;
}

location /api/ {
    proxy_pass http://app_backend;
    # Missing: proxy_http_version 1.1;
    # Missing: proxy_set_header Connection "";
}
```

NGINX will open new connections for every request. No error, no warning. The keepalive pool sits empty.

### Mistake 2: keepalive value too low

```nginx
# Too conservative for 200 req/s across 4 workers
keepalive 4;
```

With 4 worker processes and only 4 idle connections per worker, the pool is almost always empty under load. NGINX keeps opening new connections. TIME_WAIT builds up.

A reasonable starting point for a busy API: `keepalive 64` per worker. Tune upward if you still see TIME_WAIT climbing.

### Mistake 3: keepalive_timeout higher than upstream's timeout

```nginx
keepalive_timeout 120s;  # NGINX will hold connections for 2 minutes
```

If your Node.js server has a default `keepAliveTimeout` of 5 seconds (the Node.js default before v19), NGINX will try to reuse connections the upstream has already closed. Result: sporadic 502s that are hard to reproduce.

**Always set NGINX's `keepalive_timeout` slightly lower than the upstream's keepalive timeout.**

For Node.js (which defaults to `keepAliveTimeout: 5000ms` in older versions):

```javascript
// In your Node.js server — set this explicitly
server.keepAliveTimeout = 75000;  // 75 seconds
server.headersTimeout = 76000;    // must be > keepAliveTimeout
```

Then in NGINX:

```nginx
keepalive_timeout 65s;  # lower than Node's 75s
```

### Mistake 4: Not setting keepalive on multiple upstream blocks

It is easy to add keepalive to one upstream and forget others:

```nginx
upstream api_backend {
    server 127.0.0.1:8080;
    keepalive 64;  # ✓ configured
}

upstream static_backend {
    server 127.0.0.1:9000;
    # ✗ missing — will exhaust ports under load
}
```

Audit every upstream block. Any high-traffic upstream without `keepalive` is a future incident.

### Mistake 5: Applying keepalive to upstreams with a single short-lived request type

If your upstream handles very long-running requests (30+ seconds each), a small keepalive pool fills up quickly. Tune `keepalive` higher or use a dedicated upstream block for those endpoints with different settings.

---

## Verifying Keepalive Is Actually Working

After configuring keepalive, verify it is active — do not assume.

### Method 1: Watch TIME_WAIT Under Load

```bash
# Run load test in background, watch socket state
ab -n 50000 -c 100 http://localhost/api/health &
watch -n 0.5 'ss -s | grep -E "timewait|estab"'
```

**Before keepalive:** TIME_WAIT climbs steadily. At 200 req/s it reaches thousands within minutes.

**After keepalive:** TIME_WAIT stays low (under 200). ESTABLISHED count stays roughly stable — those are the reused keepalive connections.

### Method 2: Check NGINX Status Module

If you have `ngx_http_stub_status_module` enabled:

```nginx
location /nginx_status {
    stub_status;
    allow 127.0.0.1;
    deny all;
}
```

```bash
curl http://localhost/nginx_status
# Active connections: 47
# server accepts handled requests
#  182340 182340 891023
# Reading: 0 Writing: 12 Waiting: 35
```

The `Waiting` count represents idle keepalive connections being held. Under load with keepalive working, this number stays healthy rather than dropping to zero constantly.

### Method 3: strace a Worker Process

```bash
# Find an NGINX worker PID
ps aux | grep "nginx: worker"

# Watch its connect() calls
strace -p <worker_pid> -e trace=connect 2>&1 | head -50
```

Without keepalive: you see a constant stream of `connect()` calls.

With keepalive working: `connect()` calls are rare — connections are being reused.

---

## Impact: Before and After

Here are real numbers from the incident described in the [NGINX 502 debugging post](/blog/nginx-502-under-load), measured with `ab` at 200 req/s for 5 minutes:

| Metric | Without keepalive | With keepalive |
|---|---|---|
| TIME_WAIT sockets (peak) | 14,800 | 87 |
| New TCP connections/sec | ~200 | ~3 |
| 502 error rate | 0.3% | 0% |
| Avg response time | 42ms | 31ms |
| P99 response time | 310ms | 89ms |

The response time improvement is a bonus — fewer TCP handshakes means less latency for every request.

---

## When Keepalive Is Not Enough

Keepalive solves the connection exhaustion problem, but it does not fix everything. If you are still seeing 502s after configuring keepalive correctly, check:

- **Worker connections limit** — `worker_connections` may be too low. See [NGINX 502 Bad Gateway Under Load: Causes, Debugging, and Fixes](/blog/nginx-502-under-load)
- **Upstream pool limits** — PHP-FPM `pm.max_children` or Gunicorn worker count
- **Upstream response time** — if the app is slow, `proxy_read_timeout` may be firing
- **Kernel socket buffers** — under extreme load, check `net.core.somaxconn` and `net.ipv4.tcp_max_syn_backlog`

For the full diagnostic flow, see the [NGINX 502 debugging guide](/blog/nginx-502-under-load).

---

## TL;DR — The Minimum You Need

Add this to every NGINX upstream block that handles significant traffic:

```nginx
upstream your_backend {
    server 127.0.0.1:8080;
    keepalive 64;
    keepalive_requests 1000;
    keepalive_timeout 65s;
}
```

Add this to every `location` block that proxies to it:

```nginx
proxy_http_version 1.1;
proxy_set_header Connection "";
```

Without all five lines working together, keepalive does not function. With them, you eliminate the most common cause of NGINX 502 errors under load — permanently.