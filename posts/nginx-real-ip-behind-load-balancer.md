---
title: "NGINX Real Client IP Behind a Load Balancer"
date: "2026-11-10"
updated: "2026-11-10"
excerpt: "Fix $remote_addr showing the load balancer IP with set_real_ip_from and real_ip_recursive, and see which configs let clients spoof X-Forwarded-For."
tags: ["nginx", "security", "networking", "linux", "troubleshooting"]
featured: false
lab: true
category: "nginx"
---

Behind a load balancer, every line in the NGINX access log shows the same address: the load balancer's. Rate limits put all users in one bucket, `allow`/`deny` rules match the wrong host, and the client address you need for an incident is only in `X-Forwarded-For`. The realip module fixes this, and a loose `set_real_ip_from` turns that header into something any client can forge.

This post tests seven realip configurations behind one and two proxy hops, with honest and spoofed headers, and shows which ones hand control of `$remote_addr` to the client.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)` (built `--with-http_realip_module`), curl 8.18.0. Everything ran on one VM over loopback aliases: the "client" was `127.0.0.10` (`curl --interface`), the "load balancer" an NGINX server on `127.0.0.2` and the "CDN" one on `127.0.0.3`, both using `proxy_bind` so the next hop sees the right source address. Installing the config needed root; curl ran as a normal user.

---

## Quick answer

If one load balancer (or a fixed set of them) sits in front of NGINX and appends the client to `X-Forwarded-For`:

```nginx
# trust ONLY the addresses your load balancer connects from
set_real_ip_from 10.0.0.0/24;
real_ip_header   X-Forwarded-For;
# real_ip_recursive off;   (default) take the last address in the header
```

If there are several trusted hops (CDN → load balancer → NGINX), list every hop and turn on recursion:

```nginx
set_real_ip_from 203.0.113.0/24;   # CDN egress ranges
set_real_ip_from 10.0.0.0/24;      # load balancer
real_ip_header   X-Forwarded-For;
real_ip_recursive on;
```

Never `set_real_ip_from 0.0.0.0/0`. In the lab, that let a client pick its own `$remote_addr` and walk past a `deny` rule.

---

## The lab topology

```
client 127.0.0.10 ──► "CDN" 127.0.0.3:8230 ──► "LB" 127.0.0.2:8220 ──► app servers 127.0.0.1:8211-8217
        │                                              ▲
        └──────────────── direct access ───────────────┴──► (tests that skip the LB)
```

The load balancer is ordinary NGINX proxying with the usual headers:

```nginx
server {
    listen 127.0.0.2:8220;
    proxy_bind 127.0.0.2;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    location /B { proxy_pass http://127.0.0.1:8212; }
    ...
}
```

`$proxy_add_x_forwarded_for` takes whatever `X-Forwarded-For` the client sent and appends the client's address. That detail drives every result below.

Each app server returns what NGINX decided. `$realip_remote_addr` holds the original TCP peer, which is useful in logs:

```nginx
server {
    listen 127.0.0.1:8212;   # B: trust the LB only
    set_real_ip_from 127.0.0.2;
    real_ip_header X-Forwarded-For;
    return 200 "B remote_addr=$remote_addr realip_remote_addr=$realip_remote_addr xff=\"$http_x_forwarded_for\"\n";
}
```

| Server | `set_real_ip_from` | `real_ip_header` | `real_ip_recursive` |
|---|---|---|---|
| A | none | none | n/a |
| B | `127.0.0.2` (LB) | `X-Forwarded-For` | off |
| C | `0.0.0.0/0` | `X-Forwarded-For` | off |
| D | `127.0.0.2`, `127.0.0.3` | `X-Forwarded-For` | on |
| E | `127.0.0.2` | `X-Real-IP` | n/a |
| F | `127.0.0.2`, `127.0.0.3` | `X-Forwarded-For` | off |
| G | `0.0.0.0/0` | `X-Forwarded-For` | on |

---

## One load balancer

### No realip: everything is the load balancer

```
== 1. via LB, no realip (A)
A remote_addr=127.0.0.2 realip_remote_addr=127.0.0.2 xff="127.0.0.10"
```

The client address is only in the header. Logs, `limit_req` keys and `allow`/`deny` all see `127.0.0.2`.

### Trust the load balancer only

```
== 2. via LB, realip trusts LB (B)
B remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xff="127.0.0.10"
== 3. via LB, client spoofs XFF (B)
B remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xff="1.2.3.4, 127.0.0.10"
== 5. direct to B, spoofed XFF
B remote_addr=127.0.0.10 realip_remote_addr=127.0.0.10 xff="1.2.3.4"
```

- Test 2: the TCP peer is the trusted LB, so NGINX replaced `$remote_addr` with the address from the header.
- Test 3: the client sent `X-Forwarded-For: 1.2.3.4`. The LB appended the real address, giving `1.2.3.4, 127.0.0.10`. With `real_ip_recursive off`, NGINX takes the **last** address, which the LB wrote, so the fake value was ignored.
- Test 5: a client connecting directly isn't in `set_real_ip_from`, so its header is ignored completely.

This is the safe baseline: a trusted proxy plus "take the last entry".

### A load balancer that forwards the header as-is

Some proxies (or a hand-written `proxy_set_header X-Forwarded-For $http_x_forwarded_for;`) pass the client's header through instead of appending to it:

```
== 4. bad LB forwards XFF as-is (B)
B remote_addr=1.2.3.4 realip_remote_addr=127.0.0.2 xff="1.2.3.4"
```

Same app config as test 3, now spoofed. NGINX trusts the LB, and the LB vouched for whatever the client typed. Check what your load balancer does with an incoming `X-Forwarded-For` before you trust it: append, overwrite, or pass through.

### Trusting everyone

Server C trusts `0.0.0.0/0` and has a `deny` rule for the client:

```nginx
location / {
    deny 127.0.0.10;
    allow all;
    add_header X-Seen-As $remote_addr always;
    proxy_pass http://127.0.0.1:8211;
}
```

```
== 6. direct to C (trust 0.0.0.0/0), no XFF
403
== 7. direct to C, spoofed XFF
HTTP/1.1 200 OK
X-Seen-As: 1.2.3.4
== 7b. via LB to C, spoofed XFF
HTTP/1.1 403 Forbidden
X-Seen-As: 127.0.0.10
```

Without a header, the deny rule works. With one forged header, the blocked client got a 200 and NGINX recorded it as `1.2.3.4`. Any access rule, rate limit or log based on `$remote_addr` is now under the client's control.

Test 7b is the nuance: through the appending LB, the last entry was still the real client, so the deny held. The trust-everything config is only exploitable when clients can reach NGINX without going through a proxy that appends, which is exactly the case where the security group or firewall was "temporarily" opened.

The error log also uses the replaced address, so blocked requests are logged under the real client:

```
2026/11/10 02:11:48 [error] 207534#207534: *96 access forbidden by rule, client: 127.0.0.10, server: , request: "GET / HTTP/1.1", host: "127.0.0.1:8213"
```

### A lab trap: return runs before deny

The first version of server C used `return 200 ...` inside the location with the `deny` rule. Test 6 returned **200** for the denied client. `return` belongs to the rewrite phase, which runs before the access phase, so `deny` was never evaluated. If you test access rules with a `return`-only location, you'll get a false pass. Use `proxy_pass`, `root` or `try_files` in the test location instead.

---

## X-Real-IP instead of X-Forwarded-For

```
== 8. via LB, X-Real-IP (E)
E remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xreal="127.0.0.10"
== 9. via LB, client sends X-Real-IP (E)
E remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xreal="127.0.0.10"
```

The LB sets `X-Real-IP $remote_addr`, which **overwrites** whatever the client sent. The spoof in test 9 never reached the app. With a single proxy that overwrites, `X-Real-IP` is simple and hard to abuse. It can't carry more than one hop, though, so it doesn't work behind a CDN plus a load balancer.

---

## Two hops: CDN, load balancer, NGINX

Now the client goes through the "CDN" on `127.0.0.3`, which appends to `X-Forwarded-For` and passes the request to the LB, which appends again.

```
== 10. CDN->LB->app, recursive off (F)
F remote_addr=127.0.0.3 realip_remote_addr=127.0.0.2 xff="127.0.0.10, 127.0.0.3"
== 11. CDN->LB->app, recursive on (D)
D remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xff="127.0.0.10, 127.0.0.3"
== 12. CDN->LB->app, recursive on, spoofed (D)
D remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xff="1.2.3.4, 127.0.0.10, 127.0.0.3"
```

- Test 10: without recursion, NGINX took the last entry, `127.0.0.3`. Every request now looks like it came from the CDN. This is the classic "I configured realip and it still shows a proxy address" symptom.
- Test 11: with `real_ip_recursive on`, NGINX walks the list from the right and skips addresses in `set_real_ip_from`. `127.0.0.3` is trusted, so it moved on to `127.0.0.10`.
- Test 12: the spoofed `1.2.3.4` sits further left. NGINX stopped at the first **untrusted** address, the real client, and never reached the fake one.

```
X-Forwarded-For:  1.2.3.4,  127.0.0.10,  127.0.0.3      (TCP peer 127.0.0.2)
                     ▲           ▲            ▲                  ▲
              client-supplied  first     trusted (CDN)     trusted (LB)
                (ignored)    untrusted ── skip ◄────────── start here
                             = $remote_addr
```

### Recursion plus trust-everything

```
== 13. CDN->LB->app, recursive on, trust all, spoofed (G)
G remote_addr=1.2.3.4 realip_remote_addr=127.0.0.2 xff="1.2.3.4, 127.0.0.10, 127.0.0.3"
== 14. via LB, recursive on, trust all, spoofed (G)
G remote_addr=1.2.3.4 realip_remote_addr=127.0.0.2 xff="1.2.3.4, 127.0.0.10"
```

When every address is trusted, recursion skips all of them and lands on the leftmost value, which the client wrote. Unlike server C, this was spoofable even through a correctly appending load balancer. `real_ip_recursive on` is only safe with a precise trusted list.

---

## Malformed headers

```
== 15. via LB, garbage XFF (B)
B remote_addr=127.0.0.10 realip_remote_addr=127.0.0.2 xff="not-an-ip, 127.0.0.10"
== 17. bad LB, garbage XFF (B)
B remote_addr=127.0.0.2 realip_remote_addr=127.0.0.2 xff="not-an-ip"
```

Junk on the left was ignored because NGINX only read the last entry. When the selected entry wasn't a valid address, NGINX kept the TCP peer. In this lab, a bad value didn't cause an error, only a silent fallback to the proxy address.

---

## Results at a glance

| Setup | Honest request | Client-forged XFF |
|---|---|---|
| No realip | LB address | LB address |
| Trust LB, recursive off, LB appends | real client | real client |
| Trust LB, LB passes header through | real client | **forged** |
| Trust `0.0.0.0/0`, recursive off, via appending LB | real client | real client |
| Trust `0.0.0.0/0`, direct access | client | **forged**, bypassed `deny` |
| Two hops, recursive off | CDN address | CDN address |
| Two hops, both trusted, recursive on | real client | real client |
| Trust `0.0.0.0/0`, recursive on | real client | **forged** |
| `X-Real-IP` set by LB | real client | real client |

---

## Checklist

1. Find the addresses your proxies connect **from** (LB private subnet, CDN published egress ranges) and put only those in `set_real_ip_from`.
2. Confirm the proxy appends to or overwrites `X-Forwarded-For`, never passes it through.
3. Use `real_ip_recursive on` only when there's more than one trusted hop.
4. Block direct access to the backend at the network level, so only the proxies can connect.
5. Log both addresses: `log_format ... '$remote_addr realip=$realip_remote_addr xff="$http_x_forwarded_for"'`. When something looks off, the three values together tell you which hop wrote what, which helps with the kind of triage in [log analysis for incident triage](/blog/log-analysis-incident-triage).

Put realip in the `http` or `server` block so it applies before access rules and rate limiting. Per-client rate limits depend on it, see [NGINX rate limiting](/blog/nginx-rate-limiting-config); access rules show up as the 403s described in [NGINX 403 Forbidden](/blog/nginx-403-forbidden-fix). To spot `set_real_ip_from 0.0.0.0/0` in a large config, paste `nginx -T` into the [NGINX Config Analyzer](/tools/nginx-config-analyzer).

---

## FAQ

**Why does NGINX log the load balancer IP instead of the client IP?**
NGINX logs the TCP peer. Without `set_real_ip_from` and `real_ip_header`, it ignores `X-Forwarded-For`, so the peer is the load balancer.

**Which address does real_ip_header X-Forwarded-For use?**
With `real_ip_recursive off`, the last address in the header. With it on, the rightmost address that isn't in `set_real_ip_from`.

**Is set_real_ip_from 0.0.0.0/0 safe behind a load balancer?**
No. In the lab, it was spoofable whenever the client could reach NGINX directly, and with `real_ip_recursive on` it was spoofable even through the load balancer.

**Should I use X-Real-IP or X-Forwarded-For?**
`X-Real-IP` works for a single proxy that overwrites it. With several hops, use `X-Forwarded-For` with every hop in `set_real_ip_from` and `real_ip_recursive on`.

**How do I see the original peer address after realip changes it?**
Log `$realip_remote_addr`. It keeps the address of the proxy that connected to NGINX.
