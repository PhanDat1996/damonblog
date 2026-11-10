---
title: "NGINX proxy_cache Setup: X-Cache-Status and Pitfalls"
date: "2026-11-10"
updated: "2026-11-10"
excerpt: "Set up NGINX proxy_cache and read X-Cache-Status: lab-tested MISS, HIT, EXPIRED, STALE, UPDATING and BYPASS, plus cache-key mistakes that leak pages."
tags: ["nginx", "troubleshooting", "production", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

You turned on `proxy_cache`, added an `X-Cache-Status` header, and every response still says `MISS`. Or the opposite: the cache works, and one user's page shows up for another, or site B serves site A's home page. Both come from the same few rules about what NGINX stores and under which key.

This post builds a cache in front of a small backend that counts its requests, so every result shows whether the backend was actually hit.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, curl 8.18.0, Python 3.14.4 backend on `127.0.0.1:8251` (`ThreadingHTTPServer`). NGINX listened on `127.0.0.1:8250`. The backend returns `n=<request count for this path>`, so `n` only goes up when a request reached it. Installing the config and reading cache files needed root; curl and the backend ran as a normal user.

---

## Quick answer: a working config

```nginx
# http {} context
proxy_cache_path /var/cache/nginx/app levels=1:2 keys_zone=app:10m
                 max_size=1g inactive=60m use_temp_path=off;

server {
    location / {
        proxy_pass http://app_backend;
        proxy_cache app;
        proxy_cache_valid 200 301 10m;         # cache even without Cache-Control
        proxy_cache_lock on;                   # one backend request per cold key
        proxy_cache_use_stale error timeout http_500 http_502 updating;
        proxy_cache_background_update on;
        proxy_cache_bypass $cookie_sid;        # logged-in users skip the cache...
        proxy_no_cache     $cookie_sid;        # ...and their pages aren't stored
        add_header X-Cache-Status $upstream_cache_status always;
    }
}
```

On Ubuntu, `nginx -t` fails with this config until the parent directory exists:

```
[emerg] 207741#207741: mkdir() "/var/cache/nginx/lab-cache" failed (2: No such file or directory)
```

NGINX creates the last directory of the path, but the Ubuntu package doesn't ship `/var/cache/nginx`. `sudo mkdir /var/cache/nginx` fixed it, and NGINX then created `lab-cache` owned by `www-data`, mode `700`.

---

## What each X-Cache-Status means

| Status | Meaning | Backend contacted? |
|---|---|---|
| `MISS` | Not in cache (or not cacheable) | Yes |
| `HIT` | Served from a fresh cache entry | No |
| `EXPIRED` | Entry was stale, fetched a new copy | Yes |
| `STALE` | Served an old entry because of `proxy_cache_use_stale` | Maybe, see below |
| `UPDATING` | Served an old entry while another request refreshes it | No (for this request) |
| `BYPASS` | `proxy_cache_bypass` matched, cache not read | Yes |

All of these showed up in the lab. `REVALIDATED` (with `proxy_cache_revalidate`) wasn't tested.

---

## Why everything is MISS

The test scripts use a small helper that prints the cache status and the body:

```bash
U=http://127.0.0.1:8250
r() { curl -s -D /tmp/h -o /tmp/b "$@"
      printf "%-8s %s\n" "$(grep -i x-cache-status /tmp/h | cut -d' ' -f2 | tr -d '\r')" "$(cat /tmp/b)"; }
```

```
== /none/ (no proxy_cache_valid, no Cache-Control)
MISS     n=1 path=/none/a host=127.0.0.1 cookie=-
MISS     n=2 path=/none/a host=127.0.0.1 cookie=-
== /none/cc (backend sends Cache-Control: max-age=5)
MISS     n=1 path=/none/cc host=127.0.0.1 cookie=-
HIT      n=1 path=/none/cc host=127.0.0.1 cookie=-
EXPIRED  n=2 path=/none/cc host=127.0.0.1 cookie=-
```

`proxy_cache` alone stores nothing if the response has no lifetime. The backend's `/none/a` sent no `Cache-Control` or `Expires`, and there was no `proxy_cache_valid`, so every request went through (`n` counts 1, 2). When the backend sent `Cache-Control: max-age=5`, the second request was a `HIT` and, after six seconds, `EXPIRED`.

Adding `proxy_cache_valid 200 10s` gives responses a lifetime even when the backend doesn't:

```
== /valid/ (proxy_cache_valid 200 10s)
MISS     n=1 path=/valid/a host=127.0.0.1 cookie=-
HIT      n=1 path=/valid/a host=127.0.0.1 cookie=-
MISS     n=1 path=/valid/a?x=1 host=127.0.0.1 cookie=-
```

The fourth request was `curl -I`, a `HEAD`, and it came back `HIT`:

```
HIT      HTTP/1.1 200 OK
...
X-Cache-Status: HIT
```

A different query string is a different cache key, so `?x=1` was a separate `MISS`. The `HEAD` request was answered from the cached `GET` (`proxy_cache_convert_head` is on by default).

### Responses NGINX refuses to cache

```
== /valid/setcookie (Set-Cookie)
MISS     n=1 path=/valid/setcookie host=127.0.0.1 cookie=-
MISS     n=2 path=/valid/setcookie host=127.0.0.1 cookie=-
== /valid/private (Cache-Control: private)
MISS     n=1 path=/valid/private host=127.0.0.1 cookie=-
MISS     n=2 path=/valid/private host=127.0.0.1 cookie=-
```

Even with `proxy_cache_valid`, a response with `Set-Cookie` or `Cache-Control: private` wasn't stored. If a framework sets a session cookie on every page, nothing gets cached. Override with `proxy_ignore_headers Set-Cookie Cache-Control` only if you're sure the response is the same for everyone, and then also `proxy_hide_header Set-Cookie`.

### Expiry has one-second granularity

A request every second against a 10-second entry:

```
t= 0s 02:13:14.158  X-Cache-Status: MISS
t= 1s 02:13:15.193  X-Cache-Status: HIT
...
t=10s 02:13:24.523  X-Cache-Status: HIT
t=11s 02:13:25.561  X-Cache-Status: EXPIRED
t=12s 02:13:26.604  X-Cache-Status: HIT
```

The entry was still served at +10 s and refreshed at +11 s. This only matters when you write a test with `sleep 10` and expect `EXPIRED`; the first test run here did exactly that and got `HIT`.

---

## Bypass still writes to the cache

`/bypass/` has `proxy_cache_bypass $http_x_nocache`. The third request sent `X-NoCache: 1`:

```
== /bypass/
MISS     n=1 path=/bypass/a host=127.0.0.1 cookie=-
HIT      n=1 path=/bypass/a host=127.0.0.1 cookie=-
BYPASS   n=2 path=/bypass/a host=127.0.0.1 cookie=-
HIT      n=2 path=/bypass/a host=127.0.0.1 cookie=-
```

After the `BYPASS` request, the next normal request got `n=2`: the bypassed response replaced the cached one. `proxy_cache_bypass` only skips **reading** the cache. That's useful as a manual refresh, and dangerous if the bypass condition is "this user is logged in", because then the logged-in response is stored for everyone. `proxy_no_cache` is the directive that skips **storing**.

---

## The cache key pitfalls

The default key is `$scheme$proxy_host$request_uri`. Two things are missing from it: cookies and the `Host` header the client sent.

### A logged-in page served to everyone

The backend returns the cookie it received, like a page that greets the user. Three requests: Alice's cookie, Bob's cookie, no cookie:

```bash
r -H "Cookie: sid=alice" $U/user/profile
r -H "Cookie: sid=bob"   $U/user/profile
r $U/user/profile
```

```
== per-user page cached for everyone
MISS     n=1 path=/user/profile host=127.0.0.1 cookie=sid=alice
HIT      n=1 path=/user/profile host=127.0.0.1 cookie=sid=alice
HIT      n=1 path=/user/profile host=127.0.0.1 cookie=sid=alice
```

Bob and an anonymous visitor both received Alice's page. NGINX didn't refuse to cache it because the **response** had no `Set-Cookie` and no `private`; the request cookie doesn't count. With both directives on the session cookie:

```nginx
proxy_cache_bypass $cookie_sid;
proxy_no_cache     $cookie_sid;
```

```
BYPASS   n=1 path=/user-fixed/profile host=127.0.0.1 cookie=sid=alice
BYPASS   n=2 path=/user-fixed/profile host=127.0.0.1 cookie=sid=bob
MISS     n=3 path=/user-fixed/profile host=127.0.0.1 cookie=-
HIT      n=3 path=/user-fixed/profile host=127.0.0.1 cookie=-
```

Logged-in users always reach the backend, and only the anonymous version is cached. The better long-term fix is for the backend to send `Cache-Control: private` on personalized pages.

### Two sites share one cache entry

Two `server` blocks, `a.test` and `b.test`, proxy to the same `upstream lab_cache_app` with `proxy_set_header Host $host`. The backend sees the right host, but `$proxy_host` is the upstream name for both. One request with `Host: a.test`, then one with `Host: b.test`:

```
== two vhosts, same upstream, default key
MISS     n=1 path=/site/home host=a.test cookie=-
HIT      n=1 path=/site/home host=a.test cookie=-
```

`b.test` got `a.test`'s page. The cache file shows why:

```
$ sudo grep -rl "KEY: http://lab_cache_app/site/home" /var/cache/nginx/lab-cache
/var/cache/nginx/lab-cache/1/44/8aee78c9da510b1388fa8357f8d5a441
$ sudo head -c 600 /var/cache/nginx/lab-cache/1/44/8aee78c9da510b1388fa8357f8d5a441 | strings
KEY: http://lab_cache_app/site/home
HTTP/1.0 200 OK
Server: BaseHTTP/0.6 Python/3.14.4
...
n=1 path=/site/home host=a.test cookie=-
```

The key has no client host in it. The file name is the MD5 of the key, and `levels=1:2` takes the directories from its end (`...a441` → `1/44/`). With the host in the key:

```nginx
proxy_cache_key $scheme$host$request_uri;
```

```
MISS     n=1 path=/site-fixed/home host=a.test cookie=-
MISS     n=2 path=/site-fixed/home host=b.test cookie=-
HIT      n=2 path=/site-fixed/home host=b.test cookie=-
```

Any time the backend varies its response by something that isn't in the key (host, cookie, a header like `Accept-Language`), add that to the key or don't cache it.

---

## Serving stale content when the backend fails

`/stale/` has `proxy_cache_use_stale error timeout http_500 http_502`; `/valid/` doesn't. Both entries were cached, left to expire, and then the backend started returning 500. This helper variant also prints the status code and total time:

```
-- /stale/ (use_stale http_500):
STALE    200 0.002020s  n=1 path=/stale/a host=127.0.0.1 cookie=-
STALE    200 0.001508s  n=1 path=/stale/a host=127.0.0.1 cookie=-
-- /valid/b (no use_stale), expired, backend 500:
EXPIRED  500 0.002199s  n=2 path=/valid/b host=127.0.0.1 cookie=-
```

With `use_stale`, users kept getting the old page with a 200. Without it, the 500 went straight through. Stopping the backend entirely gave the same split, first `/stale/down`, then `/valid/down`:

```
HTTP/1.1 200 OK X-Cache-Status: STALE
HTTP/1.1 502 Bad Gateway X-Cache-Status: EXPIRED
```

and the error log still recorded each failed attempt:

```
2026/11/10 02:14:35 [error] 207809#207809: *228 connect() failed (111: Connection refused) while connecting to upstream, client: 127.0.0.1, server: a.test, request: "GET /stale/down HTTP/1.1", upstream: "http://127.0.0.1:8251/stale/down", host: "127.0.0.1:8250"
```

So a stale cache hides an outage from users but not from the error log. Monitor the log or upstream health, not only the response codes. The [502 under load](/blog/nginx-502-under-load) post covers what those upstream errors mean.

---

## Slow backends: lock and background update

### proxy_cache_lock

Ten simultaneous requests for a cold URL whose backend takes 2 seconds:

```
nolock: backend hits = 10
lock: backend hits = 1
```

Without the lock, every request that arrives before the first response is stored goes to the backend. On a popular URL after a deploy or cache purge, that's a stampede. With `proxy_cache_lock on`, one request fills the cache and the others wait for it (up to `proxy_cache_lock_timeout`, 5 s by default).

### Background update

`/bg/` has a 3-second lifetime, `proxy_cache_use_stale updating` and `proxy_cache_background_update on`. The backend path sleeps 2 seconds:

```
MISS     200 2.002943s  n=1 path=/bg/slow host=127.0.0.1 cookie=-
STALE    200 0.201650s  n=1 path=/bg/slow host=127.0.0.1 cookie=-
UPDATING 200 0.000479s  n=1 path=/bg/slow host=127.0.0.1 cookie=-
HIT      200 0.000734s  n=2 path=/bg/slow host=127.0.0.1 cookie=-
```

- The first request paid the full 2 seconds.
- After expiry, the next request got the old copy (`STALE`, `n=1`) in 0.2 s while NGINX started a refresh in the background.
- A request during the refresh got `UPDATING`, also the old copy.
- Once the refresh finished, the cache held `n=2`.

No user waited for the slow backend after the first fill. The trade-off is that users see content up to one refresh old.

---

## Troubleshooting checklist

| Symptom | Check |
|---|---|
| Always `MISS` | Response has a lifetime? (`proxy_cache_valid` or `Cache-Control`). `Set-Cookie`/`private` in the response? |
| No `X-Cache-Status` header at all | `proxy_cache` not set in this location, or the request went to a different location, see [location matching order](/blog/nginx-location-matching-order) |
| User sees someone else's page | Request cookie not in key and not in `proxy_no_cache` |
| Site B shows site A | Default key uses `$proxy_host`; add `$host` |
| Backend overloaded after purge | `proxy_cache_lock on` |
| `nginx -t` fails with `mkdir()` | Parent of the `proxy_cache_path` directory missing |
| Errors in log but users see 200 | Working as designed with `proxy_cache_use_stale`; fix the backend |

To review cache directives across a large config, run `nginx -T` and paste it into the [NGINX Config Analyzer](/tools/nginx-config-analyzer). For the general request-tracing workflow, see the [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide).

---

## FAQ

**Why is X-Cache-Status always MISS?**
The response has no lifetime (no `proxy_cache_valid`, no `Cache-Control: max-age` or `Expires`), or it carries `Set-Cookie` or `Cache-Control: private`. NGINX doesn't store those.

**Does proxy_cache_bypass stop NGINX from storing the response?**
No. In the lab, a bypassed response replaced the cached entry. Use `proxy_no_cache` to stop storing.

**Does NGINX include the Host header in the cache key?**
Not by default. The default key is `$scheme$proxy_host$request_uri`, so two sites using the same upstream share entries. Use `$host` in `proxy_cache_key`.

**How do I serve cached pages when the backend is down?**
Use `proxy_cache_use_stale error timeout http_500 http_502`. Expired entries are then served with `X-Cache-Status: STALE`.

**Where does NGINX store cached responses?**
Under the `proxy_cache_path` directory, one file per key, named by the MD5 of the key. The first line of the file is `KEY: ...`.
