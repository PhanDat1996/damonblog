---
title: "NGINX 502 Bad Gateway: Find the Cause From the Error Log"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "NGINX returning 502 Bad Gateway? Match the exact error-log line to its cause (dead upstream, wrong socket, SELinux, bad headers) and apply the right fix."
tags: ["nginx", "troubleshooting", "production", "debugging"]
featured: false
lab: true
category: "nginx"
---

The browser shows `502 Bad Gateway` and the footer says `nginx`. It's tempting to restart NGINX, but NGINX is usually the healthy part here. A 502 is NGINX telling you that the thing **behind** it (your app, PHP-FPM, a container, another proxy) refused the connection, hung up mid-response, or sent back something that isn't valid HTTP.

The good news: NGINX writes the exact reason to its error log, and each message maps to a small set of causes. Read the line, look it up below, fix that one thing.

> **Lab-tested:** every error line in the lab section below was reproduced on NGINX 1.28.3 (Ubuntu 26.04), with a small Python backend that fails on purpose. Where the lab result differed from common advice, the post says so.

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
| `connect() failed (99: Cannot assign requested address)` | NGINX host ran out of ephemeral ports | Load problem, see the [502 under load guide](/blog/nginx-502-under-load) |

### Not actually a 502

Two messages people often chase while debugging 502s produce different status codes:

- `upstream timed out (110: Connection timed out) while reading response header from upstream` returns **504 Gateway Timeout**. The upstream is alive but too slow. Tune `proxy_read_timeout` only after you know *why* it's slow.
- `worker_connections are not enough` is NGINX's own connection limit. The request fails with a 500, not a 502. Raise `worker_connections` (and the open-files limit, see below).

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

## Reproduced in the lab

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

If the backend answers `curl` fine and 502s appear only during traffic peaks, the cause is usually capacity at the connection layer: the backend's accept queue overflowing, workers being killed, or NGINX running out of local ports (`99: Cannot assign requested address`). That needs a different diagnosis, covered step by step in [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load).

Two related limits to rule out on the NGINX side:

```nginx
worker_rlimit_nofile 65535;
events {
    worker_connections 8192;
}
```

Each proxied request uses two connections (client and upstream), so `worker_connections` must cover both. If the error log shows `Too many open files`, see [Too Many Open Files on Linux](/blog/too-many-open-files-linux-fix).

Many of these mistakes (missing SNI on HTTPS upstreams, `localhost` in `proxy_pass`, keepalive without its required headers) are visible in the config itself. Paste yours into the [NGINX Config Analyzer](/tools/nginx-config-analyzer) to catch them before the next incident.

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
5. If it only happens under load, follow the [under-load guide](/blog/nginx-502-under-load).

---

## FAQ

**Is a 502 an NGINX problem or an application problem?**
Almost always the application or the path to it. NGINX generates the 502 page itself, but only because the upstream refused, reset, or garbled the connection. The exceptions are NGINX config mistakes like the wrong port, a wrong socket path, or proxying HTTP to an HTTPS port.

**Why does curl to the backend work while users get 502s?**
Your single `curl` doesn't reproduce the conditions. Check whether NGINX is using the same address you tested (the `upstream:` field), whether the 502s correlate with traffic peaks, and whether they line up with worker restarts or OOM kills in the app logs.

**What is the difference between 502 and 504 in NGINX?**
502 means the upstream connection failed or the response was invalid. 504 means NGINX connected and waited, but the upstream didn't respond within `proxy_connect_timeout` or `proxy_read_timeout`.

---

*Related: [NGINX Troubleshooting Guide](/blog/nginx-troubleshooting-guide) for other NGINX errors. [Test a TCP connection on Linux](/blog/test-tcp-connection-linux) to check upstream reachability without curl.*
