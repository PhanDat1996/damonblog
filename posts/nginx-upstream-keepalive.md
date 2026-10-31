---
title: "NGINX Upstream Keepalive: Stop Port Exhaustion 502s"
date: "2024-11-28"
updated: "2026-10-31"
excerpt: "Lab-tested NGINX upstream keepalive: why keepalive alone still churns connections, the 502s a half config hides behind retries, and how to verify reuse."
tags: ["nginx", "infrastructure", "production", "networking", "troubleshooting"]
featured: true
category: "nginx"
lab: true
---

You added `keepalive 64;` to an upstream block and reloaded NGINX, but `ss` still shows thousands of sockets in `TIME_WAIT` to the backend. Under heavier load, the error log fills with `99: Cannot assign requested address` and clients get 502s.

On NGINX before 1.29.7, `keepalive` on its own doesn't reuse anything. It needs two more lines in every proxying `location`. This post shows what each piece changes, measured on a lab VM, including one failure mode the usual advice doesn't mention.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, 4 vCPU, NGINX `1.28.3 (Ubuntu)`, wrk 4.1.0, Python 3.14 HTTP/1.1 test backends, everything on `127.0.0.1`. Default `ip_local_port_range` `32768 60999`, `tcp_tw_reuse=2`. Changing sysctls needed root and was rolled back after each test. NGINX 1.29.7's new defaults couldn't be tested on this version.

---

## Quick answer

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 16;              # idle connections cached per worker
    keepalive_timeout 50s;     # keep this below the backend's idle timeout
}

server {
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;          # needed before NGINX 1.29.7
        proxy_set_header Connection "";  # needed before NGINX 1.29.7
    }
}
```

In the lab, with all three pieces, the same 10-second load test used **64 backend connections instead of about 15,600**, ran about **3x faster**, and left 35 sockets in `TIME_WAIT` instead of 10,708.

Check your version with `nginx -v`. NGINX 1.29.7 turned upstream keepalive on by default and made HTTP/1.1 the default proxy protocol. Most distro packages are older. On newer versions, setting the lines explicitly is harmless.

---

## The test: four upstreams, one load

Four identical backends, each behind a location with a different amount of keepalive config:

| Location | `keepalive 16` | `proxy_http_version 1.1` | `Connection ""` |
|---|---|---|---|
| `/none/` | no | no | no |
| `/only/` | yes | no | no |
| `/http11/` | yes | yes | no |
| `/full/` | yes | yes | yes |

Load: `wrk -t2 -c20 -d10s` per location. Each backend counts the TCP connections it accepted. TIME_WAIT was counted with `ss` right after each run.

```
Requests/sec:   1552.52
  none: TIME_WAIT=10708 backend conns=15557 reqs=15557 errors=0 retried=0
Requests/sec:   1561.87
  only: TIME_WAIT=10897 backend conns=15662 reqs=15662 errors=0 retried=0
Requests/sec:   1580.72
  http11: TIME_WAIT=10711 backend conns=15841 reqs=15841 errors=0 retried=0
Requests/sec:   4798.18
  full: TIME_WAIT=35 backend conns=64 reqs=48038 errors=0 retried=0
```

| Location | Req/s | Backend connections | Requests per connection | TIME_WAIT after |
|---|---|---|---|---|
| `/none/` | 1,552 | 15,557 | 1 | 10,708 |
| `/only/` | 1,561 | 15,662 | 1 | 10,897 |
| `/http11/` | 1,580 | 15,841 | 1 | 10,711 |
| `/full/` | 4,798 | 64 | ~750 | 35 |

`keepalive 16` alone and `keepalive` + HTTP/1.1 behaved exactly like no keepalive: one connection per request. Only the full config reused connections.

The reason is in what NGINX sends upstream. By default it uses HTTP/1.0 and sets its own `Connection: close` header. HTTP/1.1 alone doesn't help, because NGINX still sends `Connection: close` and the backend hangs up after the response. `proxy_set_header Connection ""` removes that header.

---

## Where the lab disagreed: a half config can cause hidden errors

The common explanation is that `keepalive` without the two headers "does nothing, no error, no warning". That held for backends that answer `Connection: close` with a `Connection: close` response header of their own (the run above).

The first run used a backend that closed the connection after each response **without** saying so in a header. NGINX then treated the connection as reusable, cached it, and wrote the next request into a socket the backend had already closed:

```
2026/10/30 15:35:01 [error] 19196#19196: *32813 upstream prematurely closed connection while reading response header from upstream, client: 127.0.0.1, server: , request: "GET /http11/x HTTP/1.1", upstream: "http://127.0.0.1:9403/http11/x", host: "127.0.0.1:8401"
```

| Location (silent-close backend) | Requests | "prematurely closed" errors |
|---|---|---|
| `/only/` | 16,141 | 8,448 |
| `/http11/` | 16,135 | 8,683 |

wrk reported **no** failed requests. wrk only sends GET, and NGINX retried each failure on a fresh connection (`proxy_next_upstream error` is the default), so the access log showed `ups=502, 200` and the client got a 200. With POST, or with `proxy_next_upstream off`, those would have been client-visible 502s. A half-finished keepalive config isn't always harmless. Either finish it or remove `keepalive`.

---

## Port exhaustion, reproduced

Every new upstream connection needs a local ephemeral port, and a closed socket keeps its port in `TIME_WAIT` for 60 seconds. To reproduce exhaustion without huge load, the lab narrowed the range to 500 ports, with an automatic timed rollback:

```
net.ipv4.ip_local_port_range = 40000	40499
net.ipv4.tcp_tw_reuse = 2
--- loopback, no keepalive, 500 local ports
  Non-2xx or 3xx responses: 86034
Requests/sec:   9632.72
  TIME_WAIT=560 errors99=86050
  10315 200
  86050 502
```

The high req/s is fake: most responses were instant 502s. The error log line:

```
2026/10/30 15:39:04 [crit] 19198#19198: *96268 connect() to 127.0.0.1:9401 failed (99: Cannot assign requested address) while connecting to upstream, client: 127.0.0.1, server: , request: "GET /none/x HTTP/1.1", upstream: "http://127.0.0.1:9401/none/x", host: "127.0.0.1:8401"
```

Two things worth knowing from this run:

- The message is logged at **`[crit]`**, not `[error]`. Alerting or a grep that only matches `[error]` misses it.
- **`tcp_tw_reuse=2` (the default) didn't prevent it**, even though all traffic was on loopback, where that setting is supposed to allow reuse. Don't rely on the sysctl instead of keepalive.

Same 500-port range with the full keepalive config:

```
--- loopback, full keepalive, 500 local ports
Requests/sec:   4784.61
  TIME_WAIT=38 errors99=0 backend conns=130 reqs=95936
  47893 200
      4 499
```

Zero port errors, 130 connections for about 96,000 requests. (The 4 × 499 are wrk closing connections at the end of the run.)

The math for a default range: about 28,000 ports, 60 s in TIME_WAIT, so roughly 470 new connections per second to one backend `ip:port` is the ceiling. [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained) covers the state itself.

---

## keepalive N is not a connection limit

`keepalive 16` caps the **idle** connections each worker keeps, not the active ones. With `wrk -c200` against `/full/`:

```
--- keepalive is not a connection cap: 200 concurrent clients
  ESTABLISHED nginx->backend during load: 200
Requests/sec:   4129.57
  ESTABLISHED after load: 64  TIME_WAIT: 74
```

200 connections to the backend while 200 clients were active, then 64 left (16 × 4 workers) once load stopped. Size the backend for the active peak, and expect `keepalive × worker_processes` idle connections afterwards. To actually cap connections per backend, use `max_conns` on the `server` line.

| Directive | Context | Meaning |
|---|---|---|
| `keepalive N` | upstream | Max idle connections cached per worker |
| `keepalive_requests` | upstream | Requests per connection before NGINX closes it (default 1000) |
| `keepalive_timeout` | upstream | How long an idle cached connection is kept (default 60s) |

On versions before 1.29.7, put balancing methods like `least_conn` or `ip_hash` **before** `keepalive` in the block.

---

## The slow /full/ run: Nagle and delayed ACK

The very first `/full/` run was slower than no keepalive at all:

```
Requests/sec:    486.34
  full: TIME_WAIT=0 ESTABLISHED(nginx->backend)=4 backend conns=21 reqs=4885
```

Connections were reused (21 connections), but each request averaged about 40 ms upstream. The test backend wrote headers and body in separate small writes without `TCP_NODELAY`. On a reused connection, Nagle's algorithm held the second write until the first was ACKed, and the ACK was delayed. Setting `TCP_NODELAY` on the backend took the same config to 4,798 req/s.

Most production app servers set `TCP_NODELAY` already. If enabling keepalive makes latency jump to a steady ~40 ms, check the backend's socket options before blaming NGINX.

---

## The timeout mismatch: didn't reproduce in the lab

The usual advice says NGINX's upstream `keepalive_timeout` must be shorter than the backend's idle timeout. Otherwise NGINX reuses a connection the backend just closed, and you get rare `upstream prematurely closed connection` or `104: Connection reset by peer` 502s.

The lab tried to trigger it. Two upstreams pointed at backends that close idle connections after 1 second: one with NGINX's default 60s `keepalive_timeout`, one with `500ms`. 20 clients each sent a request roughly every second (jittered ±50 ms), so many requests landed right around the backend's close:

```
POST /idle/x gap~1.0s: 200:1188
POST /idleshort/x gap~1.0s: 200:1188
GET /idle/x gap~1.0s: 200:806
GET /idle/x gap~0.98s: 200:821
GET /idleshort/x gap~1.0s: 200:805
GET /idleshort/x gap~0.98s: 200:821
```

Zero errors and zero retries with either timeout. (Each POST run also had 20 `404`s from requests sent while the test config was still reloading. They're unrelated and left out above.)

The reason: when the backend closes an idle connection, it sends a FIN, and NGINX watches its cached idle connections for exactly that and drops them. The race only exists in the small window where NGINX picks a connection and writes to it while the FIN is still in flight. On loopback that window is microseconds. Over a real network, or with a backend that resets connections instead of closing them, it's wider.

Keeping NGINX's timeout below the backend's is still the cheap, correct setting, because it removes the race entirely:

| Backend | Idle keepalive default to check |
|---|---|
| Node.js `http.Server` | `keepAliveTimeout` (5 s) |
| Gunicorn | `--keep-alive` (2 s) |
| Apache httpd | `KeepAliveTimeout` (5 s) |

Defaults change between versions, so check yours. Just don't expect this to explain frequent 502s. If you see many `prematurely closed` errors, the silent-close behaviour above or a crashing backend is more likely.

---

## Verify reuse on your own system

Compare ESTABLISHED and TIME_WAIT to the backend port during load:

```bash
ss -Htan state established '( dport = :8080 )' | wc -l
ss -Htan state time-wait   '( dport = :8080 )' | wc -l
```

Reuse working: ESTABLISHED stays roughly flat, TIME_WAIT stays low. Not working: TIME_WAIT climbs with request rate, as in the 10,000+ numbers above.

Check every location that proxies to a keepalive upstream:

```bash
nginx -T 2>/dev/null | grep -nE "upstream|keepalive|proxy_http_version|Connection"
```

The [NGINX Config Analyzer](/tools/nginx-config-analyzer) does this from `nginx -T` output and lists locations missing the headers.

`stub_status` won't help here: its `Waiting` counter is idle **client** connections, not upstream ones.

For WebSocket locations, don't hardcode `Connection ""`. Use a map so upgrade requests still work:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      '';
}
```

and `proxy_set_header Connection $connection_upgrade;`.

---

## When keepalive isn't the problem

If 502s continue with reuse verified, look at backend capacity ([NGINX 502 under load](/blog/nginx-502-under-load)), the specific error message ([502 error-log table](/blog/nginx-502-bad-gateway-fix-linux)), or NGINX's own limits ([too many open files](/blog/too-many-open-files-linux-fix)).

---

## FAQ

**Does keepalive_timeout in the upstream block affect clients?**
No. Inside `upstream` it controls idle connections to the backend. The `keepalive_timeout` in `http` or `server` context is a different directive for client connections.

**How big should keepalive be?**
The lab used 16 per worker and reused connections fine at 4,800 req/s. Raise it if TIME_WAIT still climbs under realistic load, and remember the total idle count is per worker.

**Does tcp_tw_reuse make keepalive unnecessary?**
No. In the lab, port exhaustion still happened with `tcp_tw_reuse=2` on loopback.

**Does upstream keepalive work with HTTPS backends?**
Yes. Reused connections also skip the TLS handshake, which saves more than with plain HTTP. HTTPS upstreams weren't part of this lab.
