---
title: "NGINX Rate Limiting: limit_req, burst and nodelay Tested"
date: "2026-04-22"
updated: "2026-10-31"
excerpt: "Lab-tested NGINX rate limiting: what burst, nodelay and delay=N really do to 15 parallel requests, why return skips limit_req, and how to 429 and dry-run."
tags: ["nginx", "security", "infrastructure", "production"]
featured: false
category: "nginx"
lab: true
---

You set `rate=10r/s` on an API, and pages that fire a handful of parallel calls start getting errors, even though no client is anywhere near 10 requests per second. Most of the parallel requests come back `503`, and nothing in the backend logs explains it.

`rate=10r/s` doesn't mean "10 requests in any given second". It means one request every 100 ms, and without `burst`, anything that arrives sooner is rejected. Everything below was measured on a lab VM by sending 15 requests from one IP at the same instant.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, Python 3.14 test clients, all traffic on `127.0.0.1`. Each scenario had its own zone at `rate=10r/s` so results don't leak between tests. Installing the test config needed root.

---

## Quick answer

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

- `limit_req_zone` (http context only) sets the key, the shared memory and the rate.
- `limit_req` applies it. `burst` is how much excess a client may build up. `nodelay` serves that excess immediately instead of queueing it.
- `limit_req_status 429` replaces the default `503`.
- `limit_req` does **not** run for a location that answers with `return`. The lab result is below.

---

## 15 parallel requests, four configs

The test client opened 15 connections, waited on a barrier, and released all 15 requests at once. Raw output from the lab, with per-request latency sorted:

```
/b0/x from 127.0.0.1: 200:1, 503:14
/b5/x from 127.0.0.1: 200:6, 429:9
  latency ms by status: 429/1 429/2 429/2 429/3 429/3 429/4 429/4 200/5 429/5 429/5 200/101 200/202 200/301 200/401 200/500
/b5n/x from 127.0.0.1: 200:6, 429:9
  latency ms by status: 429/1 429/1 200/2 429/2 429/2 200/3 200/5 429/5 429/5 200/7 200/8 200/8 429/8 429/9 429/9
/b5d/x from 127.0.0.1: 200:6, 429:9
  latency ms by status: 429/0 200/1 429/1 429/2 429/2 200/3 429/3 429/3 429/5 429/5 200/6 429/6 200/101 200/201 200/301
```

| Location config | 200 | Rejected | What the 200s looked like |
|---|---|---|---|
| `limit_req zone=b0;` | 1 | 14 × `503` | default status is 503 |
| `burst=5` | 6 | 9 × `429` | 1 immediate, 5 released at 101, 202, 301, 401, 500 ms |
| `burst=5 nodelay` | 6 | 9 × `429` | all 6 within 8 ms |
| `burst=5 delay=2` | 6 | 9 × `429` | 3 immediate, 3 at 101, 201, 301 ms |

Burst controls **how many** get through. `nodelay` and `delay=N` only control **when**.

```
rate=10r/s, burst=5, 15 requests at t=0

no nodelay   t=0 ▇ | 100ms ▇ | 200ms ▇ | 300ms ▇ | 400ms ▇ | 500ms ▇     9 rejected at t=0
nodelay      t=0 ▇▇▇▇▇▇                                                   9 rejected at t=0
delay=2      t=0 ▇▇▇ | 100ms ▇ | 200ms ▇ | 300ms ▇                        9 rejected at t=0
```

With `nodelay`, the burst slots are still used up. They refill at the rate. A follow-up test sent 50 req/s for 4 seconds to the `burst=5 nodelay` location:

```
/b5n/x at 50 req/s for 4s: s0: 15/50 ok | s1: 10/50 ok | s2: 10/50 ok | s3: 10/50 ok
```

The first second got 15 through: the 6 from the initial burst, plus slots refilling at one per 100 ms. After that it settled at the configured 10 per second.

Which to use:

- **`burst` + `nodelay`**: the usual choice for APIs and pages. Spikes pass without added latency, sustained abuse is still capped.
- **`burst` alone**: smooths load on a fragile backend, at the cost of up to `burst / rate` seconds of added latency. In the lab the last delayed request waited 500 ms for `burst=5`.
- **`delay=N`**: the first N excess requests pass immediately, the rest of the burst is paced.

---

## return skips limit_req

This is where the lab disagreed with how the directive is usually described. A location with both `limit_req` and `return` was never limited:

```nginx
location /ret/ { limit_req zone=ret; return 200 "ok\n"; }
```

```
/ret/x from 127.0.0.1: 200:15
```

The same burst that got 14 rejections on `/b0/` got 15 successes here, and all 15 access log lines had `rl=-` (`$limit_req_status` empty, meaning the limiter never ran). `return` is handled in the rewrite phase, which comes before the preaccess phase where `limit_req` runs, so the request is answered before the limiter sees it.

In practice this matters for locations that only redirect or return a fixed response, such as a login stub or a "maintenance" response. If you want those limited, let the request reach the content phase (for example `try_files` or `proxy_pass`), or limit them at a level that's actually reached.

---

## Inheritance: one limit_req replaces the outer ones

The lab server had `limit_req zone=outer;` (1r/s) at server level, then two locations:

```nginx
limit_req zone=outer;   # server level, 1r/s

location /inner/ { limit_req zone=inner burst=100 nodelay; limit_req_status 429; }
location /plain/ { limit_req_status 429; }
```

```
/inner/x from 127.0.0.1: 200:15
/plain/x from 127.0.0.1: 200:1, 429:14
```

`/plain/` has no `limit_req` of its own, so it inherited the server-level 1r/s limit. `/inner/` has its own, so the server-level limit stopped applying there entirely. If you want both, list both `limit_req` lines in the location. Several `limit_req` lines at the same level all apply, and a request must pass every one:

```nginx
location = /auth/login {
    limit_req zone=login_ip     burst=5   nodelay;   # per client
    limit_req zone=login_global burst=100 nodelay;   # everyone together
    limit_req_status 429;
    proxy_pass http://auth_backend;
}
```

with `login_ip` keyed on `$binary_remote_addr` and `login_global` keyed on `$server_name`. The global zone is what catches credential stuffing from many IPs at one request each. The multi-IP case wasn't load tested in the lab, so size the global rate from your own peak login traffic.

---

## Exempting trusted addresses

Requests whose key is empty aren't counted. The lab exempted `127.0.0.2` with `geo` and `map`:

```nginx
geo $lab_rate_limited {
    default        1;
    127.0.0.2/32   0;
}
map $lab_rate_limited $lab_limit_key {
    0 "";
    1 $binary_remote_addr;
}
limit_req_zone $lab_limit_key zone=ex:10m rate=10r/s;
```

Same 15-request burst, from two source addresses:

```
/ex/x from 127.0.0.1: 200:1, 429:14
/ex/x from 127.0.0.2: 200:15
```

Behind a load balancer or CDN, fix the client address first with the realip module (`set_real_ip_from` your proxy ranges, `real_ip_header X-Forwarded-For`). Otherwise `$binary_remote_addr` is the proxy, and every user shares one bucket. That setup wasn't part of this lab.

---

## Return a real 429 with Retry-After

Put `Retry-After` on the rejected responses only, with a named location:

```nginx
location /api429/ {
    limit_req zone=r429 burst=2 nodelay;
    limit_req_status 429;
    error_page 429 = @rate_limited;
}
location @rate_limited {
    default_type application/json;
    add_header Retry-After 1 always;
    return 429 '{"error":"rate_limited"}';
}
```

Five parallel requests with `burst=2` gave `200:3, 429:2`, and a rejected response looked like this:

```
HTTP/1.1 429 Too Many Requests
Server: nginx/1.28.3 (Ubuntu)
Date: Fri, 30 Oct 2026 15:32:53 GMT
Content-Type: application/json
Content-Length: 24
Connection: keep-alive
Retry-After: 1

{"error":"rate_limited"}
```

`always` matters: without it `add_header` only applies to 2xx and 3xx responses.

---

## Roll out with dry run

`limit_req_dry_run on` runs the limiter but never rejects or delays. Log `$limit_req_status` to see what it would have done:

```nginx
log_format labrl '$remote_addr $status "$request" rl=$limit_req_status rt=$request_time';

location /dry/ { limit_req zone=dry burst=5 nodelay; limit_req_dry_run on; limit_req_status 429; }
```

```
/dry/x from 127.0.0.1: 200:15
```

```
127.0.0.1 200 "GET /dry/x HTTP/1.1" rl=PASSED rt=0.000
...
127.0.0.1 200 "GET /dry/x HTTP/1.1" rl=PASSED rt=0.000
127.0.0.1 200 "GET /dry/x HTTP/1.1" rl=REJECTED_DRY_RUN rt=0.000
127.0.0.1 200 "GET /dry/x HTTP/1.1" rl=REJECTED_DRY_RUN rt=0.000
```

Every request got `200`. Six were `PASSED` (1 + burst of 5), and the other nine were `REJECTED_DRY_RUN`, which is exactly the enforced result for the same config. The error log records them too:

```
2026/10/30 15:32:38 [error] 18596#18596: *162 limiting requests, dry run, excess: 5.980 by zone "dry", client: 127.0.0.1, server: , request: "GET /dry/x HTTP/1.1", host: "127.0.0.1:8301"
```

Count would-be rejections per client before enforcing:

```bash
awk '/rl=REJECTED_DRY_RUN/ {print $1}' /var/log/nginx/ratelimit.log | sort | uniq -c | sort -rn | head
```

If the top entries are your own office, monitoring or a partner, fix the exemptions first.

---

## What the error log shows

Rejections are logged at `error`, delays one level lower at `warn`:

```
2026/10/30 15:32:22 [error] 18596#18596: *81 limiting requests, excess: 1.000 by zone "b0", client: 127.0.0.1, server: , request: "GET /b0/x HTTP/1.1", host: "127.0.0.1:8301"
2026/10/30 15:32:25 [warn] 18598#18598: *110 delaying request, excess: 1.000, by zone "b5", client: 127.0.0.1, server: , request: "GET /b5/x HTTP/1.1", host: "127.0.0.1:8301"
```

`excess` is how far over the rate the client was, in requests. `limit_req_log_level warn` moves rejections to `warn` (and delays to `notice`) if they flood error alerts. For slicing the log during an incident, see [log analysis for incident triage](/blog/log-analysis-incident-triage).

---

## Config errors nginx -t catches, and one it doesn't

Three broken configs, tested with `nginx -t -c`:

```
# limit_req_zone inside server {}
[emerg] 18980#18980: "limit_req_zone" directive is not allowed here in /home/damon/labs/nginx-rate-limiting-config/t-inserver.conf:6

# same zone name defined twice
[emerg] 18984#18984: limit_req_zone "api" is already bound to key "$binary_remote_addr" in /home/damon/labs/nginx-rate-limiting-config/t-dupzone.conf:7

# limit_req zone=missing, never defined
nginx: the configuration file /home/damon/labs/nginx-rate-limiting-config/t-nozone.conf syntax is ok
2026/10/30 15:33:29 [emerg] 18988#18988: zero size shared memory zone "missing"
```

The third one prints `syntax is ok` before failing. A script that greps for "syntax is ok" instead of checking the exit code would let it through. Always use `nginx -t && systemctl reload nginx`.

To scan a whole config for rate-limit gaps along with other baseline items, use the [NGINX CIS Hardening Checker](/tools/nginx-cis-hardening-checker). The [NGINX Config Analyzer](/tools/nginx-config-analyzer) flags structural issues like the inheritance trap above.

---

## Common mistakes

| Mistake | What happens |
|---|---|
| No `burst` on page-facing endpoints | Parallel browser requests after the first are rejected (14 of 15 in the lab) |
| Forgetting `limit_req_status 429` | Clients and monitoring see `503`, which looks like an outage |
| `limit_req` + `return` in one location | Limit never runs |
| Own `limit_req` in a location | Server-level limits no longer apply there |
| Rate limiting the load balancer's IP | One shared bucket for everyone |
| Expecting it to stop a DDoS | Traffic still reaches NGINX; drop single abusive sources earlier, for example [with iptables](/blog/iptables-block-ip-example) |

---

## FAQ

**Should rate limiting return 429 or 503?**
429. It's the standard "Too Many Requests" status and clients back off on it. The default 503 looks like a server failure.

**What's the difference between limit_req and limit_conn?**
`limit_req` limits the rate of requests. `limit_conn` limits concurrent connections per key, which helps against slow clients and download hogging. They can be combined.

**Does rate limiting work across several NGINX servers?**
No. Each instance has its own shared memory zone, so three nodes behind a load balancer allow roughly three times the rate per client.

**Do zones survive a reload?**
Yes, as long as the zone name and size stay the same.

---

*Related: [NGINX Troubleshooting Guide](/blog/nginx-troubleshooting-guide) for other NGINX errors. [NGINX 502 under load](/blog/nginx-502-under-load) for when the backend, not the client, is the bottleneck. [NGINX SSL Hardening](/blog/nginx-ssl-hardening) for the TLS side.*
