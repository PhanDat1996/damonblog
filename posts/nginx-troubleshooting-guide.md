---
title: "NGINX Troubleshooting: Fix 502, 504, 403 and Config Errors"
date: "2026-04-21"
updated: "2026-10-31"
excerpt: "Lab-tested NGINX troubleshooting: map each error-log line to its cause, from 502/504, 403/404 and 499 to startup failures, TLS chain errors and reloads."
tags: ["nginx", "troubleshooting", "production", "infrastructure"]
featured: true
category: "nginx"
lab: true
---

Something in front of your app is returning errors, and the response says `nginx`. It might be a 403 on a directory that worked yesterday, a 404 for a file that's clearly on disk, NGINX refusing to start after a config change, or a reload that seemed to work but changed nothing.

Almost every one of those leaves a specific line in the error log. This guide maps those lines to causes, using output reproduced on a lab VM, and links to the detailed lab posts for 502, 504, 413, 499 and rate limiting.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, OpenSSL 3.5.5, curl 8.18.0, a Python echo backend on `127.0.0.1:9501`. The test server listened on `127.0.0.1:8501`, with `error_log ... info`. Startup-failure and TLS tests ran on a separate NGINX instance started as an unprivileged user with its own config, so the system NGINX was never restarted. Installing the test config needed root. SELinux wasn't available on this VM, so the SELinux notes below aren't lab-tested.

---

## The first five commands

```bash
systemctl status nginx --no-pager          # running? last log lines?
nginx -t                                   # is the config valid right now?
nginx -T 2>/dev/null | grep -E '^\s*(error_log|access_log)'   # where are the logs?
tail -n 50 /var/log/nginx/error.log        # the actual reason
journalctl -u nginx -n 50 --no-pager       # startup and reload failures land here too
```

`nginx -T` prints the full effective configuration, every included file in order. Use it whenever you're not sure which `server` block or include is in effect.

Reading an error log line:

- It ends with `client:`, `server:`, `request:`, and often `upstream:`. Those fields tell you which vhost and backend were involved.
- The number in parentheses is the Linux errno: `(13: Permission denied)`, `(2: No such file or directory)`, `(98: Address already in use)`. It's usually the most useful part.
- The default level is `error`. For a hard case, set `error_log /var/log/nginx/error.log info;` in one server block temporarily.

---

## Symptom → cause → where to go

| Symptom / log line | Usual cause | Details |
|---|---|---|
| **502 Bad Gateway** | Upstream down, wrong address or socket, upstream closed or reset | [NGINX 502 from the error log](/blog/nginx-502-bad-gateway-fix-linux) |
| **502 only under load** | Accept queue full, workers killed, port exhaustion | [502 under load](/blog/nginx-502-under-load) |
| `[crit] ... (99: Cannot assign requested address)` | Ephemeral ports exhausted, no upstream keepalive | [Upstream keepalive](/blog/nginx-upstream-keepalive) |
| **504**, `upstream timed out (110 ...)` | Upstream slow, or connect stalls | [504 lab](/blog/nginx-504-gateway-timeout-fix) |
| **403 Forbidden** | Filesystem permissions, no index file, `deny` rule | 403 section below |
| **404** for files that exist | `root` vs `alias`, wrong `server` block | 404 section below |
| **413 Request Entity Too Large** | `client_max_body_size` (default 1m) | [413 lab](/blog/nginx-413-request-entity-too-large) |
| **499** in the access log | Client gave up first | 499 section below |
| **429 / 503**, `limiting requests` | `limit_req` | [Rate limiting](/blog/nginx-rate-limiting-config) |
| Won't start, `(98: Address already in use)` | Another process owns the port | Startup section below |
| `Verify return code: 21` | Leaf certificate without its chain | TLS section below |
| Config change has no effect | Reload failed, another `server` block matches, `add_header` override | "My change did nothing" below |

---

## 502 and 504

These have their own lab posts, so here's only the short version. A 502 means NGINX couldn't get a valid response from the upstream; a 504 means a proxy timeout fired. The error log names the upstream and the reason:

```
connect() failed (111: Connection refused) while connecting to upstream          → nothing listening
upstream prematurely closed connection while reading response header             → backend closed or crashed
upstream timed out (110: Connection timed out) while reading response header     → backend too slow
```

Start with [NGINX 502: find the cause from the error log](/blog/nginx-502-bad-gateway-fix-linux), [502 under load](/blog/nginx-502-under-load), or [504: find which timeout fired](/blog/nginx-504-gateway-timeout-fix).

---

## 403 Forbidden: three different log lines

Three requests to the lab server, all returning `403`, each with a different error log line:

```
2026/10/31 02:56:21 [error] 131180#131180: *199709 open() "/srv/lab-hub/site/perm/file.txt" failed (13: Permission denied), client: 127.0.0.1, server: site.lab, request: "GET /perm/file.txt HTTP/1.1", host: "site.lab"
2026/10/31 02:56:21 [error] 131183#131183: *199710 directory index of "/srv/lab-hub/site/noindex/" is forbidden, client: 127.0.0.1, server: site.lab, request: "GET /noindex/ HTTP/1.1", host: "site.lab"
2026/10/31 02:56:21 [error] 131182#131182: *199711 access forbidden by rule, client: 127.0.0.1, server: site.lab, request: "GET /private/x.txt HTTP/1.1", host: "site.lab"
```

| Log line | Cause | Fix |
|---|---|---|
| `(13: Permission denied)` | Worker user can't read the file or traverse a parent directory | Fix permissions along the path |
| `directory index of ... is forbidden` | URL maps to a directory with no `index` file, `autoindex` off | Fix `root`, or deploy the missing `index.html` |
| `access forbidden by rule` | An `allow`/`deny` matched | Search `nginx -T` for `deny` |

For the permission case, the file itself was world-readable. The problem was one directory up. `namei -l`, run as the worker user, shows exactly where:

```
$ sudo -u www-data namei -l /srv/lab-hub/site/perm/file.txt
f: /srv/lab-hub/site/perm/file.txt
drwxr-xr-x root root /
drwxr-xr-x root root srv
drwxr-xr-x root root lab-hub
drwxr-xr-x root root site
drwx------ root root perm
                      file.txt - Permission denied
```

The worker needs `x` on every parent directory and `r` on the file. Avoid `chmod 777`; see [Permission denied on Linux](/blog/permission-denied-linux-fix-chmod-chown).

On RHEL-family systems with SELinux enforcing, correct Unix permissions aren't enough for content outside the default web roots. Check `ls -Z` and relabel with `semanage fcontext -a -t httpd_sys_content_t` plus `restorecon`. (Not reproduced here: the lab VM is Ubuntu.) More 403 cases, including `try_files` returning 403, are in [NGINX 403 Forbidden](/blog/nginx-403-forbidden-fix).

---

## 404 for files that exist

The error log shows the path NGINX actually tried. In the lab, the file was at `/srv/lab-hub/app/public/logo.txt`, and three locations tried to serve it:

```nginx
location /static-root/    { root  /srv/lab-hub/app; }
location /static-alias/   { alias /srv/lab-hub/app/public/; }
location /static-noslash/ { alias /srv/lab-hub/app/public; }
```

```
/static-root/logo.txt 404
/static-alias/logo.txt 200
/static-noslash/logo.txt 404
```

```
open() "/srv/lab-hub/app/static-root/logo.txt" failed (2: No such file or directory), ... request: "GET /static-root/logo.txt HTTP/1.1"
open() "/srv/lab-hub/app/publiclogo.txt" failed (2: No such file or directory), ... request: "GET /static-noslash/logo.txt HTTP/1.1"
```

- `root` appends the **whole URI**, location prefix included: `/srv/lab-hub/app` + `/static-root/logo.txt`.
- `alias` **replaces** the location prefix with the path.
- `alias` with a trailing slash on the location but not on the path glues the names together: `public` + `logo.txt` = `publiclogo.txt`. Keep the slashes consistent.

### The wrong server block

If the path in the log starts with a root you didn't expect (for example `/usr/share/nginx/html`), the request went to a different `server` block. The lab had two servers on the same port, `first.lab` (defined first) and `site.lab`:

```
200 "GET / HTTP/1.1" host=site.lab server=site.lab
200 "GET / HTTP/1.1" host=unknown.lab server=first.lab
200 "GET / HTTP/1.1" host=127.0.0.1 server=first.lab
```

Any `Host` that doesn't match a `server_name` goes to the default server for that `listen` address, which is the first one defined unless you mark one `default_server`. Logging `$host` and `$server_name` in the access log, as above, makes this visible immediately.

---

## 499 in the access log

499 means the client closed the connection before NGINX answered. The lab backend's `/slow` endpoint takes 5 seconds, and curl gave up after 1:

```
$ curl -s --max-time 1 -H 'Host: site.lab' http://127.0.0.1:8501/slow
curl rc=28
```

```
499 "GET /slow HTTP/1.1" host=site.lab server=site.lab rt=1.002
```

```
epoll_wait() reported that client prematurely closed connection, so upstream connection is closed too while sending request to upstream, client: 127.0.0.1, server: site.lab, request: "GET /slow HTTP/1.1", upstream: "http://127.0.0.1:9501/slow", host: "site.lab"
```

That error log line is logged at `info`, so at the default `error` level you only see the 499 in the access log. `rt=` equal to the client's timeout is the giveaway. The fix is on the slow backend, or in making the outer timeout longer than the inner one. The [NGINX 499 lab](/blog/nginx-499-client-closed-request) covers what happens to the backend after the client leaves.

---

## NGINX won't start

Each broken config was tested with `nginx -t`. Output from the lab, with the lab directory shortened to `~/labs/...`:

```
nginx: [emerg] host not found in upstream "app-backend.invalid" in ~/labs/nginx-troubleshooting-guide/sa/hostnf.conf:11
nginx: [emerg] unknown directive "proxy_passs" in ~/labs/nginx-troubleshooting-guide/sa/unknown.conf:11
nginx: [emerg] SSL_CTX_use_PrivateKey("~/labs/nginx-troubleshooting-guide/tls/other.key") failed (SSL: error:05800074:x509 certificate routines::key values mismatch)
nginx: [emerg] cannot load certificate "~/labs/nginx-troubleshooting-guide/tls/missing.crt": BIO_new_file() failed (SSL: error:80000002:system library::No such file or directory:calling fopen(~/labs/nginx-troubleshooting-guide/tls/missing.crt, r) error:10000080:BIO routines::no such file)
```

| Message | Cause |
|---|---|
| `host not found in upstream "..."` | A hostname in `proxy_pass` or `upstream` doesn't resolve when the config is loaded |
| `unknown directive "..."` | Typo, or the module isn't built in or loaded |
| `SSL_CTX_use_PrivateKey ... key values mismatch` | Certificate and key don't belong together |
| `cannot load certificate ... No such file or directory` | Wrong path, or the cert isn't readable |

### A port conflict passes nginx -t

A config listening on a port another process already owned:

```
nginx: the configuration file ~/labs/nginx-troubleshooting-guide/sa/portinuse.conf syntax is ok
nginx: configuration file ~/labs/nginx-troubleshooting-guide/sa/portinuse.conf test is successful
```

Then starting it:

```
nginx: [emerg] bind() to 127.0.0.1:8501 failed (98: Address already in use)
nginx: [emerg] bind() to 127.0.0.1:8501 failed (98: Address already in use)
nginx: [emerg] bind() to 127.0.0.1:8501 failed (98: Address already in use)
nginx: [emerg] bind() to 127.0.0.1:8501 failed (98: Address already in use)
nginx: [emerg] bind() to 127.0.0.1:8501 failed (98: Address already in use)
nginx: [emerg] still could not bind()
```

`nginx -t` doesn't bind ports, so it can't catch this. NGINX retried five times, then gave up. Find the owner with `ss -ltnp 'sport = :80'`, then see [port already in use](/blog/port-already-in-use-linux-fix). On SELinux systems, a non-standard port can also fail with `(13: Permission denied)` until it's allowed with `semanage port -a -t http_port_t`. Other startup failures (unit errors, dependencies) are in [systemctl service not starting](/blog/systemctl-service-not-starting-fix).

---

## TLS: Verify return code 21

The lab built a root CA, an intermediate, and a leaf certificate for `tls.lab`, then served the **leaf only**:

```
$ openssl s_client -connect 127.0.0.1:8543 -servername tls.lab -CAfile ca.crt
depth=0 CN=tls.lab
verify error:num=20:unable to get local issuer certificate
depth=0 CN=tls.lab
verify error:num=21:unable to verify the first certificate
...
Verify return code: 21 (unable to verify the first certificate)
```

Same server with `ssl_certificate` pointing at leaf + intermediate (`fullchain`), after a reload:

```
depth=2 CN=Lab Root CA
depth=1 CN=Lab Intermediate CA
depth=0 CN=tls.lab
Verify return code: 0 (ok)
```

The client trusted the root in both runs. The only change was sending the intermediate. Code 21 almost always means `ssl_certificate` points at `cert.pem` instead of `fullchain.pem`. Browsers sometimes fetch the missing intermediate themselves, so curl, mobile apps and API clients are usually what break first.

Check cert/key match and expiry before a reload:

```bash
openssl x509 -in site.crt -noout -pubkey | sha256sum
openssl pkey -in site.key -pubout | sha256sum      # must match the line above
openssl x509 -in site.crt -noout -subject -enddate
```

Always pass `-servername` to `s_client`, or you may get the default server's certificate. For protocol and cipher settings, see [NGINX SSL Hardening](/blog/nginx-ssl-hardening). To check whether your NGINX version has known vulnerabilities, use the [NGINX CVE Checker](/tools/nginx-cve-checker).

---

## My change did nothing

### 1. The reload failed, and the old config is still running

The lab added a file with a typo to `/etc/nginx/conf.d/` on the system NGINX and reloaded:

```
$ sudo systemctl reload nginx
Job for nginx.service failed.
See "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.
systemctl reload rc=1
```

```
Oct 31 02:57:05 damon nginx[131407]: 2026/10/31 02:57:05 [emerg] 131407#131407: unknown directive "proxy_passs" in /etc/nginx/conf.d/lab-hub-broken.conf:1
Oct 31 02:57:05 damon systemd[1]: nginx.service: Control process exited, code=exited, status=1/FAILURE
Oct 31 02:57:05 damon systemd[1]: Reload failed for nginx.service - A high performance web server and a reverse proxy server.
```

The site kept serving its previous content right after. On this Ubuntu package the failure isn't silent: `systemctl reload` exits `1` and says so, because `nginx -s reload` parses the config before signalling the master. The danger is a deploy script that ignores the exit code. Chain it: `nginx -t && systemctl reload nginx`.

### 2. A different server block handles the request

```
nginx: [warn] conflicting server name "dup.lab" on 127.0.0.1:8601, ignored
nginx: the configuration file ~/labs/nginx-troubleshooting-guide/sa/conflict.conf syntax is ok
nginx: configuration file ~/labs/nginx-troubleshooting-guide/sa/conflict.conf test is successful
```

It's a `[warn]`, so the test still succeeds. The second block with that name is never used. Search for it with `nginx -T 2>&1 | grep "conflicting server name"`.

### 3. add_header in a location drops the inherited headers

The lab server set `add_header X-Frame-Options DENY;` at server level, and one location added its own header:

```nginx
add_header X-Frame-Options DENY;
location /cached/ { add_header Cache-Control "max-age=60"; }
```

```
$ curl -sI -H 'Host: site.lab' http://127.0.0.1:8501/index.html | grep -iE '^(HTTP|x-frame|cache-control)'
HTTP/1.1 200 OK
X-Frame-Options: DENY

$ curl -sI -H 'Host: site.lab' http://127.0.0.1:8501/cached/a.txt | grep -iE '^(HTTP|x-frame|cache-control)'
HTTP/1.1 200 OK
Cache-Control: max-age=60
```

`X-Frame-Options` silently disappeared from `/cached/`. `add_header` is inherited only if the current level has none of its own. Repeat the security headers in that location, or put them in a shared include. This is an easy way to lose security headers; the [NGINX CIS Hardening Checker](/tools/nginx-cis-hardening-checker) flags it.

### 4. A cache in between

Test with `curl -sI` directly against the server, not through the browser or CDN.

---

## proxy_pass with and without a URI

```nginx
location /a/ { proxy_pass http://127.0.0.1:9501;     }
location /b/ { proxy_pass http://127.0.0.1:9501/;    }
location /c/ { proxy_pass http://127.0.0.1:9501/v2/; }
```

What the backend received for `/a/users`, `/b/users` and `/c/users`:

```
/a/users -> backend saw: /a/users
/b/users -> backend saw: /users
/c/users -> backend saw: /v2/users
```

If `proxy_pass` contains any path, even a single `/`, the matched location prefix is replaced by it. Without a path, the URI goes through unchanged. A one-character difference is the cause of many "the API returns 404 only through NGINX" reports.

---

## Other config traps

**`localhost` in `proxy_pass`.** The usual advice is that `localhost` can resolve to both `::1` and `127.0.0.1`, so an IPv4-only app sees failed attempts on `::1` first. On this VM it didn't reproduce: `getent ahosts localhost` returned only `127.0.0.1`, and `proxy_pass http://localhost:9501` worked with no errors logged. It depends on `/etc/hosts`, so `127.0.0.1` is still the safer choice.

**Upstream keepalive without its headers.** Before 1.29.7, `keepalive` needs `proxy_http_version 1.1` and `proxy_set_header Connection ""` in the location. In the [keepalive lab](/blog/nginx-upstream-keepalive), the half config still used one connection per request, and with some backends it caused errors that only retries hid.

**`if` inside `location`.** It creates an implicit nested location with surprising rules about which directives apply. Safe uses are `return` and `rewrite ... last`. For method restrictions, use `limit_except` inside the location.

Most of these can be spotted from the config alone. Paste your `nginx -T` output into the [NGINX Config Analyzer](/tools/nginx-config-analyzer).

---

## Reload vs restart

The lab compared process IDs on the standalone instance (one worker; the restart was `-s quit` followed by a fresh start):

```
before: 131434 00:01 nginx: worker process master=131433
after reload: 131444 nginx: worker process master=131433
after restart: 131457 nginx: worker process master=131456
```

A reload keeps the master and starts new workers. Old workers finish their in-flight requests first. That's enough for almost every change, including certificates (the TLS chain fix above was applied with a reload). A restart replaces the master too, and drops in-flight connections. You need it only when:

- You changed the systemd unit or its limits, such as `LimitNOFILE`.
- The master process itself is stuck.
- You need the new binary after an upgrade and the package didn't handle it.

---

## Log format worth adding

Log upstream timing so "the site is slow" becomes "this upstream takes 4 seconds":

```nginx
log_format timed '$remote_addr "$request" $status $body_bytes_sent '
                 'host=$host server=$server_name rt=$request_time '
                 'uct=$upstream_connect_time urt=$upstream_response_time ua="$upstream_addr"';
access_log /var/log/nginx/access.log timed;
```

`rt` much larger than `urt` means time was spent on the client side. `urt` close to `rt` means the backend is slow. `server=` shows which server block answered. More techniques: [Linux log analysis](/blog/linux-log-analysis-guide).

---

## FAQ

**How do I see the configuration NGINX is actually running?**
`nginx -T` prints the config NGINX would load now. If a reload failed since the last start, the running config is older. Check `journalctl -u nginx` for `Reload failed`.

**Why does nginx -t pass but NGINX still won't start?**
`nginx -t` checks syntax, files and hostnames, but doesn't bind ports. A port conflict passes the test and fails at start with `98: Address already in use`.

**Why does nginx -t pass but the site is still broken?**
It doesn't check that upstreams are up, that the worker can read your files, or which server block a request matches. Read the error log after the reload.

**Does a reload drop connections?**
No. Old workers finish in-flight requests while new workers take new ones. In the lab the master PID stayed the same across a reload.

**What's the difference between proxy_connect_timeout and proxy_read_timeout?**
`proxy_connect_timeout` limits establishing the TCP connection (default 60s). `proxy_read_timeout` limits the gap between two reads of the response (default 60s). The [504 lab](/blog/nginx-504-gateway-timeout-fix) shows both firing.

---

*Related: [Linux Debugging Tools Guide](/blog/linux-debugging-tools-guide) for strace, ss and lsof when the log isn't enough. [Check open ports on Linux](/blog/check-open-ports-linux) to confirm what's listening.*
