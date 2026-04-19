---
title: "Debugging NGINX 502s That Only Appear Under Load"
date: "2024-11-14"
excerpt: "A 502 that only fires at 200 req/s but not at 50. Here's the exact process I used to find a misconfigured upstream keepalive pool hiding in plain sight."
tags: ["nginx", "debugging", "production", "troubleshooting"]
featured: true
---

## The Symptom

It was the kind of bug that makes you question your sanity. Our NGINX-fronted API worked perfectly in staging. It passed load tests at 50 req/s without a single error. But the moment we hit 200 req/s in production, 502s started appearing — about 0.3% of requests, totally random.

Error logs showed the unhelpful default:

```
2024/11/14 02:41:08 [error] 31#31: *18423 connect() failed (111: Connection refused)
while connecting to upstream, client: 10.0.1.42, server: api.example.com,
request: "POST /api/v2/events HTTP/1.1", upstream: "http://127.0.0.1:8080/api/v2/events"
```

Connection refused. Port 8080 was running. The upstream app was healthy. So what was going on?

## Narrowing It Down

First step: rule out the obvious.

```bash
# Is the upstream actually listening?
ss -tlnp | grep 8080

# Is the process alive?
systemctl status app-server

# Are we hitting resource limits?
ulimit -n
cat /proc/$(pgrep app-server)/limits
```

Everything looked fine. The app server had 65535 file descriptors available, wasn't swapping, and wasn't close to connection limits.

The clue came from watching `ss` while the load test ran:

```bash
watch -n 0.5 'ss -s'
```

I noticed `TIME-WAIT` connections were building up fast — thousands of them. That's not normal.

## The Root Cause: Missing keepalive

The NGINX upstream block looked like this:

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
}
```

No `keepalive`. This meant NGINX was opening a **new TCP connection** for every single proxied request. At 200 req/s, that's 200 new connections per second. Each closing into `TIME-WAIT` for 60 seconds. By the time the pool saturated local ports, new connections were failing — `ECONNREFUSED`.

This is a classic mistake. It's invisible at low traffic because the port space (60,000+ ephemeral ports) drains slowly. Under load, you burn through it fast.

## The Fix

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;          # idle keepalive connections per worker
    keepalive_requests 1000;
    keepalive_timeout 75s;
}

server {
    location /api/ {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;          # required for keepalive
        proxy_set_header Connection "";  # clear Connection: close header
    }
}
```

The two critical lines are `proxy_http_version 1.1` and `proxy_set_header Connection ""`. HTTP/1.0 doesn't support keepalive. The `Connection: close` header from the client will kill the keepalive if you forward it — you must clear it.

## Verifying the Fix

```bash
# Before: TIME-WAIT count climbs under load
ss -s | grep TIME-WAIT

# After: stays low, ESTABLISHED count stays ~stable
watch -n 1 'ss -s | grep -E "TIME-WAIT|ESTABLISHED"'
```

The 502s dropped to zero. TIME-WAIT connections went from thousands to under a hundred during load tests.

## What to Check When You See 502s Under Load

1. **Check `ss -s` for TIME-WAIT buildup** — this pattern is almost always ephemeral port exhaustion
2. **Check `net.ipv4.ip_local_port_range`** — default is 32768–60999, you can widen it
3. **Enable `net.ipv4.tcp_tw_reuse`** — allows reuse of TIME-WAIT sockets for outgoing connections
4. **Always use `keepalive` in upstream blocks** for high-traffic backends
5. **Always set `proxy_http_version 1.1`** when using upstream keepalive

## The Bigger Lesson

Low-traffic tests don't catch resource exhaustion bugs. Always load test at 2x–3x expected peak before launch, and instrument `ss -s` output in your monitoring. TIME-WAIT is a silent killer.
