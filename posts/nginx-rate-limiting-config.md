---
title: "NGINX Rate Limiting: limit_req, burst and nodelay Explained"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Configure NGINX rate limiting that blocks abuse without rejecting real users: how burst and nodelay behave, return 429, exempt IPs, and test in dry-run."
tags: ["nginx", "security", "infrastructure", "production"]
featured: false
category: "nginx"
---

You set `rate=10r/s` on your API, deploy, and within minutes users report errors, even though nobody sends anywhere near 10 requests per second. The browser loads a page that fires six API calls at once, and five of them get `503`.

That's the most common NGINX rate-limiting surprise. `rate=10r/s` doesn't mean "10 requests in any given second". It means **one request every 100 milliseconds**, and without `burst`, anything faster is rejected. Once you understand that, the rest of the configuration makes sense.

---

## TL;DR

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            limit_req_status 429;
            proxy_pass http://backend;
        }
    }
}
```

- `limit_req_zone` (http context only) defines the key, the shared memory, and the rate.
- `limit_req` applies it. `burst` absorbs short spikes. `nodelay` serves those spikes immediately instead of queueing them.
- `limit_req_status 429` returns "Too Many Requests" instead of the default `503`.

---

## How the limiter actually works

NGINX uses a **leaky bucket** per key (here, per client IP), tracked at millisecond resolution:

- `rate=10r/s` means one request is allowed every 100 ms. `rate=30r/m` means one every 2 seconds.
- Each request that arrives "too early" counts as **excess**. The `burst` value is how much excess the bucket can hold.
- The excess drains at the configured rate.

Here's what happens when **15 requests from one IP arrive at the same instant** with `rate=10r/s`:

| Config | Served immediately | Delayed (queued) | Rejected |
|---|---|---|---|
| `limit_req zone=api;` (burst 0) | 1 | 0 | 14 |
| `burst=5` | 1 | 5, released one every 100 ms | 9 |
| `burst=5 nodelay` | 6 | 0 | 9 |
| `burst=5 delay=2` | 3 | 3 | 9 |

```
burst=5 nodelay, rate=10r/s, 15 requests at t=0

t=0ms    ██████ 6 served (1 + 5 burst slots)   ░░░░░░░░░ 9 rejected
t=100ms  one burst slot frees up → next request allowed
t=200ms  another slot frees up ...
t=500ms  bucket empty again
```

The important detail with `nodelay`: the burst slots are **used**, even though the requests weren't delayed. They free up at the rate, one per 100 ms. A client that keeps sending at 50 r/s gets 6 requests through, then roughly 10 per second.

Which to pick:

- **`burst` + `nodelay`**: the usual choice for APIs and web pages. Spikes go through without added latency, and sustained abuse is still capped.
- **`burst` without `nodelay`**: smooths traffic to a fragile backend, at the cost of added latency (up to `burst / rate` seconds, 2 s for `burst=20` at 10r/s).
- **`delay=N`** (NGINX 1.15.7+): a middle ground. The first N excess requests pass immediately, and the rest of the burst is paced.

---

## Production configs

### Login endpoint (strict)

```nginx
http {
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
}

server {
    location = /auth/login {
        limit_req zone=login burst=5 nodelay;
        limit_req_status 429;
        proxy_pass http://auth_backend;
    }
}
```

`5r/m` is one attempt every 12 seconds per IP, with 5 extra attempts allowed in a burst. That's plenty for a human who mistypes a password, and far too slow for brute force from one IP.

### Different limits per endpoint

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=api_heavy:10m   rate=2r/s;
}

server {
    location /api/ {
        limit_req zone=api_general burst=50 nodelay;
        limit_req_status 429;
        proxy_pass http://api_backend;
    }

    location /api/export {
        limit_req zone=api_heavy burst=2 nodelay;
        limit_req_status 429;
        proxy_pass http://api_backend;
    }
}
```

**Inheritance gotcha:** `limit_req` is inherited from the outer level only if the current level has **no** `limit_req` of its own. Above, `/api/export` gets only `api_heavy`, not both. If you want both limits there, list both `limit_req` lines in that location.

### Distributed attacks: per-IP plus global

Credential stuffing often comes from thousands of IPs at one request each. A per-IP limit won't trigger. Add a second limit on a key that's shared by everyone:

```nginx
http {
    limit_req_zone $binary_remote_addr zone=login_ip:10m     rate=5r/m;
    limit_req_zone $server_name        zone=login_global:1m  rate=50r/s;
}

server {
    location = /auth/login {
        limit_req zone=login_ip     burst=5  nodelay;
        limit_req zone=login_global burst=100 nodelay;
        limit_req_status 429;
        proxy_pass http://auth_backend;
    }
}
```

Several `limit_req` directives at the same level all apply, and a request must pass every one. Size the global limit from your real peak login rate, or you'll lock out legitimate users during an attack.

### Exempting internal IPs

Requests with an **empty key** aren't counted. Use `geo` and `map` to blank the key for trusted networks:

```nginx
http {
    geo $rate_limited {
        default         1;
        10.0.0.0/8      0;
        192.168.0.0/16  0;
    }

    map $rate_limited $limit_key {
        0 "";
        1 $binary_remote_addr;
    }

    limit_req_zone $limit_key zone=api:10m rate=10r/s;
}
```

Define the zone once, with the mapped key. Defining a second zone with the same name is a config error.

---

## Behind a load balancer or CDN, fix the client IP first

If NGINX sits behind a load balancer, `$binary_remote_addr` is the **load balancer's** IP. Every user shares one bucket, and the limit fires for everyone at once. Restore the real client address with the realip module before rate limiting:

```nginx
http {
    set_real_ip_from 10.0.0.0/8;          # your LB / CDN address ranges only
    real_ip_header   X-Forwarded-For;
    real_ip_recursive on;
}
```

Only list addresses you control in `set_real_ip_from`. Otherwise clients can spoof `X-Forwarded-For` to dodge the limit or to get someone else blocked.

---

## Return a proper 429 with Retry-After

Add `Retry-After` only to the rejected responses. Putting `add_header Retry-After` in the main location would add it to every successful response too.

```nginx
location /api/ {
    limit_req zone=api burst=20 nodelay;
    limit_req_status 429;
    error_page 429 = @rate_limited;
    proxy_pass http://backend;
}

location @rate_limited {
    default_type application/json;
    add_header Retry-After 1 always;
    return 429 '{"error":"rate_limited","message":"Too many requests"}';
}
```

---

## Roll out safely with dry-run

Guessing the right rate for real traffic is hard. Since NGINX 1.17.1 you can run the limiter without enforcing it, and log what it *would* have done:

```nginx
http {
    log_format ratelimit '$remote_addr [$time_local] "$request" $status rl=$limit_req_status';

    server {
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            limit_req_dry_run on;
            access_log /var/log/nginx/ratelimit.log ratelimit;
            proxy_pass http://backend;
        }
    }
}
```

`$limit_req_status` (1.17.6+) is `PASSED`, `DELAYED`, `REJECTED`, `DELAYED_DRY_RUN` or `REJECTED_DRY_RUN`. Run it for a few days, then count the would-be rejections:

```bash
grep -c 'rl=REJECTED_DRY_RUN' /var/log/nginx/ratelimit.log
awk '/rl=REJECTED_DRY_RUN/ {print $1}' /var/log/nginx/ratelimit.log | sort | uniq -c | sort -rn | head
```

If the top "offenders" are your own office or monitoring, fix the exemptions before you turn enforcement on.

---

## Reading the error log

When the limiter acts, NGINX logs it. Rejections are logged at `error` level by default:

```
2026/10/28 14:22:03 [error] 2187#2187: *18423 limiting requests, excess: 20.600 by zone "api", client: 198.51.100.24, server: api.example.com, request: "GET /api/items HTTP/1.1", host: "api.example.com"
```

Delays (requests queued because there's no `nodelay`) are logged one level lower:

```
... [warn] 2187#2187: *18424 delaying request, excess: 3.400, by zone "api", client: ...
```

`excess` is how far over the rate the client was, in requests. Rejection happens when it exceeds `burst`. For more ways to slice the error log during an incident, see [log analysis for incident triage](/blog/log-analysis-incident-triage). `limit_req_log_level warn` lowers rejections to `warn` (and delays to `notice`) if they're flooding your error alerts.

```bash
# Rejections per minute
awk '/limiting requests/ {print $1, substr($2,1,5)}' /var/log/nginx/error.log | uniq -c | tail

# Top limited clients
grep -o 'limiting requests.*client: [0-9a-f.:]*' /var/log/nginx/error.log \
  | awk '{print $NF}' | sort | uniq -c | sort -rn | head
```

---

## Common mistakes

- **No `burst` on page-facing endpoints.** Browsers send requests in parallel, and at `burst=0` every parallel request after the first is rejected.
- **`limit_req_zone` inside `server`.** It's only valid in `http` context, and `nginx -t` will reject it.
- **Rate limiting the load balancer's IP.** See the realip section above.
- **Zone too small.** 1 MB holds about 16,000 IP states, so `10m` is about 160,000. When the zone fills, NGINX evicts the least recently used entries, and if it can't free space it rejects the request.
- **Expecting `limit_req` to stop a real DDoS.** It protects your backend from individual clients and is cheap to evaluate, but traffic still reaches NGINX. Volumetric attacks need upstream filtering, and a single abusive source is cheaper to drop at the firewall ([block an IP with iptables](/blog/iptables-block-ip-example)).

To check a whole config for rate-limit gaps (login endpoints without limits, zones defined but unused) along with other security baseline items, run it through the [NGINX CIS Hardening Checker](/tools/nginx-cis-hardening-checker).

---

## Test it

Only test against servers you own:

```bash
# 30 requests, 10 at a time: expect a mix of 200 and 429
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}\n" https://staging.example.com/api/items &
  [ $((i % 10)) -eq 0 ] && wait
done | sort | uniq -c
```

Apply config changes with `nginx -t && systemctl reload nginx`. Zones keep their state across reloads as long as the zone name and size don't change.

---

## FAQ

**Should rate limiting return 429 or 503?**
429. It's the standard "Too Many Requests" status, and well-behaved clients back off on it. The default `503` looks like an outage to clients and monitoring.

**What's the difference between limit_req and limit_conn?**
`limit_req` limits the **rate** of requests. `limit_conn` limits **concurrent connections** per key, which is useful against slow clients or download hogging. They can be combined.

**Does rate limiting work per server or across a cluster?**
Per NGINX instance. Each server has its own shared memory zone, so three NGINX nodes behind a load balancer allow roughly three times the configured rate per client.

---

*Related: [NGINX Troubleshooting Guide](/blog/nginx-troubleshooting-guide) for other NGINX errors. [NGINX SSL Hardening](/blog/nginx-ssl-hardening) for the TLS side of a production config. [NGINX 502 under load](/blog/nginx-502-under-load) for when the backend, not the client, is the bottleneck.*
