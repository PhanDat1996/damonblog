---
title: "NGINX Upstream Keepalive: Stop Port Exhaustion 502s"
date: "2024-11-28"
updated: "2026-10-28"
excerpt: "Configured keepalive in your NGINX upstream but still see TIME_WAIT pile up? The two lines it needs, the timeout trap, and how to verify reuse works."
tags: ["nginx", "infrastructure", "production", "networking", "troubleshooting"]
featured: true
category: "nginx"
---

You added `keepalive 64;` to your upstream block, reloaded NGINX, and ran the load test again. `ss` still shows thousands of sockets in `TIME_WAIT` to the backend, and the 502s with `99: Cannot assign requested address` are still there.

That's the classic outcome, because on most NGINX installs `keepalive` alone does nothing. It needs two more lines in the `location`, and one timeout has to line up with the backend's. This post explains what each piece does, so you can tell from the config whether connection reuse is really happening.

---

## TL;DR

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;              # idle connections cached per worker
    keepalive_timeout 50s;     # lower than the backend's own idle timeout
}

server {
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;          # required before NGINX 1.29.7
        proxy_set_header Connection "";  # required before NGINX 1.29.7
    }
}
```

Check your version with `nginx -v`. **NGINX 1.29.7 changed the defaults**: upstream keepalive is on (32 connections per worker), and HTTP/1.1 is the default proxy protocol. Most distro packages are older, so for them all three pieces above are mandatory. On newer versions, setting them explicitly is harmless and keeps the config portable.

---

## Why one connection per request hurts

Without keepalive, NGINX opens a fresh TCP connection to the backend for every proxied request and closes it afterwards:

```
NGINX                         Backend
  | --- SYN ------------------> |
  | <-- SYN-ACK --------------- |   handshake: one extra round trip
  | --- ACK + HTTP request ---> |
  | <-- HTTP response --------- |
  | --- FIN ------------------> |   teardown
  | <-- FIN / ACK ------------- |
  |                             |
  [socket sits in TIME_WAIT for 60s on the side that closed first]
```

With keepalive, the handshake happens once and later requests reuse the open connection:

```
NGINX                         Backend
  | --- SYN / SYN-ACK / ACK --> |   once
  | --- request 1 ------------> |
  | <-- response 1 ------------ |
  | --- request 2 ------------> |   same connection
  | <-- response 2 ------------ |
  |          ...                |
```

The handshake costs latency and backend CPU on every request, but the bigger problem at scale is `TIME_WAIT`.

### The port math

Each outgoing connection from NGINX to one backend IP:port needs its own local ephemeral port:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
# 32768   60999
```

That's about 28,000 ports. On Linux a closed socket stays in `TIME_WAIT` for 60 seconds, and while it does, that port can't be reused for the same destination (unless `tcp_tw_reuse` allows it).

- 200 req/s with no reuse = 200 new connections per second
- 200 × 60 s = **12,000** sockets in TIME_WAIT at steady state
- At about 470 req/s you exceed **28,000**, and the pool is gone

When it's gone, `connect()` fails with `EADDRNOTAVAIL` and NGINX logs:

```
connect() to 127.0.0.1:8080 failed (99: Cannot assign requested address) while connecting to upstream
```

The app is fine. NGINX is fine. The NGINX host ran out of local ports. Whether TIME_WAIT lands on the NGINX host or the backend depends on which side closes first, but with a backend on the same host, it's the same box either way. [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained) goes deeper on the state itself.

Watch it happen:

```bash
watch -n 1 "ss -Htan state time-wait '( dport = :8080 )' | wc -l"
```

---

## Why keepalive needs two extra lines

When NGINX proxies a request, it's an HTTP client talking to your backend. Before 1.29.7, two defaults sabotage connection reuse:

1. **`proxy_http_version` defaults to 1.0.** HTTP/1.0 has no persistent connections by default.
2. **NGINX sends `Connection: close` to the upstream.** It doesn't forward the client's `Connection` header. It sets its own, and the default is `close`. That tells the backend to hang up after the response.

So you need:

```nginx
proxy_http_version 1.1;          # speak HTTP/1.1, where connections persist by default
proxy_set_header Connection "";  # replace the default "close" with nothing
```

Without both, `keepalive` in the upstream block allocates a cache that never gets anything put into it. You get no error and no warning.

**WebSockets:** if the same location proxies WebSocket upgrades, you can't hardcode `Connection ""`. Use a `map` instead:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      '';
}

location /ws/ {
    proxy_pass http://app_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

Requests without an `Upgrade` header get an empty `Connection` and stay eligible for keepalive.

---

## What each directive actually controls

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;
    keepalive_requests 1000;
    keepalive_timeout 50s;
}
```

| Directive | Context | Default | Meaning |
|---|---|---|---|
| `keepalive N` | upstream | off before 1.29.7; 32 since | Max **idle** connections cached **per worker process** |
| `keepalive_requests` | upstream | 1000 (100 before 1.19.10) | Requests per connection before NGINX closes it, which frees per-connection memory |
| `keepalive_timeout` | upstream | 60s | How long an idle cached connection is kept |

**`keepalive 64` is not a connection limit.** Under load NGINX can have far more than 64 active connections to the backend. The number only caps how many *idle* connections each worker keeps after requests finish. If a request arrives and no idle connection is available, NGINX opens a new one. When a request finishes and the worker already holds 64 idle connections, the least recently used one is closed.

Rough sizing: total idle connections = `keepalive` × `worker_processes`. Make sure the backend can hold that many open connections. For thread-per-connection backends, each idle connection can pin a thread.

To limit concurrent connections to a server, use `max_conns` on the `server` line. That's a separate setting.

**Order matters on older versions.** Before 1.29.7, a balancing method like `least_conn` or `ip_hash` must appear **before** `keepalive` in the block.

---

## The timeout trap: random 502s after enabling keepalive

Keepalive fixed the TIME_WAIT pile-up, but now you see a few 502s per hour, never reproducible:

```
upstream prematurely closed connection while reading response header from upstream
recv() failed (104: Connection reset by peer) while reading response header from upstream
```

Cause: the backend closes idle connections **sooner** than NGINX does. NGINX picks a cached connection that looks open and writes a request. The backend had already closed that connection, so the request fails.

Rule: **NGINX's upstream `keepalive_timeout` must be shorter than the backend's idle timeout.** The NGINX default is 60 seconds, which is longer than many app servers:

| Backend | Idle keepalive timeout default |
|---|---|
| Node.js `http.Server` | `keepAliveTimeout` 5 s |
| Gunicorn | `--keep-alive` 2 s |
| Apache httpd | `KeepAliveTimeout` 5 s |

Defaults change between versions, so check the docs for yours. Either lower NGINX's side:

```nginx
keepalive_timeout 4s;   # under Node's 5s
```

Or raise the backend's. For example, in Node.js:

```javascript
server.keepAliveTimeout = 65000;  // 65 s
server.headersTimeout   = 66000;  // keep this above keepAliveTimeout
```

and set NGINX below it (`keepalive_timeout 60s;`).

NGINX retries many of these failures automatically for idempotent requests (`proxy_next_upstream error` is on by default), which is why the errors look rare and random. POST and PATCH requests aren't retried once sent, so those are the ones that surface as 502s.

---

## Verify reuse is actually happening

Don't trust the config. Measure.

### Count connection churn

```bash
# Run load (against a system you own), then compare:
ss -Htan state established '( dport = :8080 )' | wc -l
ss -Htan state time-wait   '( dport = :8080 )' | wc -l
```

- **Reuse working:** ESTABLISHED stays roughly stable and TIME_WAIT stays low.
- **Not working:** TIME_WAIT climbs in step with request rate.

### Watch `connect()` calls on a worker

```bash
pgrep -f "nginx: worker" | head -1
strace -f -e trace=connect -p <worker_pid> 2>&1 | head -20
```

With reuse, `connect()` calls to the backend are rare. Without it, you see one per request. `strace` slows the process, so keep it short on production.

**What doesn't work:** `stub_status`. Its `Waiting` counter counts idle **client** keepalive connections, not upstream connections. It tells you nothing about the upstream pool.

### Check the config itself

```bash
nginx -T 2>/dev/null | grep -nE "upstream|keepalive|proxy_http_version|Connection"
```

Every upstream with `keepalive` should have matching `proxy_http_version 1.1` and `Connection ""` in **every** location that proxies to it. It's easy to fix one location and miss another. The [NGINX Config Analyzer](/tools/nginx-config-analyzer) checks this for you: paste the `nginx -T` output and it lists upstreams whose locations are missing the headers.

---

## When keepalive isn't enough

Keepalive solves connection churn. If 502s continue after it's verified working, the bottleneck is elsewhere:

- **Backend capacity:** accept-queue overflow, killed workers, `pm.max_children` in PHP-FPM. See [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load).
- **NGINX limits:** `worker_connections` and open files. See [Too Many Open Files on Linux](/blog/too-many-open-files-linux-fix).
- **Specific error messages:** look them up in the [NGINX 502 error-log table](/blog/nginx-502-bad-gateway-fix-linux).

---

## Checklist

1. `nginx -v`: before 1.29.7, `keepalive` needs `proxy_http_version 1.1` and `proxy_set_header Connection ""`.
2. Add both to every location that proxies to the upstream. Use the `map` pattern for WebSockets.
3. On older versions, put `least_conn`/`ip_hash` before `keepalive`.
4. Set upstream `keepalive_timeout` below the backend's idle timeout.
5. Verify with `ss`: stable ESTABLISHED, low TIME_WAIT.

---

## FAQ

**Does `keepalive_timeout` in the upstream block affect clients?**
No. Inside `upstream` it controls idle connections to the backend. The `keepalive_timeout` in `http`/`server` context is a different directive that controls client connections.

**How big should `keepalive` be?**
Start around 16–64 per worker and watch TIME_WAIT under realistic load. If it still climbs, raise it. Remember the total is per worker, so 8 workers × 64 = up to 512 idle connections the backend must tolerate.

**Does upstream keepalive work with HTTPS backends?**
Yes. Cached connections keep their TLS session, which saves even more than with plain HTTP, because each new connection would otherwise need a TLS handshake too.
