---
title: "NGINX 413 Request Entity Too Large: Fix It Per Location"
date: "2026-10-28"
updated: "2026-10-28"
excerpt: "Uploads fail with 413 Request Entity Too Large? Lab-tested client_max_body_size: the exact limit, the regex location trap, and app vs NGINX 413s."
tags: ["nginx", "troubleshooting", "linux", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

A file upload or a large API request fails with `413 Request Entity Too Large`, and the NGINX error log shows `client intended to send too large body`. NGINX rejected the request body before it ever reached your application. The default limit is 1 MiB, and the fix is `client_max_body_size`. But where you put it matters, and not every 413 comes from NGINX.

All output below is from a lab run against NGINX in front of a small Python upload backend that enforces its own 3 MiB limit.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, curl 8.18.0, Python 3.14 upload backend on `127.0.0.1:9301`. Uploads were random or zero-filled files from 1 MiB to 60 MiB. The backend and curl ran as a normal user. Installing the NGINX test config needed root. PHP was not installed, so PHP's own upload limits aren't covered here.

---

## Quick fix

Raise the limit in the `location` that receives uploads, then reload:

```nginx
location /upload/ {
    client_max_body_size 50m;
    proxy_pass http://app_backend;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

- Default: `1m`. Allowed in `http`, `server` and `location` blocks. An inner block overrides the outer one.
- `0` turns the check off.
- If you still get a 413 after the change, check which location actually matched the request, and whether the 413 came from the app (both below).

---

## The limit is exact: 1 MiB passes, 1 MiB + 1 byte fails

With no `client_max_body_size` set anywhere:

```
exactly 1 MiB to /                     200 up=1048576 t=0.008781 | app: received 1048576 bytes
1 MiB + 1 byte to /                    413 up=0 t=0.000554 | <html> <head><title>413 Request Entity Too Large</title></head> ...
2 MiB to /                             413 up=0 t=0.000570 | <html> <head><title>413 Request Entity Too Large</title></head> ...
```

`1m` means 1,048,576 bytes, and a body of exactly that size is allowed. The error log names the size the client announced:

```
[error] 10856#10856: *61 client intended to send too large body: 1048577 bytes, client: 127.0.0.1, server: , request: "POST / HTTP/1.1", host: "127.0.0.1:8413"
```

Note `up=0`: curl uploaded **zero bytes** of the body, yet got the 413 in half a millisecond. The next section explains why.

---

## NGINX checks Content-Length before reading the body

For a body over 1 MiB, curl sends `Expect: 100-continue` and waits for permission before it uploads:

```
> POST / HTTP/1.1
> Content-Length: 2097152
> Expect: 100-continue
< HTTP/1.1 413 Request Entity Too Large
< Server: nginx/1.28.3 (Ubuntu)
< Content-Length: 192
< Connection: close
```

NGINX compares `Content-Length` with the limit and answers 413 immediately, so the 2 MiB never goes over the wire. Clients that don't send `Expect` start uploading right away, and some of the body is sent before the 413 comes back:

| Request | Status | Bytes curl uploaded | What NGINX logged |
|---|---|---|---|
| 2 MiB, `Expect: 100-continue` | 413 | 0 | `too large body: 2097152 bytes` |
| 2 MiB, no `Expect` | 413 | 917,351 | `too large body: 2097152 bytes` |
| 60 MiB, no `Expect` (3 runs) | 413 | 524,134 / 327,526 / 524,134 | `too large body: 62914560 bytes` |
| 2 MiB, no `Expect`, upload capped at 200 KB/s | 413 | 102,400 | `too large body: 2097152 bytes` |
| 2 MiB, `Transfer-Encoding: chunked` | 413 | 1,769,364 | `too large chunked body: 1048384+65524 bytes` |

**Chunked uploads are different.** Without a `Content-Length`, NGINX can't know the size up front. It reads and buffers the body (the log shows `a client request body is buffered to a temporary file` first) and rejects it only when the running total passes the limit. The log message changes to `client intended to send too large chunked body: <received>+<next chunk> bytes`, so grep for both forms:

```bash
grep -E "too large (chunked )?body" /var/log/nginx/error.log
```

**Not reproduced: "connection reset instead of 413".** A common report is that browsers show a connection reset rather than the 413 page when they upload a large file without `Expect`. In this lab, every client got a clean 413, including a throttled one, most likely because NGINX keeps reading and discarding the rest of the body for a while before it closes the connection (`lingering_close`). This was all over loopback. Over a slow, lossy network or through another proxy, the result may differ.

---

## The regex location trap

A common config: raise the limit for the `/api/` prefix, and have a regex location for PHP files.

```nginx
location /api/ {
    client_max_body_size 20m;
    proxy_pass http://127.0.0.1:9301;
}
location ~ \.php$ {
    proxy_pass http://127.0.0.1:9301;
}
```

```
2 MiB to /api/report                   200 up=2097152 t=0.011213 | app: received 2097152 bytes
2 MiB to /api/import.php               413 up=0 t=0.000500 | <html> <head><title>413 Request Entity Too Large</title></head> ...
```

`/api/import.php` starts with `/api/`, but NGINX picks a matching regex location over a plain prefix location. The request was handled by `location ~ \.php$`, which still has the 1m default. **The 20m limit on `/api/` never applied.** That's why a 413 can remain after "I already raised `client_max_body_size`". Either set the limit at the `server` level so every location inherits it, or set it in the regex location too. To see which locations exist and what each one sets, dump the effective config:

```bash
sudo nginx -T 2>/dev/null | grep -nE "server_name|location|client_max_body_size"
```

---

## Is it NGINX's 413 or your app's?

The test backend rejects anything over 3 MiB with its own 413. Raising NGINX's limit to 50m, or switching it off with `0`, just moves the rejection to the app:

```
2 MiB to /upload/                      200 up=2097152 t=0.012384 | app: received 2097152 bytes
10 MiB to /upload/ (app limit 3 MiB)   413 up=10485760 t=0.022494 | app: body of 10485760 bytes exceeds 3 MiB
60 MiB to /upload/                     413 up=0 t=0.000559 | <html> <head><title>413 Request Entity Too Large</title></head> ...
60 MiB to /nolimit/ (app 3MiB)         413 up=62914560 t=0.106907 | app: body of 62914560 bytes exceeds 3 MiB
```

Access log for the same requests (`ups=$upstream_status`, `len=$request_length`):

```
200 POST /upload/ len=2097334 ups=200 rt=0.011
413 POST /upload/ len=10485943 ups=413 rt=0.022
413 POST /upload/ len=183 ups=- rt=0.000
413 POST /nolimit/ len=62914744 ups=413 rt=0.099
```

| Signal | NGINX rejected it | The app rejected it |
|---|---|---|
| `$upstream_status` | `-` (no upstream contacted) | `413` |
| `$request_length` | Small (headers only) | Full body size |
| Error log | `client intended to send too large body` | Nothing |
| Response body | NGINX HTML page with `nginx/<version>` | The app's own message |

If the backend returned the 413, raising `client_max_body_size` further does nothing. Look for the app's own limit: framework settings, PHP's `upload_max_filesize` / `post_max_size`, or another proxy between NGINX and the app. If PHP sits behind this NGINX, also check it's patched for the two critical 2026 PHP bugs, one of which uses large multipart bodies: [PHP CVE-2026-109618/109619 on NGINX + PHP-FPM](/blog/php-cve-2026-109618-109619-nginx-fpm).

---

## Two side effects worth knowing

**The default 413 page shows your NGINX version:**

```html
<html>
<head><title>413 Request Entity Too Large</title></head>
<body>
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.28.3 (Ubuntu)</center>
</body>
</html>
```

Any client can trigger that by sending a large `Content-Length`. Set `server_tokens off;` in the `http` block (one of the checks in the [NGINX CIS hardening checker](/tools/nginx-cis-hardening-checker)). For a branded or JSON error, use `error_page 413 /413.json;`.

**`a client request body is buffered to a temporary file` is a warning, not an error.** In the lab, every request whose body NGINX actually read (above `client_body_buffer_size`, two memory pages by default) produced this `[warn]` line, for example `/var/lib/nginx/body/0000000003` for the 2 MiB upload to `/upload/`. NGINX spilled the body to disk because it didn't fit in memory. That's normal for uploads. Raise `client_body_buffer_size` only if disk I/O on that path becomes a problem.

---

## Don't just set it to 0 everywhere

`client_max_body_size` is a cheap protection against clients that fill your disk or tie up workers with huge bodies. Give each route the limit it needs:

```nginx
http {
    client_max_body_size 2m;        # sensible default for forms and JSON

    server {
        location /upload/ { client_max_body_size 100m; ... }
        location ~ \.php$ { client_max_body_size 100m; ... }  # if uploads go through PHP
    }
}
```

Large uploads also take a long time on slow links. If uploads fail with a 504 instead of a 413, see [NGINX 504 Gateway Timeout](/blog/nginx-504-gateway-timeout-fix) for how `proxy_read_timeout` works. For other status codes, the [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide) maps each error-log message to its cause. You can also paste your config into the [NGINX config analyzer](/tools/nginx-config-analyzer) to review the limits per location.

---

## FAQ

**What is the default client_max_body_size in NGINX?**
1m, which is 1,048,576 bytes. In the lab, a body of exactly 1,048,576 bytes was accepted and 1,048,577 bytes got a 413.

**Do I need to restart NGINX after changing client_max_body_size?**
No. `sudo nginx -t && sudo systemctl reload nginx` is enough. The new limit applies to new requests.

**Why do I still get 413 after raising client_max_body_size?**
Usually one of two reasons: the request matched a different location (often a regex location like `~ \.php$`) that doesn't have the new value, or the 413 comes from the application. Check `$upstream_status` in the access log. `-` means NGINX rejected it.

**Does client_max_body_size apply to chunked uploads?**
Yes. NGINX buffers the body and rejects it once the total passes the limit. The error log says `too large chunked body` instead of `too large body`.

**What does client_max_body_size 0 do?**
It turns the size check off for that context. In the lab, a 60 MiB body went through NGINX and was rejected by the app's own 3 MiB limit instead.
