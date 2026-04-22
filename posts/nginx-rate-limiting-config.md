---
title: "Nginx Rate Limiting Configuration: Practical Guide With Examples"
date: "2026-04-22"
excerpt: "Configure nginx rate limiting with limit_req_zone and limit_req — with real examples for API protection, login endpoints, and burst handling in production."
tags: ["nginx", "security", "infrastructure", "production"]
featured: false
slug: "nginx-rate-limiting-config-guide"
---

# Nginx Rate Limiting Configuration: Practical Guide With Examples

Nginx rate limiting stops abuse, reduces load on upstream services, and protects login endpoints from brute force. Two directives do the work: `limit_req_zone` to define the rule, `limit_req` to apply it.

---

## TL;DR

```nginx
# Define the zone (in http block)
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# Apply it (in server or location block)
limit_req zone=api burst=20 nodelay;
```

---

## How Nginx Rate Limiting Works

Nginx uses a **leaky bucket** algorithm. Requests fill a bucket; the bucket drains at the defined rate. When the bucket overflows, requests are rejected with `503` (or your configured status).

The key parameters:

- `rate=10r/s` — 10 requests per second from one IP
- `burst=20` — allow up to 20 queued requests above the rate
- `nodelay` — serve burst requests immediately, don't make them wait
- `delay=5` — serve first 5 burst requests immediately, delay the rest

---

## Basic Configuration

```nginx
http {
    # Define the shared memory zone
    # $binary_remote_addr = client IP (compact binary format)
    # zone=api:10m = name "api", 10MB of shared memory (~160,000 IPs)
    # rate=10r/s = 10 requests per second per IP
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        listen 80;

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
        }
    }
}
```

---

## Real Examples

### Protect a login endpoint (strict)

```nginx
http {
    # Very strict — 5 requests per minute per IP
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
}

server {
    location /auth/login {
        limit_req zone=login burst=3 nodelay;
        limit_req_status 429;         # return 429 instead of 503
        limit_req_log_level warn;     # log at warn, not error

        proxy_pass http://auth_backend;
    }
}
```

5 requests per minute is reasonable for login — more than enough for legitimate users, too slow for brute force.

### API rate limiting with different tiers

```nginx
http {
    # General API rate limit
    limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;

    # Expensive endpoints (search, export)
    limit_req_zone $binary_remote_addr zone=api_heavy:10m rate=2r/s;
}

server {
    location /api/ {
        limit_req zone=api_general burst=50 nodelay;
        proxy_pass http://api_backend;
    }

    location /api/search {
        limit_req zone=api_heavy burst=5 nodelay;
        proxy_pass http://api_backend;
    }

    location /api/export {
        limit_req zone=api_heavy burst=2 nodelay;
        proxy_pass http://api_backend;
    }
}
```

### Rate limit by URL + IP combined

```nginx
http {
    # Combine IP and URI for per-endpoint limits
    limit_req_zone $binary_remote_addr$request_uri zone=per_url:20m rate=10r/s;
}
```

### Whitelist internal IPs from rate limiting

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    geo $limit {
        default 1;
        10.0.0.0/8 0;       # internal network — no limit
        192.168.0.0/16 0;   # office network — no limit
    }

    map $limit $limit_key {
        0 "";
        1 $binary_remote_addr;
    }

    limit_req_zone $limit_key zone=api:10m rate=10r/s;
}

server {
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

When `$limit_key` is empty (internal IPs), nginx creates no limit entry — those IPs bypass rate limiting.

---

## Output Explanation: What Happens When Rate is Exceeded

**Without `nodelay`:**
```
# Client sends 15 requests/second, limit is 10r/s, burst=5
# First 10 requests: served immediately
# Next 5 requests: queued (burst used up)
# Remaining: 503 Service Unavailable
```

**With `nodelay`:**
```
# First 10 requests: served immediately
# Next 5 requests (burst): served immediately too
# Remaining: 503 — no queueing, just reject
```

**With `delay=5`:**
```
# First 10 requests: served immediately
# Next 5 requests: served immediately (delay allowance)
# Next requests: delayed until rate bucket allows
# After burst is full: 503
```

In nginx error log when limit is hit:
```
2026/04/20 14:22:03 [warn] 1234#1234: *18423 limiting requests, excess: 0.600 by zone "api", client: 1.2.3.4
```

---

## Real-World Use Case: Stopping a Credential Stuffing Attack

Attack pattern: thousands of IPs trying `/api/login` at 1 request per IP. Standard rate limiting by IP doesn't catch it.

```nginx
http {
    # Rate limit by login endpoint globally (not per IP)
    limit_req_zone $server_name zone=login_global:1m rate=100r/s;

    # Rate limit by IP (catches single-IP attacks)
    limit_req_zone $binary_remote_addr zone=login_ip:10m rate=5r/m;
}

server {
    location /api/login {
        # Apply both limits — both must pass
        limit_req zone=login_global burst=50 nodelay;
        limit_req zone=login_ip burst=3 nodelay;
        limit_req_status 429;

        proxy_pass http://auth;
    }
}
```

---

## Common Mistakes

**Mistake 1: Putting `limit_req_zone` in the `server` block**
`limit_req_zone` must be in the `http` block. Putting it in `server` causes a config error.

**Mistake 2: Not setting `limit_req_status 429`**
Default is 503 (Service Unavailable). For API rate limiting, 429 (Too Many Requests) is the correct HTTP status and what clients expect.

**Mistake 3: Not returning a `Retry-After` header**

```nginx
location /api/ {
    limit_req zone=api burst=20 nodelay;
    limit_req_status 429;

    # Tell clients when to retry
    add_header Retry-After 60 always;
    proxy_pass http://backend;
}
```

**Mistake 4: Zone too small**
Each IP entry uses ~64 bytes. `10m` = 10MB = ~160,000 unique IPs. For high-traffic sites, increase the zone.

```nginx
limit_req_zone $binary_remote_addr zone=api:50m rate=10r/s;
```

**Mistake 5: `nodelay` without understanding burst**
`nodelay` with `burst=0` (default) allows no burst at all — every request above the rate is immediately rejected. Set burst to something reasonable.

---

## Pro Tips

```bash
# Test your rate limit config
ab -n 100 -c 20 https://yourdomain.com/api/endpoint

# Watch for rate limiting in nginx log
tail -f /var/log/nginx/error.log | grep "limiting requests"

# Count rate limit hits per minute
awk '/limiting requests/{print substr($1,1,16)}' /var/log/nginx/error.log \
  | sort | uniq -c | sort -rn | head
```

```nginx
# Rate limit with custom response body
limit_req zone=api burst=20 nodelay;
limit_req_status 429;

# Return JSON on rate limit
error_page 429 /429.json;
location = /429.json {
    internal;
    default_type application/json;
    return 429 '{"error":"rate_limit_exceeded","message":"Too many requests, slow down"}';
}
```

---

## Conclusion

`limit_req_zone` + `limit_req` with `burst` and `nodelay` is the production-ready combination. Use `limit_req_status 429` for APIs. Whitelist internal IPs via `geo` + `map`. Set up monitoring on the error log for rate limit hits — unexpected spikes in limiting events are an early signal of an attack.

---

*Related: [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load) — rate limits can expose upstream capacity issues. [NGINX SSL Hardening](/blog/nginx-ssl-hardening) — full production NGINX security config.*
