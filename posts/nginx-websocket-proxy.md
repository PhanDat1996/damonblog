---
title: "NGINX WebSocket Proxy: Fix 502, 426 and 60s Drops"
date: "2026-11-08"
updated: "2026-11-08"
excerpt: "WebSocket fails behind NGINX with 502 or 426, or drops after exactly 60 seconds? Lab-tested config with map $http_upgrade, the headers and the timeout."
tags: ["nginx", "troubleshooting", "debugging", "linux", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

The WebSocket app works when you connect to it directly, but through NGINX the browser console says `WebSocket connection to 'wss://...' failed`, the client gets `HTTP 502` or `HTTP 426`, or the connection opens fine and then dies after exactly one minute of silence. All three come from the same few lines of NGINX config.

This post reproduces each failure on a lab VM with a real WebSocket backend, shows what NGINX and the backend log for each, and ends with a config that passed every test.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, 4 vCPU, NGINX `1.28.3 (Ubuntu)`, curl 8.18.0, Python 3.14.4 with `python3-websockets` 15.0.1 from the Ubuntu archive. The echo backend listened on `127.0.0.1:9101` and ran as a normal user. Installing the NGINX test server on `127.0.0.1:8101` needed root. All traffic stayed on loopback.

---

## Quick answer: the working config

```nginx
# http {} level
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# server {} level
location /ws/ {
    proxy_pass http://127.0.0.1:9101;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;

    # only if the app can sit silent for more than 60s
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}
```

Each line matters. In the lab, removing them gave these results:

| Config | Result through NGINX | What the backend saw |
|---|---|---|
| Only `proxy_pass` | **502 Bad Gateway** | `GET /broken/ HTTP/1.0`, rejected |
| `proxy_pass` + `proxy_http_version 1.1` | **426 Upgrade Required** | `Connection: close`, no `Upgrade` |
| Full config above | **101 Switching Protocols** | A valid WebSocket handshake |
| Full config, client silent for 60s | Connection dropped at **60.0s** | Close code `1006`, no close frame |

---

## Why NGINX breaks WebSocket by default

A WebSocket starts as an HTTP/1.1 `GET` with two headers, `Upgrade: websocket` and `Connection: Upgrade`. The server answers `101 Switching Protocols` and from then on the TCP connection carries WebSocket frames.

NGINX doesn't forward that handshake as-is, for three reasons:

1. `proxy_http_version` defaults to `1.0`. The upgrade mechanism doesn't exist in HTTP/1.0.
2. `Upgrade` and `Connection` are hop-by-hop headers. NGINX doesn't pass them from the client to the upstream unless you set them yourself.
3. NGINX sets `Connection: close` on upstream requests by default.

Only when NGINX gets a `101` from the upstream does it switch to tunneling bytes in both directions.

---

## Reproduce it: test the handshake with curl

You don't need a browser to test a handshake. curl can send the upgrade headers and print the status line. The key below is the sample from RFC 6455, so the expected `Sec-WebSocket-Accept` is known: `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`.

```bash
curl -si --max-time 3 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://127.0.0.1:8101/ws/
```

`--max-time 3` is there because after a successful `101`, curl just holds the open connection.

The test server had one location per stage of the config:

```nginx
location /broken/ {
    proxy_pass http://lab_ws_backend;
}
location /half/ {
    proxy_pass http://lab_ws_backend;
    proxy_http_version 1.1;
}
location /ws/ {
    proxy_pass http://lab_ws_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $lab_connection_upgrade;
    proxy_set_header Host $host;
}
```

### Only proxy_pass: 502 Bad Gateway

```
=== curl /broken/
HTTP/1.1 502 Bad Gateway
Server: nginx/1.28.3 (Ubuntu)
...
```

NGINX's error log:

```
[error] 194967#194967: *1 upstream prematurely closed connection while reading response header from upstream, client: 127.0.0.1, server: , request: "GET /broken/ HTTP/1.1", upstream: "http://127.0.0.1:9101/broken/", host: "127.0.0.1:8101"
```

The backend log explains it:

```
ValueError: unsupported protocol; expected HTTP/1.1: GET /broken/ HTTP/1.0
...
websockets.exceptions.InvalidMessage: did not receive a valid HTTP request
```

NGINX sent `HTTP/1.0`. This backend (Python `websockets`) closed the socket without answering, so NGINX reported `upstream prematurely closed connection` and returned a 502. A different framework might answer 400, or serve the request as plain HTTP with a 200 that the browser then refuses as a failed upgrade. The cause is the same either way. If you're chasing 502s that aren't WebSocket-related, see [NGINX 502 Bad Gateway under load](/blog/nginx-502-under-load).

### Adding proxy_http_version 1.1: 426 Upgrade Required

```
=== curl /half/
HTTP/1.1 426 Upgrade Required
Server: nginx/1.28.3 (Ubuntu)
...
Upgrade: websocket

Failed to open a WebSocket connection: invalid Connection header: close.
```

This 426 came from the backend, not from NGINX. NGINX passed the backend's response through. The request now uses HTTP/1.1, but the backend saw `Connection: close` (NGINX's default) and no `Upgrade` header:

```
websockets.exceptions.InvalidUpgrade: invalid Connection header: close
```

Nothing shows up in NGINX's error log for this case: from NGINX's point of view the upstream answered normally. The access log just shows `426`.

### Full config: 101 Switching Protocols

```
=== curl /ws/
HTTP/1.1 101 Switching Protocols
Server: nginx/1.28.3 (Ubuntu)
Date: Sun, 08 Nov 2026 05:13:00 GMT
Connection: upgrade
Upgrade: websocket
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

The accept value matches the RFC example, so the handshake reached the backend intact. A real client confirmed it by sending a message and getting the echo back:

```
=== client /broken/
   0.0s InvalidStatus: server rejected WebSocket connection: HTTP 502
=== client /half/
   0.0s InvalidStatus: server rejected WebSocket connection: HTTP 426
=== client /ws/
   0.0s echo: hello
   1.0s echo: still there?
```

In the access log, a successful WebSocket shows status `101`:

```
"GET /broken/ HTTP/1.1" 502 166 "-" "Python/3.14 websockets/15.0.1"
"GET /half/ HTTP/1.1" 426 165 "-" "Python/3.14 websockets/15.0.1"
"GET /ws/ HTTP/1.1" 101 38 "-" "Python/3.14 websockets/15.0.1"
```

---

## Why use a map for Connection

You'll see configs that hardcode `proxy_set_header Connection "upgrade";`. That works for the WebSocket requests, but every plain HTTP request to the same location is then sent upstream with `Connection: upgrade` too. The map sends `upgrade` only when the client actually asked for one:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

If that location also uses an upstream `keepalive` pool, map the empty case to `''` instead of `close`, so normal requests can reuse upstream connections. [NGINX upstream keepalive](/blog/nginx-upstream-keepalive) covers why `Connection ""` matters there.

---

## The 60-second disconnect

With the handshake fixed, the next complaint is usually "the socket drops after a minute". Three clients connected at the same time, each silent for 75 seconds before sending a second message:

- `/ws/` with default timeouts, no client pings
- `/ws/` with default timeouts, client pinging every 20s
- `/ws-long/` with `proxy_read_timeout 1h` and `proxy_send_timeout 1h`, no client pings

```
== idle-ws-noping.txt
   0.0s echo: hello
  60.0s ConnectionClosedError: no close frame received or sent
== idle-ws-ping.txt
   0.0s echo: hello
  75.0s echo: still there?
== idle-wslong-noping.txt
   0.0s echo: hello
  75.1s echo: still there?
```

The connection without pings died at **60.0 seconds**, the default `proxy_read_timeout`. For an upgraded connection, that timeout is the longest NGINX waits between two reads from the upstream. When it expires, NGINX closes both sides. No WebSocket close frame is sent, so the backend logged an abnormal close:

```
05:13:17 open /ws/
05:14:17 close 1006
```

Two things make this hard to spot:

- **No error log entry.** At the default `error` level, NGINX logged nothing for the timeout. The only line was the access log entry, written when the connection closed, with status `101`.
- **Many client libraries hide it.** Python `websockets` sends a ping every 20 seconds by default. Each ping gets a pong from the backend, which counts as a read from upstream and resets the timer. In the lab the timeout only showed up after pings were turned off (`ping_interval=None`). The browser WebSocket API has no method to send a ping, so a browser app that goes quiet needs its own heartbeat message, or the server has to ping.

Two fixes, both tested:

| Fix | Where | Trade-off |
|---|---|---|
| Ping or heartbeat more often than every 60s | App (server or client) | Also detects dead peers, so this is the better fix |
| `proxy_read_timeout 1h; proxy_send_timeout 1h;` | NGINX, WebSocket location only | Dead connections stay open up to an hour |

Set long timeouts only in the WebSocket location, not at `server` level, where they would also cover normal requests. For reading timeout errors on normal proxied requests, see [NGINX 504 Gateway Timeout](/blog/nginx-504-gateway-timeout-fix).

---

## Checklist when a WebSocket fails behind NGINX

1. Run the curl handshake above against NGINX and against the backend directly. If the backend returns `101` and NGINX doesn't, it's the proxy config.
2. Look at the status in the access log: `101` means it worked, `502` means check the error log, `400`/`426` came from the backend.
3. Dump the effective config and check the location that matched: `sudo nginx -T 2>/dev/null | grep -nE "location|proxy_http_version|Upgrade|Connection|proxy_read_timeout"`. If the request is landing in the wrong location, [NGINX location matching order](/blog/nginx-location-matching-order) shows how NGINX picks one.
4. If drops happen after a fixed interval, compare it with `proxy_read_timeout` and with any load balancer idle timeout in front of NGINX.

The [NGINX Config Analyzer](/tools/nginx-config-analyzer) can review the `nginx -T` output for you.

---

## FAQ

**Do I need proxy_http_version 1.1 for WebSocket?**
Yes. NGINX defaults to HTTP/1.0 for upstream requests, and the upgrade handshake needs HTTP/1.1. In the lab, leaving it out produced a 502.

**Why does my WebSocket disconnect after 60 seconds behind NGINX?**
`proxy_read_timeout` defaults to 60s and covers idle time on upgraded connections. Send pings more often than that, or raise the timeout in the WebSocket location.

**Does NGINX log a WebSocket idle timeout?**
Not at the default `error` log level in this lab. The access log shows status 101, written when the connection closes.

**Where does a 426 Upgrade Required come from?**
In this lab it came from the backend, which received `Connection: close` and no `Upgrade` header because NGINX didn't forward them.
