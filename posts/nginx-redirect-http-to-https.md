---
title: "NGINX Redirect HTTP to HTTPS: One Hop, No Loops"
date: "2026-11-12"
updated: "2026-11-12"
excerpt: "Redirect HTTP to HTTPS and www to non-www in NGINX with one 301, then fix the redirect loop behind a TLS-terminating load balancer. Lab-tested with curl."
tags: ["nginx", "tls", "troubleshooting", "linux", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

The browser says `ERR_TOO_MANY_REDIRECTS`, curl says `Maximum (50) redirects followed`, or the redirect works but takes two hops and a POST arrives as a GET. Most HTTP-to-HTTPS snippets work on a single server and break as soon as a load balancer terminates TLS or a second hostname is added.

This post runs four redirect setups on a real NGINX and follows every chain with `curl -IL`.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, curl 8.18.0, OpenSSL 3.5.5. Each setup listened on its own loopback address (`127.0.0.20`–`127.0.0.25`) on ports 80/443, with a lab CA and a certificate for `example.test` and `www.example.test`. curl used `--resolve` and `--cacert`, so TLS was verified, not skipped with `-k`. The "load balancer" is a second NGINX server block that terminates TLS and proxies over plain HTTP. Installing the config needed root; curl ran as a normal user.

---

## Quick answer

For `example.test` as the canonical name:

```nginx
# Every plain-HTTP request, both names, one hop to the canonical URL
server {
    listen 80 default_server;
    server_name example.test www.example.test;
    return 301 https://example.test$request_uri;
}

# HTTPS on the non-canonical name
server {
    listen 443 ssl;
    server_name www.example.test;
    ssl_certificate     /etc/ssl/example/fullchain.pem;
    ssl_certificate_key /etc/ssl/example/privkey.pem;
    return 301 https://example.test$request_uri;
}

# The real site
server {
    listen 443 ssl;
    server_name example.test;
    ssl_certificate     /etc/ssl/example/fullchain.pem;
    ssl_certificate_key /etc/ssl/example/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    # ...
}
```

- Hard-code the canonical host in the redirect instead of using `$host`.
- Use `$request_uri`, which keeps the path and the query string.
- Behind a load balancer that terminates TLS, check `$http_x_forwarded_proto`, not `$scheme`.
- Use `308` instead of `301` for API paths that receive POST.

---

## Test 1: the one-hop config

`curl -IL` prints the headers of every response in the chain. Filtering for the status line and `Location` gives the full redirect path:

```bash
curl -sIL --cacert ca.crt --resolve example.test:80:127.0.0.20 ... \
  "http://example.test/login?next=/x" | grep -iE "^HTTP|^location|^strict"
```

```
HTTP/1.1 301 Moved Permanently
Location: https://example.test/login?next=/x
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=300
```

The query string survived (`$request_uri` includes it), and HSTS only appears on the HTTPS response, where browsers honour it. The lab used `max-age=300` so a mistake would expire quickly; raise it once the redirect is right.

Both non-canonical entry points also take a single hop:

```
### http://www.example.test/a
HTTP/1.1 301 Moved Permanently
Location: https://example.test/a
HTTP/1.1 200 OK
### https://www.example.test/a
HTTP/1.1 301 Moved Permanently
Location: https://example.test/a
HTTP/1.1 200 OK
```

The HTTPS `www` server still needs a certificate that covers `www.example.test`. The TLS handshake happens before NGINX can send the redirect, so a certificate without that name breaks `https://www...` before the 301 is ever sent.

---

## Test 2: the common copy-paste version

This is the pattern found in many tutorials: redirect with `$host`, and handle `www` with an `if` in the HTTPS server.

```nginx
server {
    listen 80;
    server_name example.test www.example.test;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name example.test www.example.test;
    if ($host = www.example.test) { return 301 https://example.test$request_uri; }
    # ...
}
```

It works, but `http://www` takes two hops:

```
HTTP/1.1 301 Moved Permanently
Location: https://www.example.test/a
HTTP/1.1 301 Moved Permanently
Location: https://example.test/a
HTTP/1.1 200 OK
```

The bigger problem is `$host`. In this lab the port-80 server was the only server on its address, so it also handled requests with any other `Host` header:

```bash
curl -sI -H "Host: evil.test" http://127.0.0.22/reset
```

```
HTTP/1.1 301 Moved Permanently
Location: https://evil.test/reset
```

NGINX built the redirect from whatever `Host` the client sent. The same request against the one-hop config from Test 1:

```
HTTP/1.1 301 Moved Permanently
Location: https://example.test/reset
```

A client can only redirect itself this way, so it's not an exploit on its own. It becomes one when a cache in front of NGINX stores the redirect, or when an application builds absolute links from the same header. Hard-coding the canonical name removes the question. If a server block must handle many names, add a separate `default_server` that rejects unknown hosts (`return 444;`).

---

## Test 3: the redirect loop behind a TLS-terminating load balancer

A typical cloud setup: the load balancer accepts HTTPS from the client and talks plain HTTP to NGINX. The backend tries to force HTTPS with `$scheme`:

```nginx
# Load balancer (TLS terminates here)
server {
    listen 443 ssl;
    location / {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend
server {
    listen 8080;
    location / {
        if ($scheme != "https") { return 301 https://$host$request_uri; }
        # ...
    }
}
```

```
HTTP/1.1 301 Moved Permanently
Location: https://example.test/
HTTP/1.1 301 Moved Permanently
Location: https://example.test/
HTTP/1.1 301 Moved Permanently
Location: https://example.test/
...
curl: (47) Maximum (50) redirects followed
```

The client asked for HTTPS and was told to go to the same HTTPS URL, 51 times. On the backend, `$scheme` is always `http` because the connection from the load balancer is plain HTTP. Browsers stop sooner and show `ERR_TOO_MANY_REDIRECTS`. The same loop appears with any proxy that connects to the origin over HTTP while the client uses HTTPS, such as a CDN in a "flexible" TLS mode.

### Fix: check X-Forwarded-Proto on the backend

The load balancer already sends the client's scheme in `X-Forwarded-Proto`. The backend should use that:

```nginx
server {
    listen 8081;
    location / {
        if ($http_x_forwarded_proto != "https") {
            return 301 https://$host$request_uri;
        }
        # ...
    }
}
```

HTTPS through the load balancer now gets a 200:

```
HTTP/1.1 200 OK
backend D: proto=https
```

and plain HTTP through the load balancer gets exactly one redirect:

```
HTTP/1.1 301 Moved Permanently
Location: https://example.test/x
HTTP/1.1 200 OK
```

`if` with only `return` inside is one of the safe uses of `if` in a location. If the load balancer can do the HTTP-to-HTTPS redirect itself, that's simpler still: the backend then never sees plain-HTTP client traffic.

### The header is only trustworthy from the load balancer

A client that can reach the backend directly can send the header itself:

```bash
curl -si -H "Host: example.test" -H "X-Forwarded-Proto: https" http://127.0.0.24:8081/x
```

```
HTTP/1.1 200 OK
backend D: proto=https
```

That skips the redirect over plain HTTP. Keep the backend port reachable only from the load balancer (security group, firewall or a private listen address). The same trust problem applies to `X-Forwarded-For`; [NGINX real client IP behind a load balancer](/blog/nginx-real-ip-behind-load-balancer) covers how to restrict which hops are trusted.

---

## Test 4: 301 turns POST into GET

Redirects for API endpoints and form posts have a second trap. With curl following redirects:

```bash
curl -sL -v --cacert ca.crt --resolve ... -d "a=1" "http://example.test/form"
```

```
> POST /form HTTP/1.1
< HTTP/1.1 301 Moved Permanently
* Issue another request to this URL: 'https://example.test/form'
> GET /form HTTP/1.1
< HTTP/1.1 200 OK
```

The application received `GET /form` with no body. Browsers do the same for 301 and 302. A `308 Permanent Redirect` keeps the method and body:

```nginx
location /api/ { return 308 https://example.test$request_uri; }
location /     { return 301 https://example.test$request_uri; }
```

```
### POST via 301
app A: GET /form
1 redirects
### POST via 308
app A: POST /api/items
1 redirects
```

Redirecting POSTs still sends the body over plain HTTP first, so clients should be configured with the `https://` URL. The 308 only stops a misconfigured client from silently losing data.

---

## Lookup table

| Symptom | Cause in the lab | Fix |
|---|---|---|
| `Maximum (50) redirects followed` / `ERR_TOO_MANY_REDIRECTS` | Backend checks `$scheme` behind a TLS-terminating proxy | Check `$http_x_forwarded_proto`, or redirect at the load balancer |
| Two 301s for `http://www` | `$host` redirect, then a separate www redirect | Redirect straight to the canonical HTTPS URL |
| `Location:` contains a foreign host | Redirect built from `$host` on a catch-all server | Hard-code the canonical host |
| POST arrives as GET after redirect | 301/302 followed by the client | Use 308 for endpoints that receive POST |
| `https://www` fails before any redirect | Certificate doesn't cover `www` | Add `www` to the certificate's SAN |

To check every `listen`, `server_name` and `return` in a running config, paste `sudo nginx -T` into the [NGINX Config Analyzer](/tools/nginx-config-analyzer). TLS protocol and cipher settings for the HTTPS server are covered in [NGINX SSL hardening](/blog/nginx-ssl-hardening). If a redirect comes from a different block than expected, [NGINX location matching order](/blog/nginx-location-matching-order) shows how NGINX picks one.

---

## FAQ

**Should I use 301 or 302 for HTTP to HTTPS?**
Use 301 (or 308) once the HTTPS site works, because browsers and search engines treat it as permanent. Use 302 while testing, since browsers cache 301 responses.

**Why does my NGINX HTTPS redirect loop behind a load balancer?**
The load balancer connects to NGINX over HTTP, so `$scheme` is always `http`. Check `$http_x_forwarded_proto` instead, or do the redirect on the load balancer.

**Is $host or $server_name better in a redirect?**
Neither, if you have one canonical name: write it literally. `$host` echoes the client's Host header, and `$server_name` is the first name in the block, which may not be the canonical one.

**Does return 301 keep the query string?**
Yes, with `$request_uri`. It contains the original path and query string exactly as the client sent them.

**How do I test a redirect chain?**
Run `curl -sIL http://example.com/path | grep -iE "^HTTP|^location"`. Each 3xx line with its Location is one hop.
