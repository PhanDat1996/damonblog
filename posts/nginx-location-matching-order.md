---
title: "NGINX Location Matching Order, Proven With curl"
date: "2026-11-08"
updated: "2026-11-08"
excerpt: "Which NGINX location block handles a request? Lab-tested precedence of =, ^~, regex and prefix, with curl output, the debug log and the common traps."
tags: ["nginx", "troubleshooting", "debugging", "linux", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

You added a `location` block, reloaded, and the request still goes somewhere else: the upload limit doesn't apply, the PHP handler grabs a static file, or `/api` catches `/apiv2`. NGINX doesn't pick the first block in the file, and it doesn't always pick the most specific one either.

This post tests the selection rules against a real NGINX: every location returns its own name, and curl shows which one won. The surprising results are the useful ones.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)` (built `--with-debug`), curl 8.18.0. Test servers listened on `127.0.0.1:8102`–`8104` and used only `return` directives, so no backend was involved. Installing the config needed root; curl ran as a normal user.

---

## Quick answer: the order NGINX uses

```
request URI (decoded, normalized)
        │
        ▼
1. exact match  location = /path        ── match → use it, stop
        │
        ▼
2. longest prefix match among  location /path  and  location ^~ /path
        │
        ├── longest one is ^~ → use it, stop (regex skipped)
        │
        ▼
3. regex locations  ~  and  ~*  in the order they appear in the file
        │
        ├── first regex that matches → use it, stop
        │
        ▼
4. no regex matched → use the longest prefix from step 2
```

The consequences people trip over:

- A matching **regex beats a longer prefix**. `location /docs/api/` loses to `location ~ ^/docs/` for `/docs/api/v1`.
- Among regexes, **the first one in the file wins**, not the longest or most specific.
- `^~` is the only way to make a prefix location win against regexes.
- `location /api` (no trailing slash) also matches `/apiv2/users`.

---

## The test server

Each location returns a letter, so the curl output says exactly which block handled the request:

```nginx
server {
    listen 127.0.0.1:8102;
    default_type text/plain;

    location = /           { return 200 "A: = /\n"; }
    location /             { return 200 "B: / (prefix)\n"; }
    location /docs/        { return 200 "C: /docs/ (prefix)\n"; }
    location /docs/api/    { return 200 "D: /docs/api/ (longer prefix)\n"; }
    location ^~ /static/   { return 200 "E: ^~ /static/\n"; }
    location /images/      { return 200 "F: /images/ (prefix)\n"; }
    location ~ \.(png|jpg)$  { return 200 "G: ~ regex png|jpg\n"; }
    location ~* \.PNG$     { return 200 "H: ~* regex PNG (case-insensitive)\n"; }
    location ~ ^/docs/     { return 200 "I: ~ ^/docs/ (regex)\n"; }
    location /api          { return 200 "J: /api (prefix, no slash)\n"; }
    location = /login      { return 200 "K: = /login\n"; }
}
```

A small loop requests each URI. `--path-as-is` stops curl from cleaning up `../` itself, so NGINX gets the raw path:

```bash
for u in / /index.html /login /login/ /docs/ /docs/api/v1 ...; do
  printf '%-22s -> %s' "$u" "$(curl -s --path-as-is http://127.0.0.1:8102$u)"; echo
done
```

Results:

```
/                      -> A: = /
/index.html            -> B: / (prefix)
/login                 -> K: = /login
/login/                -> B: / (prefix)
/docs/                 -> I: ~ ^/docs/ (regex)
/docs/api/v1           -> I: ~ ^/docs/ (regex)
/static/logo.png       -> E: ^~ /static/
/images/logo.png       -> G: ~ regex png|jpg
/images/logo.PNG       -> H: ~* regex PNG (case-insensitive)
/images/logo.jpeg      -> F: /images/ (prefix)
/apiv2/users           -> J: /api (prefix, no slash)
/api/users             -> J: /api (prefix, no slash)
/static/../docs/x      -> I: ~ ^/docs/ (regex)
/STATIC/a.png          -> G: ~ regex png|jpg
/docs/%61pi/           -> I: ~ ^/docs/ (regex)
```

---

## What each result proves

### Exact match is exact

`/login` hit `= /login`, but `/login/` fell through to `location /`. An exact location matches one string, with no trailing-slash tolerance. `= /` is a common optimization for the home page because the search stops immediately.

### A regex beats the longest prefix

`/docs/api/v1` has two matching prefixes, `/docs/` and `/docs/api/`. NGINX remembers the longer one, `D`, then checks the regexes. `~ ^/docs/` matched, so `I` won. The specific `/docs/api/` block never ran, and neither did `/docs/` for `/docs/`.

This is the trap behind settings that "don't apply". [NGINX 413 Request Entity Too Large](/blog/nginx-413-request-entity-too-large) shows the same thing with `client_max_body_size`: the limit raised on `/api/` was ignored for `/api/import.php` because `~ \.php$` handled it.

### ^~ stops the regex check

`/static/logo.png` matched both `^~ /static/` and the regex `~ \.(png|jpg)$`. Because the longest prefix carried `^~`, NGINX used `E` without looking at regexes. Compare `/images/logo.png`: same file name, but `/images/` is a plain prefix, so the regex `G` took it.

`^~` only counts when it's on the **longest** matching prefix. A short `^~ /` doesn't protect `/images/` from regexes.

### ~ is case-sensitive, ~* is not

`/images/logo.PNG` didn't match `~ \.(png|jpg)$` (case-sensitive) and went on to `~* \.PNG$`. `/images/logo.jpeg` matched no regex at all, so NGINX fell back to the remembered prefix, `F`.

Prefix matching is case-sensitive too on Linux: `/STATIC/a.png` didn't match `^~ /static/`. Only the longest prefix `/` matched, which isn't `^~`, so the regex `G` won.

### A prefix without a trailing slash matches more than you think

`location /api` is a plain string prefix. `/apiv2/users` starts with `/api`, so it matched. Use `location /api/` if you mean the directory, and add `location = /api` if the bare path needs handling too.

### Matching happens after decoding and normalization

`/static/../docs/x` went to the `/docs/` regex: NGINX resolved `..` before matching, so the request never "entered" `/static/`. `/docs/%61pi/` was decoded to `/docs/api/` before matching. Don't count on a location to block a path when the client can encode or rearrange it.

---

## Regex order: first match wins

A second server tested two regexes that both match `/admin/users.php`, in both orders:

```nginx
# port 8103
location ~ \.php$          { return 200 "R1: ~ \\.php\n"; }
location ~ ^/admin/.+\.php { return 200 "R2: ~ ^/admin/.+\\.php\n"; }

# port 8104: same two, reversed
location ~ ^/admin/.+\.php { return 200 "R2: ~ ^/admin/.+\\.php\n"; }
location ~ \.php$          { return 200 "R1: ~ \\.php\n"; }
```

```
8103 /admin/users.php   -> R1: ~ \.php
8103 /index.php         -> R1: ~ \.php
8104 /admin/users.php   -> R2: ~ ^/admin/.+\.php
8104 /index.php         -> R1: ~ \.php
```

Same request, different winner. The more specific admin rule only applies when it comes **first** in the file. If you add an access rule for `/admin/` as a regex below a generic PHP regex, it never runs. Putting specific regexes first, or nesting them inside a prefix location, avoids this.

The same server, without the `^/docs/` regex, confirms the normal prefix behavior:

```
8103 /docs/             -> C: /docs/ (prefix)
8103 /docs/api/v1       -> D: /docs/api/ (longer prefix)
8103 /docs/%61pi/v1     -> D: /docs/api/ (longer prefix)
8103 /docs/api/../x     -> C: /docs/ (prefix)
8103 /docs//api/v1      -> D: /docs/api/ (longer prefix)
```

`/docs//api/v1` matched `/docs/api/` because `merge_slashes` is on by default and collapses the double slash.

---

## See the decision in the debug log

Ubuntu's `nginx` package is built `--with-debug` (check with `nginx -V 2>&1 | grep -o -- --with-debug`). That lets you log the location search for one server without touching the rest:

```nginx
server {
    listen 127.0.0.1:8103;
    error_log /var/log/nginx/lab-loc-debug.log debug;
    ...
}
```

Two requests, `/admin/users.php` then `/docs/api/v1`, filtered to the relevant lines:

```bash
sudo grep -E "test location|using configuration" /var/log/nginx/lab-loc-debug.log
```

```
test location: "/docs/"
test location: ~ "\.php$"
using configuration "\.php$"
test location: "/docs/"
test location: "api/"
test location: ~ "\.php$"
test location: ~ "^/admin/.+\.php"
using configuration "/docs/api/"
```

You can see the whole algorithm:

- NGINX walks the prefix locations as a tree. `"api/"` is the rest of `/docs/api/` after the shared `/docs/` part.
- For `/admin/users.php`, the first regex matched and the search stopped. The second regex wasn't tested.
- For `/docs/api/v1`, both regexes were tested and neither matched, so the remembered prefix `/docs/api/` was used.

Debug logging is very verbose. Turn it off and reload when you're done. In the lab, requests sent in the same instant as `systemctl reload nginx` weren't logged; the same requests a second later were.

A lighter option on a busy server is to tag each location with a header, `add_header X-Loc "docs-api" always;`, and read it with `curl -sI`.

---

## Lookup table

| Modifier | Type | Wins when | Stops search? |
|---|---|---|---|
| `= /path` | Exact | URI equals the string | Yes, immediately |
| `^~ /path` | Prefix | It's the longest matching prefix | Yes, regexes skipped |
| `~ regex` | Regex, case-sensitive | First matching regex in file order | Yes |
| `~* regex` | Regex, case-insensitive | First matching regex in file order | Yes |
| `/path` | Prefix | Longest prefix and no regex matches | Only if no regex matches |

To list every location a server has, run `sudo nginx -T 2>/dev/null | grep -nE "server_name|listen|location"`, or paste the `nginx -T` output into the [NGINX Config Analyzer](/tools/nginx-config-analyzer). For a request that's going to the wrong backend, check the location before the upstream; see the [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide) for the rest of the workflow. WebSocket paths are a common example: if the upgrade request lands in a location without the upgrade headers, it fails as described in [NGINX WebSocket proxy](/blog/nginx-websocket-proxy).

---

## FAQ

**Does NGINX use the first location block that matches?**
Only among regex locations. Exact and prefix locations are chosen by match type and length, not file order.

**Why does my regex location override a more specific prefix?**
NGINX checks regexes after finding the longest prefix and uses the first matching regex. Mark the prefix with `^~` to skip the regex check.

**Does location /api match /api/users and /apiv2?**
Yes to both. It's a plain string prefix. Use `location /api/` to match only the directory.

**Is NGINX location matching case-sensitive?**
On Linux, prefix and `~` locations are case-sensitive. Use `~*` for a case-insensitive regex.

**Can I see which location handled a request?**
Enable `error_log ... debug` for that server and look for `using configuration`, or add a distinct `add_header` in each location.
