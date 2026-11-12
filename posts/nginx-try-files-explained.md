---
title: "NGINX try_files Explained: SPA, PHP and the =404"
date: "2026-11-12"
updated: "2026-11-12"
excerpt: "How NGINX try_files really behaves: SPA fallback serving HTML for missing JS, lost PHP query strings, 403 on $uri/ and the 500 redirection cycle. Lab-tested."
tags: ["nginx", "troubleshooting", "linux", "php", "debugging"]
featured: false
lab: true
category: "nginx"
---

A React or Vue app loads, but a missing JavaScript chunk comes back as `200 text/html`. A Laravel or WordPress route works but `$_GET` is empty. NGINX returns 500 and the error log says `rewrite or internal redirection cycle`. All three come from one line: `try_files`.

This post runs the common `try_files` patterns on a real NGINX and PHP-FPM and shows what each request returned.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, PHP-FPM 8.5 on `/run/php/php8.5-fpm.sock`, curl 8.18.0. Test servers on `127.0.0.1:8150`–`8160` with throwaway document roots under `/var/www/`. Writing the config and files needed root; curl ran as a normal user.

---

## How try_files works

```
try_files  $uri   $uri/   /index.html;
           │      │       │
           │      │       └─ last argument: internal redirect to this URI
           │      │          (or =CODE: return that status)
           │      └─ is there a directory? → hand it to the index module
           └─ is there a file at $document_root$uri?
```

NGINX checks each argument except the last one against the filesystem and serves the first one that exists. The last argument is never checked. It's a URI that NGINX internally redirects to, which runs location matching again, or a status code like `=404`.

Three consequences show up in every test below:

- The fallback URI doesn't have to exist. If it doesn't, NGINX can loop.
- `$uri/` matches any existing directory, with or without an index file.
- A fallback like `/index.php` replaces the query string.

---

## The SPA pattern and the missing-asset trap

The usual single-page-app config:

```nginx
server {
    listen 127.0.0.1:8150;
    root /var/www/lab-tryfiles;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

Requests and results (`curl -w "%{http_code} %{content_type}"`):

```
### /assets/app.js
200 application/javascript 19B
console.log("app")

### /dashboard/settings
200 text/html 61B
<!doctype html><title>SPA</title><div id=app>spa index</div>

### /assets/app.v2.js
200 text/html 61B
<!doctype html><title>SPA</title><div id=app>spa index</div>
```

The client-side route `/dashboard/settings` getting `index.html` is the point of the config. The problem is the last one: `app.v2.js` doesn't exist, and NGINX answers **200 with the HTML page**. After a deployment, a browser holding an old `index.html` asks for chunk files that are gone and gets HTML back with a success status. Browsers then report a MIME type or syntax error instead of a 404, CDNs and service workers can cache the HTML under the `.js` URL, and monitoring sees no errors.

### Fix: assets must exist

```nginx
location /assets/ { try_files $uri =404; }
location /        { try_files $uri $uri/ /index.html; }
```

```
### /assets/app.v2.js
404 text/html 162B
### /assets/app.js
200 application/javascript 19B
### /dashboard/settings
200 text/html 61B
```

Missing assets now return a real 404, and app routes still get `index.html`. Use the directory your build tool writes hashed files to (`/assets/`, `/static/`, `/_next/`).

---

## `$uri/` returns 403 for directories without an index

Same SPA server, three directory requests:

```
### /about
301 text/html 178B
### /about/
200 text/html 11B
about page
### /docs/
403 text/html 162B
```

The 301 for `/about` carried `Location: http://127.0.0.1:8150/about/`. `/about` is a directory, so `$uri/` matched and NGINX redirected to add the trailing slash. `/about/` has an `index.html`, which was served. `/docs/` exists but has no index file, and `autoindex` is off, so the request stops there with 403, never reaching the `/index.html` fallback:

```
[error] 231199#231199: *573 directory index of "/var/www/lab-tryfiles/docs/" is forbidden, client: 127.0.0.1, server: , request: "GET /docs/ HTTP/1.1", host: "127.0.0.1:8150"
```

This is a common source of 403s on SPAs whose client routes share a name with a real directory. If directories never need to be served, drop `$uri/`: `try_files $uri /index.html;`. Other 403 causes, such as permissions on the path, are in [NGINX 403 Forbidden](/blog/nginx-403-forbidden-fix).

---

## 500: rewrite or internal redirection cycle

Same config, but the document root has no `index.html` (a failed deploy, or a wrong `root`):

```nginx
server {
    listen 127.0.0.1:8152;
    root /var/www/lab-tryfiles-empty;
    location / { try_files $uri $uri/ /index.html; }
}
```

```
### /anything
500 text/html 186B
```

```
[error] 231199#231199: *578 rewrite or internal redirection cycle while internally redirecting to "/index.html", client: 127.0.0.1, server: , request: "GET /anything HTTP/1.1", host: "127.0.0.1:8152"
```

The fallback `/index.html` is redirected back into `location /`, where `try_files` fails again and redirects to `/index.html` again. NGINX stops the cycle and returns 500. The fix is to make the fallback exist: check `root` and the deploy, not `try_files`. If you want a clean 404 when the app isn't there, add an exact location for the fallback:

```nginx
location = /index.html { try_files $uri =404; }
location /             { try_files $uri $uri/ /index.html; }
```

With the same empty root, the request then returns a 404 instead of looping:

```
8159 /anything 404
```

---

## PHP front controllers: the query string disappears

Frameworks route every request through `index.php`. Three variants, each with the same PHP location and a script that prints what PHP received:

```nginx
location ~ \.php$ {
    try_files $uri =404;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php8.5-fpm.sock;
}
```

Request: `/products/42?sort=price&page=2`.

**`try_files $uri $uri/ /index.php;`**

```
index.php REQUEST_URI=/products/42?sort=price&page=2 QUERY_STRING= GET=[]
```

**`try_files $uri $uri/ /index.php?$query_string;`**

```
index.php REQUEST_URI=/products/42?sort=price&page=2 QUERY_STRING=sort=price&page=2 GET={"sort":"price","page":"2"}
```

**`try_files $uri $uri/ /index.php?route=$uri;`**

```
index.php REQUEST_URI=/products/42?sort=price&page=2 QUERY_STRING=route=/products/42 GET={"route":"\/products\/42"}
```

The first form is a frequent bug report: the URL in the browser has `?sort=price`, `REQUEST_URI` shows it too, but `$_GET` is empty. Frameworks that route on `REQUEST_URI` still find the right controller, so the page loads and only the parameters are missing. Use `/index.php?$query_string` (or `/index.php$is_args$args`). If you add your own parameter like `?route=$uri`, append the original ones with `/index.php?route=$uri&$args`:

```
QUERY_STRING=route=/products/42&sort=price&page=2 GET={"route":"\/products\/42","sort":"price","page":"2"}
```

Without a query string that leaves a trailing `&` (`QUERY_STRING=route=/products/42&`), which PHP ignored in the lab.

---

## `try_files $uri =404` in the PHP location

The `try_files $uri =404;` line inside `location ~ \.php$` makes NGINX check the script exists before sending the request to PHP-FPM. Without it:

```
### /nope.php with try_files $uri =404
404 text/html 162B
<html>
<head><title>404 Not Found</title></head>
...

### /nope.php without it
404 text/html; charset=UTF-8 16B
File not found.
```

```
[error] 231200#231200: *587 FastCGI sent in stderr: "Primary script unknown" while reading response header from upstream, client: 127.0.0.1, server: , request: "GET /nope.php HTTP/1.1", upstream: "fastcgi://unix:/run/php/php8.5-fpm.sock:", host: "127.0.0.1:8155"
```

Without the check, every request for a missing `.php` file costs a PHP-FPM worker and logs an error, and the 404 page is PHP's plain `File not found.` instead of yours. If PHP-FPM sits behind this NGINX, also check its version against [PHP CVE-2026-109618/109619](/blog/php-cve-2026-109618-109619-nginx-fpm). Ubuntu's `snippets/fastcgi-php.conf` includes an equivalent `try_files $fastcgi_script_name =404;`.

---

## Named location: static files first, then the app

```nginx
location / { try_files $uri @app; }
location @app {
    proxy_pass http://127.0.0.1:8158;
    proxy_set_header Host $host;
}
```

```
### /assets/app.js
200 application/javascript 19B
console.log("app")
### /api/users?id=7
200 text/plain 29B
app backend: /api/users?id=7
```

A named location keeps the original URI and query string, so the app sees the request unchanged. One difference from the SPA config: without `$uri/`, directories are not served. `/about/` contains an `index.html`, but it went to the backend:

```
app backend: /about/
 [200]
```

That's usually what you want in front of an app. Add `$uri/` back if NGINX should serve static directory indexes too.

---

## Lookup table

| Symptom | Config in the lab | Fix |
|---|---|---|
| Missing `.js`/`.css` returns `200 text/html` | `try_files $uri $uri/ /index.html` for everything | `location /assets/ { try_files $uri =404; }` |
| 403, `directory index of ... is forbidden` | `$uri/` matched a directory without an index | Add an index, or drop `$uri/` |
| 500, `rewrite or internal redirection cycle` | Fallback URI doesn't exist | Fix `root`/deploy; `location = /index.html { try_files $uri =404; }` |
| `$_GET` empty in PHP | Fallback `/index.php` without args | `/index.php?$query_string` |
| `File not found.` and `Primary script unknown` | No file check before `fastcgi_pass` | `try_files $uri =404;` in the PHP location |

`try_files` only runs in the location NGINX selected, so check that first with [NGINX location matching order](/blog/nginx-location-matching-order). For a full config review, paste `sudo nginx -T` into the [NGINX Config Analyzer](/tools/nginx-config-analyzer), and see the [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide) for the wider workflow.

---

## FAQ

**What does =404 at the end of try_files do?**
If none of the earlier files exist, NGINX returns 404 directly instead of redirecting to a fallback URI. Use it wherever a missing file should be an error.

**Why does try_files give a 500 error?**
Usually the fallback URI doesn't exist, so it redirects back into the same location in a loop. The error log shows `rewrite or internal redirection cycle`.

**Does try_files keep the query string?**
Not with a fallback like `/index.php`. Add `?$query_string` or `$is_args$args`. A named location (`@app`) keeps the original request unchanged.

**What is the difference between $uri and $uri/ in try_files?**
`$uri` checks for a file. `$uri/` checks for a directory and hands it to the index module, which can return 301, the index file, or 403 if there's no index.

**Can try_files fall back to a proxy?**
Yes, through a named location: `try_files $uri @app;` with `proxy_pass` inside `location @app`.
