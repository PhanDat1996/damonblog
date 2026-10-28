---
title: "NGINX Troubleshooting: Fix 502, 504, 403 and Config Errors"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "NGINX misbehaving in production? Map the symptom or error-log line to its cause: 502/504, 403/404, 413, 499, startup failures, TLS errors and reloads."
tags: ["nginx", "troubleshooting", "production", "infrastructure"]
featured: true
category: "nginx"
---

Something in front of your app is returning errors, and the response says `nginx`. Maybe it's a 502 after a deploy, a 403 on a directory that was fine yesterday, NGINX refusing to start after a config change, or a reload that "worked" but changed nothing.

NGINX is unusually good at telling you what's wrong. Almost every failure produces a specific line in the error log. This guide is the starting point: the first commands to run, a symptom-to-cause map, and links to the detailed posts for the big topics.

---

## The first five commands

```bash
systemctl status nginx --no-pager          # running? last log lines?
nginx -t                                   # is the config valid right now?
nginx -T 2>/dev/null | grep -E '^\s*(error_log|access_log)'   # where are the logs?
tail -n 50 /var/log/nginx/error.log        # the actual reason
journalctl -u nginx -n 50 --no-pager       # startup/reload failures land here too
```

`nginx -T` prints the **full effective configuration**, every included file in order. Use it whenever you're not sure which `server` block or which included file is actually in effect.

Reading tips:

- Each error line ends with `client:`, `server:`, `request:`, and often `upstream:`. Those fields tell you which vhost and which backend were involved.
- The number in parentheses is the Linux errno: `(13: Permission denied)`, `(111: Connection refused)`, `(24: Too many open files)`. It's the most useful part of the line.
- Default level is `error`. For a hard case, temporarily set `error_log /var/log/nginx/error.log info;` for one server block.

---

## Symptom → cause → where to go

| Symptom / log line | Usual cause | Details |
|---|---|---|
| **502 Bad Gateway** | Upstream down, wrong address/socket, upstream closed or reset, invalid response | [NGINX 502: find the cause from the error log](/blog/nginx-502-bad-gateway-fix-linux) |
| **502 only under load** | Backend accept queue full, workers killed, port exhaustion | [502 under load](/blog/nginx-502-under-load) |
| `99: Cannot assign requested address` | Ephemeral ports exhausted, no upstream keepalive | [Upstream keepalive](/blog/nginx-upstream-keepalive) |
| **504 Gateway Timeout**, `upstream timed out (110...)` | Upstream too slow, or connect stalls | 504 section below |
| **403 Forbidden** | Filesystem permissions, no index file, `deny` rule, SELinux | 403 section below |
| **404 Not Found** for files that exist | `root` vs `alias`, wrong `server` block | 404 section below |
| **413 Request Entity Too Large** | `client_max_body_size` (default 1m) | 413 section below |
| **499** in access log | Client gave up before NGINX answered | 499 section below |
| **429 / 503** with `limiting requests` in log | `limit_req` rate limiting | [Rate limiting](/blog/nginx-rate-limiting-config) |
| NGINX won't start: `(98: Address already in use)` | Another process owns port 80/443 | [Port already in use](/blog/port-already-in-use-linux-fix) |
| `(24: Too many open files)` | Worker FD limit | [Too many open files](/blog/too-many-open-files-linux-fix) |
| TLS errors, bad SSL Labs grade | Cert/key mismatch, missing chain, old protocols | TLS section below, [SSL hardening](/blog/nginx-ssl-hardening) |
| Config change has no effect | Reload failed, or another `server` block matches | Reload section below |

---

## 502 Bad Gateway

NGINX generated the 502 because the upstream refused, reset, or garbled the connection. The error log names the upstream and the reason. The three most common in practice:

```
connect() failed (111: Connection refused) while connecting to upstream        → nothing listening there
connect() to unix:/run/php/php8.2-fpm.sock failed (2: No such file or directory) → wrong socket path
upstream prematurely closed connection while reading response header             → app crashed or worker killed
```

Test the exact `upstream:` address from the log with `curl -sv` from the NGINX host. The full message-to-fix table is in [NGINX 502 Bad Gateway: Find the Cause From the Error Log](/blog/nginx-502-bad-gateway-fix-linux). If the 502s only appear at peak traffic, go straight to [502 under load](/blog/nginx-502-under-load).

---

## 504 Gateway Timeout

```
upstream timed out (110: Connection timed out) while reading response header from upstream
upstream timed out (110: Connection timed out) while connecting to upstream
```

The text after the errno tells you which timeout fired:

- **`while reading response header`**: connected, sent the request, and the app didn't answer within `proxy_read_timeout` (default 60s). The app is slow. Check its logs, DB queries, and downstream calls.
- **`while connecting`**: the TCP connect itself didn't finish within `proxy_connect_timeout`. Usually the backend's accept queue is full (see [502 under load](/blog/nginx-502-under-load)) or a firewall is silently dropping packets ([test the TCP connection](/blog/test-tcp-connection-linux)).

Raise `proxy_read_timeout` only for endpoints that are legitimately slow (exports, reports), and only in their own `location`:

```nginx
location /api/export/ {
    proxy_pass http://app_backend;
    proxy_read_timeout 300s;
}
```

`proxy_read_timeout` is the time **between two reads**, not the total response time. A streaming response that sends something every 30 seconds never trips a 60-second timeout.

Retries across several upstream servers multiply the wait, and a stall after the headers is logged as a 200, not a 504. Both are reproduced in [NGINX 504 Gateway Timeout: Find Which Timeout Fired](/blog/nginx-504-gateway-timeout-fix).

---

## 403 Forbidden

Check the error log line. It tells you which kind of 403 it is:

```
open() "/var/www/site/index.html" failed (13: Permission denied)
directory index of "/var/www/site/" is forbidden
access forbidden by rule
```

**`13: Permission denied`**: the NGINX worker user (`www-data` or `nginx`) needs read permission on the file and execute (`x`) permission on **every parent directory**:

```bash
namei -l /var/www/site/index.html      # shows permissions along the whole path
```

On RHEL-family systems with SELinux enforcing, correct Unix permissions aren't enough. Content outside `/usr/share/nginx/html` and `/var/www` needs the right label:

```bash
ls -Z /srv/site
semanage fcontext -a -t httpd_sys_content_t "/srv/site(/.*)?"
restorecon -Rv /srv/site
```

More on fixing permissions without `chmod 777`: [Permission denied on Linux](/blog/permission-denied-linux-fix-chmod-chown).

**`directory index ... is forbidden`**: the URL maps to a directory with no `index` file, and `autoindex` is off. Usually the wrong `root`, or the build didn't produce `index.html`.

**`access forbidden by rule`**: an `allow`/`deny` matched. Search `nginx -T` for `deny`.

---

## 404 for files that exist

```
open() "/usr/share/nginx/html/static/app.js" failed (2: No such file or directory)
```

The path in the log is where NGINX actually looked. If it's not where your file is, the cause is one of these:

- **Wrong `server` block.** `/usr/share/nginx/html` means the request hit the default server, so your `server_name` didn't match. Check the `Host` header and `listen` directives.
- **`root` vs `alias`.** `root` appends the full URI, while `alias` replaces the location prefix:

```nginx
location /static/ { root  /srv/app;         }   # /static/a.js → /srv/app/static/a.js
location /static/ { alias /srv/app/public/; }   # /static/a.js → /srv/app/public/a.js
```

With `alias`, keep the trailing slashes consistent on both the location and the path.

---

## 413 Request Entity Too Large

```
client intended to send too large body: 5242880 bytes
```

The default `client_max_body_size` is `1m`. Raise it where uploads happen, not globally:

```nginx
location /upload/ {
    client_max_body_size 50m;
    proxy_pass http://app_backend;
}
```

If the 413 persists after raising it, the request probably matched a regex location that still has the default, or the app sent the 413 itself. See [NGINX 413 Request Entity Too Large](/blog/nginx-413-request-entity-too-large) for how to tell them apart.

---

## 499 in the access log

499 is NGINX-specific: **the client closed the connection** before NGINX sent a response. NGINX didn't fail. Something upstream of it (a browser, a mobile app, a load balancer, a health checker) gave up waiting.

Many 499s on one endpoint mean that endpoint is slower than its callers' timeouts. Compare `$request_time` in the access log with the client or load balancer timeout. The fix is on the slow backend, or in aligning timeouts so the outer layer waits longer than the inner one.

---

## NGINX won't start

```bash
nginx -t
journalctl -u nginx -n 30 --no-pager
```

| Message | Fix |
|---|---|
| `bind() to 0.0.0.0:80 failed (98: Address already in use)` | Find the owner with `ss -ltnp 'sport = :80'`. See [port already in use](/blog/port-already-in-use-linux-fix) |
| `bind() to 0.0.0.0:8081 failed (13: Permission denied)` | SELinux: allow the port with `semanage port -a -t http_port_t -p tcp 8081` |
| `cannot load certificate "/etc/ssl/..." ... No such file or directory` | Wrong path or permissions on the cert |
| `SSL_CTX_use_PrivateKey(...) failed ... key values mismatch` | Certificate and key don't belong together (see below) |
| `host not found in upstream "app:8080"` | Hostname in `proxy_pass` or `upstream` doesn't resolve at startup |
| `unknown directive "..."` | Typo, or the module isn't built in or loaded |

For startup failures that aren't NGINX-specific (unit file errors, dependency failures), see [systemctl service not starting](/blog/systemctl-service-not-starting-fix).

---

## TLS and certificate errors

Check that the certificate and key match, and when the certificate expires:

```bash
openssl x509 -in /etc/ssl/certs/site.crt -noout -pubkey | sha256sum
openssl pkey -in /etc/ssl/private/site.key -pubout | sha256sum
# the two hashes must be identical

openssl x509 -in /etc/ssl/certs/site.crt -noout -subject -enddate
```

See what clients actually receive, including the chain:

```bash
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | grep -E "subject=|issuer=|Verify return code|Protocol|Cipher"
```

`Verify return code: 21 (unable to verify the first certificate)` usually means you configured `cert.pem` instead of `fullchain.pem`. Some browsers work around the missing intermediate, but curl, mobile apps, and API clients fail.

Leave out `-servername` and you'll often get the default server's certificate. If browsers see the wrong certificate, the `server_name` on the 443 block doesn't match.

For protocol and cipher settings, see [NGINX SSL Hardening](/blog/nginx-ssl-hardening). To check whether your NGINX version itself has known TLS or HTTP/2 vulnerabilities, run it through the [NGINX CVE Checker](/tools/nginx-cve-checker).

---

## My change did nothing

1. **The reload failed.** If the new config is invalid, NGINX keeps running the **old** one. Always run `nginx -t && systemctl reload nginx`, then check the error log for `[emerg]` lines.
2. **A different `server` block handles the request.** Look for duplicate names:

```bash
nginx -T 2>&1 | grep -E "conflicting server name|server_name"
```

`conflicting server name "example.com" on 0.0.0.0:80, ignored` means one of the two blocks is never used.

3. **`add_header` in a `location` drops all inherited headers.** `add_header` is inherited only if the current level has none of its own.
4. **Browser or CDN cache.** Test with `curl -sI` directly against the server.

---

## Common misconfigurations

### `proxy_pass` with and without a URI

```nginx
location /api/ { proxy_pass http://backend;      }  # /api/users → /api/users
location /api/ { proxy_pass http://backend/;     }  # /api/users → /users
location /api/ { proxy_pass http://backend/v2/;  }  # /api/users → /v2/users
```

If `proxy_pass` contains any path (even just `/`), the matched location prefix is replaced by it.

### Upstream keepalive without its headers

Before NGINX 1.29.7, `keepalive` in an `upstream` block does nothing unless the proxying location also sets `proxy_http_version 1.1` and `proxy_set_header Connection ""`. Details: [NGINX upstream keepalive](/blog/nginx-upstream-keepalive).

### `if` inside `location`

`if` in a location creates an implicit nested location with surprising rules about which directives apply. Safe uses are `return` and `rewrite ... last`. For method restrictions, use `limit_except`, which must be **inside** the location:

```nginx
location /api/ {
    limit_except GET HEAD POST { deny all; }
    proxy_pass http://backend;
}
```

### `localhost` in `proxy_pass`

`localhost` can resolve to both `::1` and `127.0.0.1`. If the app only listens on IPv4, half the attempts fail first. Use `127.0.0.1`.

Most of the mistakes in this section can be spotted from the config alone. Paste your `nginx -T` output into the [NGINX Config Analyzer](/tools/nginx-config-analyzer) to check for them in one pass. For a security baseline review, use the [NGINX CIS Hardening Checker](/tools/nginx-cis-hardening-checker).

---

## Reload vs restart

```bash
nginx -t && systemctl reload nginx     # graceful: new workers, old ones finish their requests
```

Reload applies almost every config change, including new `listen` ports, `worker_processes`, and certificates. A **restart** drops in-flight connections, and you only need it when:

- You changed the systemd unit or its limits (e.g. `LimitNOFILE`). These apply to the master process at start.
- The master process itself is stuck.
- You need the new binary after an upgrade, and the package didn't handle it. (`nginx -s reload` re-reads config, not the binary.)

---

## Useful log formats

Add upstream timing to the access log. It turns "the site is slow" into "this upstream takes 4 seconds":

```nginx
log_format timed '$remote_addr "$request" $status $body_bytes_sent '
                 'rt=$request_time uct=$upstream_connect_time '
                 'urt=$upstream_response_time ua="$upstream_addr"';
access_log /var/log/nginx/access.log timed;
```

```bash
# Slowest requests
awk '{for(i=1;i<=NF;i++) if($i ~ /^rt=/){sub("rt=","",$i); print $i, $0}}' /var/log/nginx/access.log \
  | sort -rn | head
```

`rt` much larger than `urt` means the time was spent on the client side (slow uploads or downloads). `urt` close to `rt` means the backend is slow. More log techniques: [Linux log analysis](/blog/linux-log-analysis-guide).

---

## FAQ

**How do I see the full NGINX configuration that is actually running?**
`nginx -T` prints the config NGINX would load now, including all includes. If a reload failed since the last start, the running config may be older. Check the error log for `[emerg]` after reloads.

**Why does nginx -t pass but the site is still broken?**
`nginx -t` checks syntax and that files and hostnames exist. It doesn't check that upstreams are up, that permissions allow reading content, or that the right `server` block matches. Read the error log after the reload.

**NGINX resolves my upstream hostname only once. How do I make it follow DNS changes?**
By default NGINX resolves hostnames in `proxy_pass`/`upstream` at startup and reload. Use a `resolver` plus the `resolve` parameter on `server` lines in an `upstream` block (available in open-source NGINX since 1.27.3), or put a variable in `proxy_pass` so it resolves at request time.

**What's the difference between proxy_connect_timeout and proxy_read_timeout?**
`proxy_connect_timeout` limits establishing the TCP connection to the upstream (default 60s, and it usually can't exceed 75s). `proxy_read_timeout` limits the gap between two successive reads of the response (default 60s).

---

*Related: [Linux Debugging Tools Guide](/blog/linux-debugging-tools-guide) for strace, ss and lsof when the log isn't enough. [Check open ports on Linux](/blog/check-open-ports-linux) to confirm what's listening.*
