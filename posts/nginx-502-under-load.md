---
title: "NGINX 502 Bad Gateway Under Load: Root Causes and Fixes"
date: "2026-04-28"
excerpt: "NGINX 502 errors under load are almost never a simple app crash. This guide covers the real root causes — connection backlog overflow, keepalive misconfiguration, ephemeral port exhaustion — with diagnostic commands and config fixes from production incidents."
tags: ["nginx", "debugging", "linux", "infrastructure", "troubleshooting"]
featured: false
category: "nginx"
---

You're on a call at 3 AM. The dashboard is red, users are seeing 502s, and the NGINX error log is full of `upstream prematurely closed connection while reading response header`. You `curl` the backend directly — it responds fine. But under load, the 502s keep coming.

The standard definition of a 502 — "invalid response from upstream" — is useless here. Under load, the root cause is almost never an application crash. It's resource contention between NGINX's connection handling and the backend's ability to process requests at scale.

---

## TL;DR

```
502 under load ≠ app is broken
502 under load = connection boundary failure between NGINX and backend

Most common causes:
1. Backend listen backlog overflow (kernel drops connections → NGINX sees RST → 502)
2. No upstream keepalive → TCP handshake overhead kills backend at scale
3. Ephemeral port exhaustion → NGINX can't open new connections
4. Worker pool undersized for actual concurrency requirements

Fastest diagnostic:
  netstat -s | grep overflowed    # climbing number = smoking gun
  ss -lnt sport = :8000           # Recv-Q > 0 = app not keeping up
```

---

## 502 vs 504 — the distinction matters

Before diagnosing, know what you're actually looking at:

- **502 Bad Gateway** — the connection was established but something broke the conversation before a complete response header was parsed. The upstream rejected the connection, closed it abruptly, or returned garbage.
- **504 Gateway Timeout** — NGINX connected and sent the request, but the upstream never responded within the configured timeout.

If you're seeing 502s specifically under load (not 504s), the upstream isn't slow — it's actively rejecting connections or closing them before they complete. That's a different problem with a different fix.

---

## Why 502s appear specifically under load

A server that handles 100 req/s cleanly can collapse into 502s at 500 req/s. The load doesn't just slow things down — it changes the failure mode of the TCP stack.

### 1. Backend listen backlog overflow

This is the dominant root cause in high-traffic environments, and the one most engineers miss.

Application servers (Gunicorn, Unicorn, Puma, PHP-FPM) define a maximum number of worker processes. When traffic exceeds what those workers can handle:

1. NGINX accepts connections and opens TCP connections to the backend port
2. The backend Linux kernel accepts the TCP handshake and places the connection in the **listen backlog** (the accept queue)
3. When the accept queue overflows, the kernel either drops the SYN packet or sends a RST depending on `tcp_abort_on_overflow`
4. NGINX sees the connection "succeed" at the TCP level, then immediately receives a RST
5. NGINX logs `upstream prematurely closed connection` and returns 502

This happens in milliseconds. It's not a timeout — it's an immediate rejection at the kernel level. This is why `curl` to the backend passes fine: you're not generating enough load to overflow the queue with a single request.

### 2. Upstream keepalive misconfiguration

In default NGINX proxy mode, NGINX closes the TCP connection to the upstream after every request. At low traffic, this is negligible. Under load:

- Every request requires a new TCP handshake to the backend
- After each connection closes, the socket enters `TIME_WAIT` state for 60 seconds (default)
- Under sustained traffic, thousands of `TIME_WAIT` sockets accumulate on the NGINX host
- Ephemeral ports (typically 32768–60999) get exhausted — NGINX literally cannot open new connections
- New connections fail immediately, producing 502s

Even before port exhaustion, the TCP handshake overhead places a heavier "connect load" on backend workers. A backend that handles 500 req/s with keepalive enabled may fail at 200 req/s without it — because workers spend CPU accepting connections instead of processing requests.

### 3. Backend timeout under garbage collection

Common in Python, Ruby, and Java apps. GC pauses the application process. If the worker is single-threaded, it stops calling `accept()` on the socket. NGINX connects (TCP handshake completes at kernel level), writes the request, and waits. The kernel buffer fills. Eventually NGINX hits its timeout or the backend sends a partial RST. You get a 502, not a 504, because the connection was technically established before it broke.

Increasing `proxy_read_timeout` masks this symptom without fixing the GC problem.

### 4. CPU steal time in virtualized environments

On shared VMs, high CPU steal time (`%st` in `top`) means the hypervisor is not scheduling your VM's CPU. The backend kernel accepts TCP connections, but the app process can't run to read from the socket. NGINX writes to a full socket buffer, the write times out or resets, and you get a 502. This is worth checking early — `top` will show it.

---

## Diagnostic workflow

Don't just read the logs. Trace the connection state.

### Step 1 — Check the NGINX error log for the specific message

```bash
tail -f /var/log/nginx/error.log | grep upstream
```

The message tells you which failure mode you're in:

| Message | Likely cause |
|---|---|
| `upstream prematurely closed connection` | Backlog overflow, worker death, RST from backend |
| `connect() failed (111: Connection refused)` | Backend port closed, process crashed |
| `no live upstreams while connecting` | All servers in upstream block marked down |
| `upstream timed out (110: Operation timed out)` | Backend accepted connection but never processed it |

### Step 2 — Bypass NGINX and hit the backend directly under load

```bash
# 200 requests, 50 concurrent — directly to backend port
ab -n 200 -c 50 http://127.0.0.1:8000/health
```

If you see `Connection Reset by Peer` here, the backend is overflowing its listen queue before NGINX is even involved. NGINX is the messenger, not the cause.

### Step 3 — Check the listen queue (the smoking gun)

```bash
# Is the app keeping up with connections?
ss -lnt sport = :8000
```

Look at the `Recv-Q` column. For a listening socket, `Recv-Q` shows the current backlog size. If it's non-zero and growing, the app is not calling `accept()` fast enough.

```bash
# Is the listen queue overflowing? Run this twice.
netstat -s | grep -i "listen"
# "X times the listen queue of a socket overflowed"
# If the number increases between runs — that's your root cause.
```

A climbing overflow counter confirms that the kernel is rejecting connections. NGINX is receiving RSTs and converting them to 502s.

### Step 4 — Check TIME_WAIT accumulation

```bash
# On the NGINX host — how many connections are in TIME_WAIT to the backend port?
ss -tan state time-wait dst :8000 | wc -l
```

If this number is in the thousands, you're either close to or already experiencing ephemeral port exhaustion. Check the available range:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
# Default: 32768 60999 → ~28,000 ports available
```

If TIME_WAIT count approaches that range and traffic is sustained, NGINX will start failing to open new connections entirely.

### Step 5 — Check backend worker concurrency math

This is the calculation most people skip:

```
Max backend throughput ≈ (workers × worker_connections) / avg_request_duration_seconds
```

Example: 8 Gunicorn sync workers, requests averaging 200ms each:
```
8 workers / 0.2s = 40 req/s max
```

If you're sending 200 req/s at that backend, the backlog will overflow. No NGINX tuning fixes a backend that is fundamentally undersized for the load.

---

## Real production incident

**Setup:** E-commerce site, NGINX proxying to Django on Gunicorn. During a flash sale, error rate hit 15% (502). Static assets loaded fine. Only the cart API failed.

**Logs:** `upstream prematurely closed connection` flooding error.log.

**Health check:** `curl http://127.0.0.1:8000/api/health` → `200 OK` immediately. The on-call engineer thought the backend was fine.

**What `netstat -s` showed:** The listen queue overflow counter was incrementing at ~300/second.

**Root cause:** Gunicorn was configured with `--workers=8` using sync workers. The cart API made a synchronous call to a legacy payment gateway averaging 3 seconds. Effective throughput: `8 / 3 = 2.6 req/s`. Traffic during the sale: 50 req/s.

NGINX accepted 50 connections. Established TCP to 8 Gunicorn workers. The remaining 42 went into the kernel listen backlog. `net.core.somaxconn` was the default 128, but the Gunicorn sync worker capped the accept queue much lower. The backlog overflowed. Kernel sent RSTs. NGINX returned 502s.

**The backend health check passed because a single `curl` request never overflowed the queue.** Under load, the queue was permanently saturated.

**Fix:**

1. **Immediate:** Scaled Gunicorn to 16 workers (bought time, didn't solve the architecture problem)
2. **Permanent:** Switched to `gevent` async workers with `--worker-connections=1000` — 8 workers handling 1000 concurrent greenlets each
3. **Kernel tuning:** `net.core.somaxconn` set to 4096

502 errors dropped to zero within 30 seconds of the worker type change. NGINX configuration was never the problem.

---

## NGINX configuration fixes

After verifying the backend can handle the load, these NGINX changes prevent the proxy layer from making the problem worse.

### Enable upstream keepalive

The single highest-impact change for preventing 502s under load:

```nginx
upstream backend {
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
    keepalive 32;         # cache up to 32 idle connections to the upstream group
    least_conn;           # route to the backend with fewest active connections
}

server {
    location / {
        proxy_pass          http://backend;
        proxy_http_version  1.1;            # required for keepalive to function
        proxy_set_header    Connection "";  # required — clears the "close" header from HTTP/1.0
        proxy_set_header    Host $host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
    }
}
```

**Why `proxy_http_version 1.1` is non-negotiable:** NGINX defaults to HTTP/1.0 for proxying. HTTP/1.0 closes the connection after every request regardless of `keepalive`. Without `proxy_http_version 1.1` and `proxy_set_header Connection ""`, the `keepalive 32` directive does nothing. This is the most common misconfiguration in NGINX reverse proxy setups.

### Set realistic proxy timeouts

```nginx
proxy_connect_timeout  3s;   # fail fast if backend can't accept a connection
proxy_send_timeout     10s;  # time to transmit the request
proxy_read_timeout     30s;  # time between successive read operations from backend
```

Don't set `proxy_read_timeout` to 120s to "stop 502 errors." If the backend takes 120s to respond, you have an architecture problem — offload to a job queue. A high timeout just means failed connections hold worker slots for longer, making the cascade worse.

`proxy_connect_timeout` should be low. If the backend is at 100% CPU, it may take seconds to accept a new TCP connection. A short connect timeout fails fast and triggers `proxy_next_upstream` to try the next server.

### Configure retry behavior

```nginx
proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 2;
proxy_next_upstream_timeout 5s;
```

With multiple backends in the upstream block, this tells NGINX to retry on 502 rather than returning the error immediately. `proxy_next_upstream_tries 2` limits retries to prevent amplification if the entire upstream pool is struggling.

### Add upstream health tracking parameters

```nginx
upstream backend {
    server 10.0.0.1:8000 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:8000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

`max_fails=3` marks a server as down after 3 consecutive failures. `fail_timeout=30s` keeps it marked down for 30 seconds before retrying. Without these, NGINX continues sending traffic to a backend that's overloaded.

### Use `least_conn` for unequal backends

Default round-robin distributes requests equally regardless of how long they take. If one backend is slower (GC pause, noisy VM neighbor), it accumulates more connections. `least_conn` routes new requests to the backend with the fewest active connections:

```nginx
upstream backend {
    least_conn;
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
    keepalive 32;
}
```

---

## Kernel tuning for high-traffic deployments

These kernel settings directly affect the connection boundary between NGINX and the backend.

```bash
# Increase the maximum listen backlog
sysctl -w net.core.somaxconn=4096

# Increase TCP SYN backlog
sysctl -w net.ipv4.tcp_max_syn_backlog=4096

# Reuse TIME_WAIT sockets for new connections (reduces port exhaustion)
sysctl -w net.ipv4.tcp_tw_reuse=1

# Allow faster reuse of local ports
sysctl -w net.ipv4.ip_local_port_range="10000 65000"
```

Make permanent by adding to `/etc/sysctl.d/99-nginx.conf`:

```bash
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000
```

**Important:** `net.core.somaxconn` caps the maximum listen backlog. Even if you configure Gunicorn with `--backlog=2048`, the kernel silently clamps it to `somaxconn`. Setting `somaxconn=128` (the default on many systems) means your application's backlog setting is irrelevant above that value.

---

## Common mistakes that make 502s worse

**Disabling `proxy_buffering`:** Some articles recommend `proxy_buffering off` for latency. Under load, this ties up a backend connection for the entire duration of the client receiving the response. Slow clients directly hold backend worker slots. For normal request-response APIs, keep buffering on.

**Setting `proxy_read_timeout` very high:** This doesn't fix 502s. It converts them to 504s and makes your worker slots queue for longer, worsening the cascade. Fix the underlying slowness instead.

**Ignoring `net.core.somaxconn`:** The single most common kernel oversight in NGINX tuning guides. If it's 128, every other backlog setting is irrelevant above 128 connections.

**Using round-robin with unequal backends:** One slow node drains its accept queue while NGINX keeps sending equal traffic. Switch to `least_conn`.

**Health check that doesn't reflect real load:** A health check endpoint that returns 200 in 10ms doesn't prove the backend can handle production load. The health check bypasses the queue. Test with `ab` or `wrk` directly to the backend under load.

---

## Diagnostic checklist

Run in this order when 502s fire:

```bash
# 1. Is the backend process running?
systemctl status gunicorn

# 2. Can you connect directly?
curl -sv http://127.0.0.1:8000/health

# 3. Is the listen queue overflowing? (run twice, check if number increases)
netstat -s | grep -i "overflowed"

# 4. Is Recv-Q > 0 on the backend socket?
ss -lnt sport = :8000

# 5. TIME_WAIT accumulation on NGINX host?
ss -tan state time-wait dst :8000 | wc -l

# 6. Is NGINX hitting worker_connections limit?
nginx -T | grep worker_connections
cat /var/log/nginx/error.log | grep "worker_connections"

# 7. Verify keepalive is actually configured
nginx -T | grep -A5 "upstream"
```

---

## Related

- [NGINX Upstream Keepalive: Why Missing It Causes 502 Errors Under Load](/blog/nginx-upstream-keepalive)
- [NGINX Rate Limiting Configuration](/blog/nginx-rate-limiting-config)
- [NGINX Troubleshooting Guide](/blog/nginx-troubleshooting-guide)
- [ss vs netstat: Check Open Ports and Connections in Linux](/blog/check-open-ports-linux-ss-netstat-guide)
- [Linux TIME_WAIT Explained: What It Is and When to Worry](/blog/linux-time-wait-explained)