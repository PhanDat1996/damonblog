---
title: "NGINX 502 Bad Gateway: Find the Cause, Fix It, and Stop It Under Load"
seoTitle: "NGINX 502 Bad Gateway: Causes and Fixes"
date: "2026-04-22"
updated: "2026-11-05"
excerpt: "NGINX returning 502 Bad Gateway? Match the error-log line to its cause (dead upstream, wrong socket, SELinux), then fix 502s that only appear under load."
tags: ["nginx", "troubleshooting", "debugging", "production", "linux", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

The browser shows `502 Bad Gateway` and the footer says `nginx`. It's tempting to restart NGINX, but NGINX is usually the healthy part here. A 502 is NGINX telling you that the thing **behind** it (your app, PHP-FPM, a container, another proxy) refused the connection, hung up mid-response, or sent back something that isn't valid HTTP.

The good news: NGINX writes the exact reason to its error log, and each message maps to a small set of causes. Read the line, look it up below, fix that one thing.

If `curl` to the backend works and the 502s only show up during traffic peaks, the cause is capacity, not a broken app. Read the error line first anyway, then go to [502s that only happen under load](#502s-that-only-happen-under-load).

> **Lab-tested:** every error line and load result below was reproduced on NGINX 1.28.3, Ubuntu 26.04 (kernel 7.0): single requests against a small Python backend that fails on purpose, and `ab` driving load through NGINX to a deliberately slow backend. Where the lab result differed from common advice, the post says so. One example: **a full accept queue mostly produces 504s, not 502s.**

---

## Step 1: Get the exact error line

```bash
# Where is the error log? (don't assume /var/log/nginx/error.log)
nginx -T 2>/dev/null | grep -E '^\s*error_log'

# Last upstream-related errors
grep -E 'upstream|connect\(\)|recv\(\)' /var/log/nginx/error.log | tail -n 20
```

A typical line looks like this:

```
2026/10/28 09:14:02 [error] 2187#2187: *4410 connect() failed (111: Connection refused) while connecting to upstream, client: 203.0.113.7, server: app.example.com, request: "GET /api/orders HTTP/1.1", upstream: "http://127.0.0.1:8080/api/orders", host: "app.example.com"
```

Two fields matter: the **errno and message** (`111: Connection refused`) and the **upstream** address NGINX actually tried (`http://127.0.0.1:8080`). Check that address first. A surprising number of 502s come from NGINX proxying to a port or socket that isn't the one you think.

Then test that exact upstream yourself, from the NGINX host:

```bash
curl -sv http://127.0.0.1:8080/ -o /dev/null
```

---

## Step 2: Look up the message

| Error log message | What it means | Where to look |
|---|---|---|
| `connect() failed (111: Connection refused) while connecting to upstream` | Nothing is listening on that IP:port | App down, wrong port, app bound to a different address |
| `connect() to unix:/run/php/php8.2-fpm.sock failed (2: No such file or directory)` | Socket path doesn't exist | PHP-FPM not running, or version/path mismatch |
| `connect() to unix:... failed (13: Permission denied)` | NGINX user can't open the socket | `listen.owner`/`listen.group` in the FPM pool |
| `connect() to 127.0.0.1:8080 failed (13: Permission denied)` | SELinux blocked the outbound connection (RHEL family) | `httpd_can_network_connect` boolean |
| `connect() to unix:... failed (11: Resource temporarily unavailable)` | Socket backlog full, FPM can't keep up | `pm.max_children`, slow PHP requests |
| `upstream prematurely closed connection while reading response header` | Upstream accepted, then closed without answering | App crash, worker killed (OOM, worker timeout), keepalive timeout mismatch |
| `recv() failed (104: Connection reset by peer) while reading response header` | Upstream reset the connection | Same as above |
| `upstream sent invalid header: "X-Bad\x20..." while reading response header` | A response header line is malformed | The app or a middleware writing a broken header (spaces in the name, bare LF) |
| `upstream sent no valid HTTP/1.0 header while reading response header` | The reply isn't HTTP at all | Wrong protocol on that port. **Not a 502**: see the lab section below |
| `upstream sent too big header while reading response header` | Response headers exceed the buffer | Large cookies or auth headers, raise `proxy_buffer_size` |
| `SSL_do_handshake() failed ... while SSL handshaking to upstream` | TLS to an HTTPS upstream failed | Missing SNI: `proxy_ssl_server_name on` |
| `no live upstreams while connecting to upstream` | Every server in the `upstream` block is marked failed | The *earlier* errors in the log are the real cause |
| `connect() failed (104: Connection reset by peer) while connecting to upstream` | Reset during connect | Backend accept queue full with `tcp_abort_on_overflow=1`, see [under load](#why-502s-appear-specifically-under-load) |
| `connect() failed (99: Cannot assign requested address)` | NGINX host ran out of ephemeral ports | No upstream keepalive, see [under load](#why-502s-appear-specifically-under-load) |

### Not actually a 502

Three messages people often chase while debugging 502s produce different status codes:

- `upstream timed out (110: Connection timed out) while reading response header from upstream` returns **504 Gateway Timeout**. The upstream is alive but too slow. Tune `proxy_read_timeout` only after you know *why* it's slow.
- `upstream timed out (110: Connection timed out) while connecting to upstream` is also a **504**. Under load it usually means the backend's accept queue is full: check `nstat -az TcpExtListenOverflows` on the backend host.
- `worker_connections are not enough` is NGINX's own connection limit. The request fails with a 500, not a 502. Raise `worker_connections` (and the open-files limit, see below).

Under load you often see both. 504s point at slowness and queueing. 502s point at something actively closing or refusing connections: a killed worker, a reset, or NGINX itself failing to open a socket.

---

## Fix by cause

### Nothing listening (111: Connection refused)

```bash
systemctl status myapp
ss -ltnp 'sport = :8080'
```

If `ss` prints nothing, the app isn't listening: start it and read its own logs to see why it stopped. If it *is* listening, compare the address:

- **App on `127.0.0.1`, NGINX proxying to the server's LAN IP** (or the reverse). The port is open on one address only.
- **`proxy_pass http://localhost:8080`**. `localhost` can resolve to both `::1` and `127.0.0.1`. If the app listens on IPv4 only, NGINX logs refused errors for `[::1]:8080` before falling back. Use `127.0.0.1` explicitly.
- **NGINX in a container.** `127.0.0.1` inside the NGINX container is the NGINX container itself, not the host or your app container. Use the service name on a shared Docker network (see [Docker networking](/blog/docker-networking-guide)).

### PHP-FPM socket errors (2, 13, 11)

```bash
ls -l /run/php/                    # Debian/Ubuntu; RHEL uses /run/php-fpm/
grep -E '^\s*listen' /etc/php/*/fpm/pool.d/www.conf
nginx -T 2>/dev/null | grep fastcgi_pass
```

- **2 (No such file):** the `fastcgi_pass` path doesn't match the pool's `listen`. Common after a PHP upgrade (`php8.1-fpm.sock` → `php8.3-fpm.sock`).
- **13 (Permission denied):** set `listen.owner` and `listen.group` in the pool to the user NGINX runs as (`www-data` on Debian/Ubuntu, `nginx` on RHEL), then restart PHP-FPM.
- **11 (Resource temporarily unavailable):** every FPM child is busy and the socket backlog is full. The FPM log usually says `server reached pm.max_children setting`. Raising `pm.max_children` helps only if you have the RAM. Slow requests are the more common root cause.

### SELinux (13 on a TCP upstream)

On RHEL, Rocky, Alma and Fedora, NGINX is confined and can't open arbitrary outbound connections by default:

```bash
getenforce
ausearch -m avc -ts recent | grep nginx
setsebool -P httpd_can_network_connect 1
```

Don't disable SELinux to fix this. The boolean is the intended switch.

### Upstream closed or reset the connection

`upstream prematurely closed connection` and `104: Connection reset by peer` mean the TCP connection worked but the app went away before sending a full response header. Look at the **app side** at the same timestamp:

```bash
journalctl -u myapp --since "10 min ago"
dmesg -T | grep -iE 'killed process|out of memory'
```

Typical causes:

- The app crashed or threw an unhandled error on that request.
- The worker was killed: the OOM killer, or the app server's own timeout (Gunicorn kills a worker after 30 seconds by default and logs `WORKER TIMEOUT`).
- **Keepalive timeout mismatch.** NGINX reuses an idle upstream connection that the app already closed. If the app's keepalive timeout is shorter than NGINX's upstream `keepalive_timeout` (60s by default), you get rare, random 502s. See [upstream keepalive](/blog/nginx-upstream-keepalive).

### Invalid header

`upstream sent invalid header` means the response *was* HTTP, but one header line broke the rules. In the lab, a single line `X-Bad Header: yes` (a space inside the header name) was enough:

```
upstream sent invalid header: "X-Bad\x20..." while reading response header from upstream
```

NGINX quotes the start of the offending line, so the fix is usually obvious: find where the app or a middleware builds that header.

### Wrong protocol on the upstream port

Pointing `proxy_pass http://` at a port that speaks something else does **not** always produce a 502, and it doesn't produce `invalid header` either. In the lab:

| Upstream on that port | What NGINX logged | What the client got |
|---|---|---|
| A TLS server (Python `ssl`) | `recv() failed (104: Connection reset by peer)` | **502** |
| Another NGINX `listen ... ssl` | nothing in the error log | **400** "The plain HTTP request was sent to HTTPS port" |
| Something that answers with non-HTTP bytes | `upstream sent no valid HTTP/1.0 header` | A broken response. The access log shows status **009** (NGINX passed it through as HTTP/0.9) and `curl` reports `000` |

So if users see 400s or broken pages instead of 502s, still check the scheme and port in `proxy_pass`:

```nginx
proxy_pass https://127.0.0.1:8443;    # backend speaks TLS
fastcgi_pass 127.0.0.1:9000;          # PHP-FPM speaks FastCGI, not HTTP
```

`curl -v http://127.0.0.1:<port>/` shows what the port actually returns.

### Too big header

Apps that set large cookies or long auth headers overflow the default buffer (one memory page, 4k or 8k):

```nginx
proxy_buffer_size   16k;
proxy_buffers       8 16k;
# PHP-FPM equivalent:
fastcgi_buffer_size 16k;
fastcgi_buffers     8 16k;
```

### HTTPS upstream

When `proxy_pass` points to an HTTPS host (a cloud load balancer, a CDN, another vhost), NGINX doesn't send SNI by default. Many upstreams reject the handshake without it:

```nginx
location / {
    proxy_pass https://api.internal.example.com;
    proxy_ssl_server_name on;
    proxy_set_header Host api.internal.example.com;
}
```

### No live upstreams

This message is a consequence, not a cause. With the defaults (`max_fails=1`, `fail_timeout=10s`), one failed attempt marks a server unavailable for 10 seconds. In the lab, an upstream with two dead servers produced this sequence on the **first** request:

```
[error] connect() failed (111: Connection refused) while connecting to upstream, ... upstream: "http://127.0.0.1:9011/nolive"
[warn]  upstream server temporarily disabled while connecting to upstream, ... upstream: "http://127.0.0.1:9011/nolive"
[error] connect() failed (111: Connection refused) while connecting to upstream, ... upstream: "http://127.0.0.1:9012/nolive"
[warn]  upstream server temporarily disabled while connecting to upstream, ... upstream: "http://127.0.0.1:9012/nolive"
```

and on the **second** request, without trying either server:

```
[error] no live upstreams while connecting to upstream, ... upstream: "http://nolive/nolive"
```

Note the `upstream:` field switches from a real address to the upstream block's name. Scroll up to the first `111`/`104`/timeout for that upstream. That's the one to fix. The `[warn]` lines only appear if `error_log` is at `warn` or lower.

---

## Error lines reproduced in the lab

Each scenario below was one `curl` against NGINX 1.28.3, with a backend built to fail in that specific way. Exact error-log lines (client/server fields trimmed):

| Backend behavior | Error log | Level | Client got |
|---|---|---|---|
| Nothing listening on the port | `connect() failed (111: Connection refused) while connecting to upstream` | `[error]` | 502 |
| Reads the request, closes without answering | `upstream prematurely closed connection while reading response header from upstream` | `[error]` | 502 |
| Reads the request, closes with RST | `recv() failed (104: Connection reset by peer) while reading response header from upstream` | `[error]` | 502 |
| 16 KiB `Set-Cookie` header | `upstream sent too big header while reading response header from upstream` | `[error]` | 502 |
| Unix socket path doesn't exist | `connect() to unix:/run/lab502/missing.sock failed (2: No such file or directory)` | **`[crit]`** | 502 |
| Unix socket mode `600`, owned by another user | `connect() to unix:/run/lab502/perm.sock failed (13: Permission denied)` | **`[crit]`** | 502 |

Two things worth knowing from these runs:

- **Socket errors are logged at `[crit]`, not `[error]`.** A dashboard or alert that filters on `[error]` misses the classic PHP-FPM socket 502s. Grep for the message, not the level.
- **`$upstream_connect_time` tells refused from closed.** With a log format that includes it, the access log showed `uct=-` for refused connections and socket errors (no connection was ever made) and `uct=0.000` for the close/reset cases (connected fine, then failed):

```nginx
log_format upstream_debug '$remote_addr "$request" $status upstream=$upstream_addr '
                          'ustatus=$upstream_status rt=$request_time '
                          'uct=$upstream_connect_time urt=$upstream_response_time';
```

```
127.0.0.1 "GET /down HTTP/1.1" 502 upstream=127.0.0.1:9001 ustatus=502 rt=0.000 uct=- urt=0.000
127.0.0.1 "GET /close HTTP/1.1" 502 upstream=127.0.0.1:9002 ustatus=502 rt=0.000 uct=0.000 urt=0.000
```

---

## 502s that only happen under load

If the backend answers `curl` fine and 502s appear only during traffic peaks, the cause is usually capacity at the connection layer: the backend's accept queue overflowing, workers being killed, or NGINX running out of local ports (`99: Cannot assign requested address`).

You're on a call at 3 AM. The dashboard is red, users are seeing 502s, and the NGINX error log is full of `upstream prematurely closed connection while reading response header`. You `curl` the backend directly and it responds fine. But under load, the 502s keep coming.

The standard definition of a 502 ("invalid response from upstream") is useless here. Under load, the root cause is rarely a broken application. It's resource contention between NGINX's connection handling and the backend's ability to process requests at scale.

The short version:

```
502 under load ≠ app is broken
502 under load = connection boundary failure between NGINX and backend

Most common causes:
1. Backend can't keep up: accept queue overflows, workers get killed
   mid-request (OOM, app-server worker timeout)
2. No upstream keepalive → a new TCP connection per request
3. Ephemeral port exhaustion on the NGINX host
   (error log: "99: Cannot assign requested address")
4. Worker pool undersized for actual concurrency

Fastest diagnostic:
  nstat -az TcpExtListenOverflows   # climbing number = smoking gun
  ss -lnt sport = :8000             # Recv-Q near Send-Q = app not keeping up
```

---

## Why 502s appear specifically under load

A server that handles 100 req/s cleanly can collapse into 502s at 500 req/s. The load doesn't just slow things down. It changes the failure mode of the TCP stack and of the app server.

### 1. Backend saturation and listen backlog overflow

This is the dominant root cause in high-traffic environments, and the one most engineers miss.

Application servers (Gunicorn, Unicorn, Puma, PHP-FPM) have a fixed number of workers. When traffic exceeds what those workers can handle:

1. Workers are all busy, so nobody calls `accept()` on the listening socket.
2. The kernel completes TCP handshakes on its own and parks them in the **accept queue**. Its size is the app's backlog, capped by `net.core.somaxconn`.
3. When the queue is full, Linux by default **drops** new SYNs and the final ACK of handshakes. NGINX's `connect()` stalls while the kernel retransmits. That shows up as slow connects and, once `proxy_connect_timeout` expires, as 504s.
4. With `net.ipv4.tcp_abort_on_overflow=1`, the kernel resets some connections instead. In the lab that showed up as `connect() failed (104: Connection reset by peer) while connecting to upstream` and a 502, but only for a small share of requests: most still ended as 504s, because new SYNs are still dropped while the queue is full.
5. Meanwhile, requests that did get a worker are taking longer and longer. App-server watchdogs kill the slow ones (Gunicorn's default `--timeout` is 30 seconds), and every request on a killed worker becomes `upstream prematurely closed connection` → 502.

This is why `curl` to the backend passes fine: a single request never fills the queue.

### 2. Upstream keepalive misconfiguration

On NGINX versions before 1.29.7, NGINX proxies with HTTP/1.0 and closes the upstream connection after every request unless you configure keepalive. (1.29.7 made keepalive to upstreams the default. Most distro packages are older, so check `nginx -v`.) At low traffic, this is negligible. Under load:

- Every request requires a new TCP handshake to the backend
- Every closed connection leaves a socket in `TIME_WAIT` for 60 seconds on whichever side closed first
- When those pile up on the NGINX host, the ephemeral ports for that backend IP:port (typically 32768–60999, about 28,000) run out
- New connections fail immediately with `connect() failed (99: Cannot assign requested address)`, producing 502s

Even before port exhaustion, the handshake overhead places a heavier "connect load" on backend workers, which spend time accepting connections instead of processing requests.

### 3. Garbage collection pauses

Common in Python, Ruby, and Java apps. A GC pause stops the worker from calling `accept()` or reading requests. The kernel keeps accepting handshakes until the queue fills (cause 1), and in-flight requests stall. Stalls past `proxy_read_timeout` are 504s. Stalls past the app server's own worker timeout get the worker killed, and those are 502s.

Increasing `proxy_read_timeout` masks this symptom without fixing the GC problem.

### 4. CPU steal time in virtualized environments

On shared VMs, high CPU steal time (`%st` in `top`) means the hypervisor isn't scheduling your VM's CPU. The kernel still accepts connections, but the app can't run to process them, so you land in cause 1 with less traffic than you'd expect. It's worth checking early, and `top` will show it.

---

## Diagnose 502s under load

Don't just read the logs. Trace the connection state.

### Step 1: Read the error message

The message tells you which failure mode you're in. Look it up in the [table above](#step-2-look-up-the-message): `prematurely closed` and `104` point at killed or overloaded workers, `99` at port exhaustion on the NGINX host, and a connect timeout (504) at a full accept queue.

### Step 2: Bypass NGINX and hit the backend directly under load

```bash
# 200 requests, 50 concurrent, directly to backend port
ab -n 200 -c 50 http://127.0.0.1:8000/health
```

If you see `Connection reset by peer` or long connect times here, the backend is overloaded before NGINX is even involved. NGINX is the messenger, not the cause. Only load-test systems you own, and preferably not production at peak.

### Step 3: Check the listen queue (the smoking gun)

```bash
# Is the app keeping up with connections?
ss -lnt sport = :8000
# State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port
# LISTEN  128     128     0.0.0.0:8000        0.0.0.0:*
```

For a listening socket, `Recv-Q` is the number of connections waiting in the accept queue and `Send-Q` is the queue's maximum. `Recv-Q` at or near `Send-Q` means the app isn't calling `accept()` fast enough.

```bash
# Is the listen queue overflowing? Run this twice.
nstat -az TcpExtListenOverflows TcpExtListenDrops
# or: netstat -s | grep -i listen
# "X times the listen queue of a socket overflowed"
# If the number increases between runs, that's your root cause.
```

A climbing overflow counter confirms that the kernel is dropping connections because the app can't keep up.

### Step 4: Check TIME_WAIT accumulation

```bash
# On the NGINX host: how many connections to the backend port are in TIME_WAIT?
ss -Htan state time-wait '( dport = :8000 )' | wc -l
```

If this number is in the thousands, you're close to or already experiencing ephemeral port exhaustion. Check the available range:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
# Default: 32768 60999 → ~28,000 ports per destination IP:port
```

If the TIME_WAIT count approaches that range and traffic is sustained, NGINX will start failing to open new connections, with `99: Cannot assign requested address` in the error log. [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained) covers why these sockets exist and which tunables are safe.

### Step 5: Check backend worker concurrency math

This is the calculation most people skip:

```
Max backend throughput ≈ (workers × concurrency per worker) / avg_request_duration_seconds
```

Example: 8 Gunicorn sync workers (concurrency 1 each), requests averaging 200ms:
```
8 / 0.2s = 40 req/s max
```

If you're sending 200 req/s at that backend, the backlog will overflow. No NGINX tuning fixes a backend that is fundamentally undersized for the load.

---

## A typical scenario

**Setup:** NGINX proxying to Django on Gunicorn. During a sales event, the error rate climbs and the 502s are all on the cart API. Static assets load fine.

**Logs:** `upstream prematurely closed connection` flooding error.log, and `WORKER TIMEOUT` in the Gunicorn log.

**Health check:** `curl http://127.0.0.1:8000/api/health` → `200 OK` immediately, so it looks like the backend is fine.

**What `nstat` shows:** `TcpExtListenOverflows` climbing every second.

**Root cause:** Gunicorn runs `--workers=8` with sync workers. The cart API makes a synchronous call to a payment gateway that averages 3 seconds. Effective throughput: `8 / 3 ≈ 2.7 req/s`. Traffic during the sale: 50 req/s.

Eight requests get a worker. The rest queue in the kernel's accept queue (Gunicorn asks for a backlog of 2048, but the kernel clamps it to `net.core.somaxconn`). The queue fills and new connections stall. Requests stuck behind slow payment calls hit Gunicorn's 30-second timeout, the workers are killed, and NGINX returns 502 for every request those workers were holding.

**The backend health check passes because a single `curl` request never fills the queue.** Under load, the queue is permanently saturated.

**Fix:**

1. **Immediate:** scale Gunicorn workers. It buys time but doesn't solve the architecture problem.
2. **Permanent:** switch the I/O-bound endpoint to async workers (`gevent` with `--worker-connections=1000`), or move the slow payment call to a background job.
3. **Kernel tuning:** raise `net.core.somaxconn` so short bursts queue instead of dropping.

NGINX configuration was never the problem.

---

## NGINX configuration fixes for high traffic

After verifying the backend can handle the load, these NGINX changes prevent the proxy layer from making the problem worse.

### Enable upstream keepalive

The single highest-impact change for preventing 502s under load:

```nginx
upstream backend {
    least_conn;           # balancing method goes BEFORE keepalive (required before 1.29.7)
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
    keepalive 32;         # idle connections cached per worker process
}

server {
    location / {
        proxy_pass          http://backend;
        proxy_http_version  1.1;            # required for keepalive before NGINX 1.29.7
        proxy_set_header    Connection "";  # removes the "Connection: close" NGINX sends by default
        proxy_set_header    Host $host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
    }
}
```

**Why `proxy_http_version 1.1` matters:** before 1.29.7, NGINX defaults to HTTP/1.0 for proxying and sends `Connection: close` on every upstream request. Without `proxy_http_version 1.1` and `proxy_set_header Connection ""`, the `keepalive 32` directive does nothing. This is the most common misconfiguration in NGINX reverse proxy setups. On 1.29.7 and later both are the default behavior, and setting them explicitly is harmless. [NGINX Upstream Keepalive](/blog/nginx-upstream-keepalive) covers the details, including the timeout mismatch that causes its own 502s.

### Set realistic proxy timeouts

```nginx
proxy_connect_timeout  3s;   # fail fast if backend can't accept a connection
proxy_send_timeout     10s;  # max time between two writes of the request
proxy_read_timeout     30s;  # max time between two reads from the backend
```

Don't set `proxy_read_timeout` to 120s to "stop 502 errors." If the backend takes 120s to respond, you have an architecture problem, so offload the work to a job queue. A high timeout just means stuck requests hold connections and worker slots for longer, making the cascade worse.

`proxy_connect_timeout` should be low. When the backend's accept queue is full, connects stall in SYN retransmits. A short connect timeout fails fast and lets `proxy_next_upstream` try the next server.

### Configure retry behavior

```nginx
proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 2;
proxy_next_upstream_timeout 5s;
```

With multiple backends in the upstream block, this tells NGINX to retry on another server instead of returning the error immediately. `proxy_next_upstream_tries 2` limits retries to prevent amplification if the entire pool is struggling. Since NGINX 1.9.13, non-idempotent requests (POST, PATCH) are **not** retried once they've been sent to an upstream, unless you add `non_idempotent`. Only add it if a duplicated request is harmless for your app.

### Tune upstream failure tracking

```nginx
upstream backend {
    server 10.0.0.1:8000 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:8000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

`max_fails=3 fail_timeout=30s` marks a server unavailable for 30 seconds after 3 failed attempts within 30 seconds. The defaults are `max_fails=1` and `fail_timeout=10s`, which means a single failure takes a server out for 10 seconds. That's aggressive with two backends under load, where it can quickly lead to `no live upstreams`. What counts as a failure is defined by `proxy_next_upstream`.

### Use `least_conn` for unequal backends

Default round-robin distributes requests equally regardless of how long they take. If one backend is slower (GC pause, noisy VM neighbor), it accumulates more in-flight requests. `least_conn` routes new requests to the backend with the fewest active connections:

```nginx
upstream backend {
    least_conn;
    server 10.0.0.1:8000;
    server 10.0.0.2:8000;
    keepalive 32;
}
```

### NGINX's own connection limits

```nginx
worker_rlimit_nofile 65535;
events {
    worker_connections 8192;
}
```

Each proxied request uses two connections (client and upstream), so `worker_connections` must cover both. If the error log shows `Too many open files`, see [Too Many Open Files on Linux](/blog/too-many-open-files-linux-fix).

Many of these mistakes (missing SNI on HTTPS upstreams, `localhost` in `proxy_pass`, keepalive without its required headers) are visible in the config itself. Paste yours into the [NGINX Config Analyzer](/tools/nginx-config-analyzer) to catch them before the next incident.

---

## What the load lab showed

### Accept queue overflow: 504s, not 502s

Backend: 2 worker threads, 0.5 s per request, `listen()` backlog 8. NGINX with `proxy_connect_timeout 3s`. Load: `ab -n 300 -c 60` through NGINX.

| `tcp_abort_on_overflow` | `ListenOverflows` during the run | 200 | 502 | 504 |
|---|---|---|---|---|
| `0` (default) | +928 | 104 | 0 | 196 |
| `1` | +853 | 96 | 8 | 196 |

The error log for the default run had exactly one message, 196 times:

```
upstream timed out (110: Connection timed out) while connecting to upstream
```

and the access log shows the failed requests waited exactly the connect timeout, with no connection ever made (`uct=-`):

```
127.0.0.1 "GET / HTTP/1.0" 504 upstream=127.0.0.1:9100 ustatus=504 rt=3.001 uct=- urt=3.001
```

With `tcp_abort_on_overflow=1`, 8 requests turned into fast 502s (`connect() failed (104: Connection reset by peer) while connecting to upstream`), and the other 196 failures were still 504s.

**What this means for diagnosis:** if your monitoring only alerts on 502, an overloaded backend can be failing a large share of requests as 504 while the 502 graph stays flat. Watch both, and watch `nstat -az TcpExtListenOverflows` on the backend host.

### Port exhaustion: reproduced, and keepalive fixed it

To make exhaustion reproducible, the ephemeral port range was narrowed to 100 ports (`40000-40099`) and NGINX proxied without upstream keepalive. `ab -k -n 2000 -c 20`:

| Setup | 200 | 502 |
|---|---|---|
| No keepalive, backend closes after each response, `tcp_tw_reuse=0` | 334 | 1666 |
| No keepalive, backend keeps the connection open, `tcp_tw_reuse=0` | 100 | 1900 |
| No keepalive, backend keeps the connection open, `tcp_tw_reuse=2` (Ubuntu default) | 100 | 1900 |
| `keepalive 16` + `proxy_http_version 1.1` + `Connection ""`, `tcp_tw_reuse=0` | 2000 | 0 |

The failures were all the same line:

```
connect() to 127.0.0.1:9202 failed (99: Cannot assign requested address) while connecting to upstream
```

Three takeaways:

- **Successes were capped by the port range.** With 100 ports, roughly 100 requests got through before every port was stuck in `TIME_WAIT` (about 120 `TIME_WAIT` sockets on the NGINX side afterwards). The backend that closed first did a little better because a few of those connections left `TIME_WAIT` on the backend side instead.
- **`tcp_tw_reuse` did not help in a burst.** The default `2` applies to loopback, which this test was, and it still failed the same way: a `TIME_WAIT` socket is only reused once it is at least a second old, and the whole burst took less than that.
- **Upstream keepalive removed the problem entirely**: 2000 requests over 4 established upstream connections. It's the fix, not a mitigation.

Which side closes first mattered less than expected: even with the backend closing after every response, 119 of the 125 `TIME_WAIT` sockets were on the NGINX side.

### Not reproduced: the keepalive timeout race

A backend with a 2-second idle timeout behind NGINX's 60-second upstream `keepalive_timeout` is the textbook setup for random 502s. Sending GET and POST requests at intervals swept around the 2-second mark (280 requests, with and without 25 ms of added loopback delay) produced **zero** errors: NGINX saw each close and logged `client 127.0.0.1 closed keepalive connection` at `info` level before reusing the slot. The race is real on networks with longer latency and lossy paths, but it's rarer than its reputation, so rule out the causes above first.

---

## Kernel tuning for high-traffic deployments

These kernel settings directly affect the connection boundary between NGINX and the backend.

```bash
# Increase the maximum listen backlog (on the BACKEND host)
sysctl -w net.core.somaxconn=4096

# Increase the SYN backlog
sysctl -w net.ipv4.tcp_max_syn_backlog=4096

# Reuse TIME_WAIT sockets for new outgoing connections (on the NGINX host).
# Only reuses sockets at least 1s old; it didn't help a short burst in the lab.
# Upstream keepalive is the real fix.
sysctl -w net.ipv4.tcp_tw_reuse=1

# Widen the ephemeral port range (on the NGINX host)
sysctl -w net.ipv4.ip_local_port_range="10000 65000"
```

Make it permanent in `/etc/sysctl.d/99-nginx.conf`, then load it with `sysctl --system`:

```bash
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000
```

**Important:** `net.core.somaxconn` caps the listen backlog. Even if you configure Gunicorn with `--backlog=2048`, the kernel silently clamps it to `somaxconn`. The default was 128 on kernels before 5.4 (still common on older RHEL/CentOS 7 and Ubuntu 18.04 hosts). Since 5.4 it is 4096. Also, apps read the backlog at startup, so restart the backend after raising it.

Two cautions: `tcp_tw_reuse` only affects outgoing connections, and recent kernels default it to `2` (loopback only), so `1` widens it to all destinations. A wider port range can collide with services listening on ports inside it. Check with `ss -ltn` first.

---

## Common mistakes that make 502s worse

**Disabling `proxy_buffering`:** Some articles recommend `proxy_buffering off` for latency. Under load, this ties up a backend connection for as long as the client takes to receive the response. Slow clients directly hold backend worker slots. For normal request-response APIs, keep buffering on.

**Setting `proxy_read_timeout` very high:** This doesn't fix 502s. Stuck requests hold connections and worker slots for longer, which worsens the cascade. Fix the underlying slowness instead.

**Ignoring `net.core.somaxconn`:** The most common kernel oversight in NGINX tuning guides. If it's 128, every backlog setting above 128 is irrelevant.

**Using round-robin with unequal backends:** One slow node fills its accept queue while NGINX keeps sending it equal traffic. Switch to `least_conn`.

**A health check that doesn't reflect real load:** A health endpoint that returns 200 in 10ms doesn't prove the backend can handle production load. Test with `ab` or `wrk` directly against the backend under load.

---

## Apply the fix safely

```bash
nginx -t && systemctl reload nginx
```

`reload` starts new workers with the new config and lets old ones finish their requests. A failed `nginx -t` leaves the running config untouched.

---

## Quick checklist

1. Find the error log with `nginx -T`, then read the exact message and the `upstream:` address.
2. `curl` that exact address from the NGINX host.
3. Look up the message in the table above. Timeouts are 504s, not 502s.
4. For "closed" or "reset" errors, read the **app's** logs and `dmesg` at the same timestamp.
5. If it only happens under load, run the checks below.

### Under load

Run in this order on the backend and NGINX hosts:

```bash
# 1. Is the backend process running?
systemctl status gunicorn

# 2. Can you connect directly?
curl -sv http://127.0.0.1:8000/health

# 3. Is the listen queue overflowing? (run twice, check if the number increases)
nstat -az TcpExtListenOverflows

# 4. Is Recv-Q near Send-Q on the backend socket?
ss -lnt sport = :8000

# 5. TIME_WAIT accumulation on the NGINX host?
ss -Htan state time-wait '( dport = :8000 )' | wc -l

# 6. Is NGINX hitting its own limits?
nginx -T 2>/dev/null | grep -E "worker_connections|worker_rlimit_nofile"
grep -E "worker_connections are not enough|Too many open files" /var/log/nginx/error.log

# 7. Verify keepalive is actually configured
nginx -T 2>/dev/null | grep -E -A6 "^\s*upstream"
```

To check step 7 without reading the whole dump, paste the output of `nginx -T` into the [NGINX Config Analyzer](/tools/nginx-config-analyzer). It flags upstream blocks with keepalive but no HTTP/1.1, among other things.

---

## FAQ

**Is a 502 an NGINX problem or an application problem?**
Almost always the application or the path to it. NGINX generates the 502 page itself, but only because the upstream refused, reset, or garbled the connection. The exceptions are NGINX config mistakes like the wrong port, a wrong socket path, or proxying HTTP to an HTTPS port.

**Why does curl to the backend work while users get 502s?**
Your single `curl` doesn't reproduce the conditions. Check whether NGINX is using the same address you tested (the `upstream:` field), whether the 502s correlate with traffic peaks, and whether they line up with worker restarts or OOM kills in the app logs.

**What is the difference between 502 and 504 in NGINX?**
502 means the upstream connection failed or the response was invalid. 504 means NGINX connected and waited, but the upstream didn't respond within `proxy_connect_timeout` or `proxy_read_timeout`.

---

## Related

- [NGINX Upstream Keepalive: Stop Port Exhaustion 502s](/blog/nginx-upstream-keepalive)
- [NGINX 504 Gateway Timeout: Find Which Timeout Fired](/blog/nginx-504-gateway-timeout-fix)
- [NGINX Troubleshooting Guide](/blog/nginx-troubleshooting-guide) for other NGINX errors
- [Cannot Connect to Server on Linux](/blog/cannot-connect-to-server-linux-troubleshooting) to check upstream reachability without curl
- [Check Open Ports and Connections in Linux](/blog/check-open-ports-linux)
- [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained)
