---
title: "NGINX 403 Forbidden: Read the Log Line, Fix the Cause"
date: "2026-10-31"
updated: "2026-10-31"
excerpt: "NGINX 403 Forbidden, lab-tested: the four error log lines behind it, why try_files =404 still returns 403, and how namei finds the blocking directory."
tags: ["nginx", "troubleshooting", "linux", "security", "debugging"]
featured: false
lab: true
category: "nginx"
---

The browser shows `403 Forbidden` and the page footer says `nginx`. NGINX found something at that path but refused to serve it. The error log tells you which of four reasons applies, and each one has a different fix. Changing permissions at random won't help if the real cause is a `deny` rule or a missing index file.

Every status code and log line below comes from one lab run. Nine paths on a test server each hit a different 403 cause, and each was then fixed.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)` running workers as `www-data` (`user www-data;` in `nginx.conf`), curl 8.18.0. Test files lived under `/srv/lab403` (owned by root) and in a subdirectory of `/home/damon` (Ubuntu's default `750` home). Creating files under `/srv`, installing the NGINX config and running `namei` on root-only directories needed root. Requests were sent from the VM itself with curl.

---

## Quick answer

```bash
sudo tail -n 20 /var/log/nginx/error.log | grep -E "forbidden|Permission denied"
```

| Error log says | Cause | Fix |
|---|---|---|
| `directory index of "/path/" is forbidden` | URL maps to a directory, no `index` file in it, `autoindex` off | Put the index file there, fix `root`, or add a fallback in `try_files` |
| `open() "/path/file" failed (13: Permission denied)` | Worker user can't read the file, **or** can't traverse a parent directory | `sudo namei -l /path/file`, then fix the one entry that blocks it |
| `"/path/index.html" is forbidden (13: Permission denied)` | Same permission problem, but hit while looking up the index file (typical for sites under `/home`) | Same: `namei -l`, usually the home directory's mode |
| `access forbidden by rule` | An `allow`/`deny` directive matched | Find the `deny` with `sudo nginx -T \| grep -n deny` |

A path that doesn't exist gives a **404**, not a 403. If you see 403, NGINX found something and was told, or forced, not to serve it.

---

## The lab setup

One server block on `127.0.0.1:8403`, with each directory set up to fail in its own way:

```nginx
server {
    listen 127.0.0.1:8403;
    root /srv/lab403;
    location /denied/ { deny all; }
    location /home/ { alias /home/damon/lab403home/; }
    location /spa/ { try_files $uri $uri/ =404; }
}
```

```
/ok/                       200
/noindex/                  403
/noindex/readme.txt        200
/private/report.html       403
/closed/inner/page.html    403
/denied/                   403
/home/                     403
/spa/                      403
/spa/assets/               403
/missing/                  404
```

Seven 403s with five different causes. Here is the error log for that run, one line per request (timestamps and worker IDs trimmed):

```
directory index of "/srv/lab403/noindex/" is forbidden, client: 127.0.0.1, ... request: "GET /noindex/ HTTP/1.1"
open() "/srv/lab403/private/report.html" failed (13: Permission denied), client: 127.0.0.1, ... request: "GET /private/report.html HTTP/1.1"
open() "/srv/lab403/closed/inner/page.html" failed (13: Permission denied), client: 127.0.0.1, ... request: "GET /closed/inner/page.html HTTP/1.1"
access forbidden by rule, client: 127.0.0.1, ... request: "GET /denied/ HTTP/1.1"
"/home/damon/lab403home/index.html" is forbidden (13: Permission denied), client: 127.0.0.1, ... request: "GET /home/ HTTP/1.1"
directory index of "/srv/lab403/spa/" is forbidden, client: 127.0.0.1, ... request: "GET /spa/ HTTP/1.1"
directory index of "/srv/lab403/spa/assets/" is forbidden, client: 127.0.0.1, ... request: "GET /spa/assets/ HTTP/1.1"
"/srv/lab403/missing/index.html" is not found (2: No such file or directory), client: 127.0.0.1, ... request: "GET /missing/ HTTP/1.1"
```

---

## Cause 1: directory with no index file

`/noindex/` holds `readme.txt` but no `index.html`. The file itself returns 200. The directory URL returns 403 with:

```
directory index of "/srv/lab403/noindex/" is forbidden
```

NGINX looked for the files listed in `index` (default `index.html`), found none, and directory listing (`autoindex`) is off by default. Pick the fix that matches what you want:

- **You meant to serve a page**: the build didn't produce `index.html`, or `root` points one level too high or too low. Check with `ls` at the exact path from the log line.
- **You want a file listing**: `autoindex on;` in that location. In the lab, `/noindex/` then returned 200 with an `Index of /noindex/` page listing `readme.txt`. Don't turn this on for directories that hold anything private.

### try_files ... =404 doesn't turn this into a 404

This one surprises people. The `/spa/` location had the commonly copied line:

```nginx
location /spa/ { try_files $uri $uri/ =404; }
```

The directory had files (`assets/app.js`) but no `index.html`, and the request still came back **403**, not 404. `$uri/` matched because the directory exists, so `try_files` handed the request to the index module. That module then found no index file and returned 403. The `=404` at the end only applies when **none** of the earlier arguments match.

Two working variants from the lab:

```nginx
# Single-page app: serve the app shell for directories and unknown routes
location /spa/ { try_files $uri $uri/index.html /spa/index.html =404; }

# Static files only: no directory step, so directories give 404
location /strict/ { alias /srv/lab403/spa/; try_files $uri =404; }
```

With an `index.html` added to `/srv/lab403/spa/`, the results were:

```
/spa/                      200
/spa/assets/               200
/spa/some/route            200
/strict/                   404
/strict/assets/app.js      200
```

`/spa/assets/` returned 200 because `$uri/index.html` doesn't exist there, so the request fell through to the app shell. Whether that's what you want depends on the app.

---

## Cause 2: file permissions

`report.html` was owned by root with mode `600`:

```
open() "/srv/lab403/private/report.html" failed (13: Permission denied)
```

The NGINX master runs as root, but the workers that open files don't:

```
      1 root     nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
      4 www-data nginx: worker process
```

Test access as the worker user, not as yourself or root:

```
$ sudo -u www-data cat /srv/lab403/private/report.html
cat: /srv/lab403/private/report.html: Permission denied
```

`chmod 644` on the file fixed it (200). For a site's own files, `644` on files and `755` on directories is enough. NGINX never needs write access to static content, and `chmod 777` is never the fix. More on choosing permissions: [Permission denied on Linux](/blog/permission-denied-linux-fix-chmod-chown).

---

## Cause 3: a parent directory blocks traversal

`page.html` itself was `644`, readable by everyone. The 403 came from a parent directory:

```
open() "/srv/lab403/closed/inner/page.html" failed (13: Permission denied)
```

The log line names the file, not the directory that blocks it. `namei -l` checks every component of the path. Run it with `sudo`. Run as a normal user, it stops at the same directory NGINX can't enter and can't show you what's past it:

```
$ namei -l /srv/lab403/closed/inner/page.html
f: /srv/lab403/closed/inner/page.html
drwxr-xr-x root root /
drwxr-xr-x root root srv
drwxr-xr-x root root lab403
drwx------ root root closed
                      inner - Permission denied

$ sudo namei -l /srv/lab403/closed/inner/page.html
f: /srv/lab403/closed/inner/page.html
drwxr-xr-x root root /
drwxr-xr-x root root srv
drwxr-xr-x root root lab403
drwx------ root root closed
drwxr-xr-x root root inner
-rw-r--r-- root root page.html
```

`closed` is `drwx------`: only root can enter it. To open a file, the worker needs **execute (`x`)** on every directory in the path. It doesn't need read (`r`) on them. In the lab, `chmod 711` (`drwx--x--x`) on `closed` was enough for a 200. Other users can pass through the directory but still can't list it.

---

## Cause 4: site under a home directory

This is a common one on Ubuntu. The site lives in `/home/<user>/...`, and the home directory is `750`:

```
$ namei -l /home/damon/lab403home/index.html
f: /home/damon/lab403home/index.html
drwxr-xr-x root  root  /
drwxr-xr-x root  root  home
drwxr-x--- damon damon damon
drwxrwxr-x damon damon lab403home
-rw-rw-r-- damon damon index.html
```

The error log wording is different here because the request was for the directory (`/home/`), so NGINX failed while checking the index file:

```
"/home/damon/lab403home/index.html" is forbidden (13: Permission denied)
```

If you grep only for `open() ... failed`, you'll miss this form.

Two fixes:

1. **Move the site out of the home directory** (`/var/www/<site>` or `/srv/<site>`). This is the better fix.
2. Give other users traverse permission on the home directory: `chmod o+x /home/damon` (`drwxr-x--x`). In the lab, `/home/` returned 200 right after this. The downside: every local user can now reach any file in that home directory if they know or guess its name and its own permissions allow it.

The lab home directory was put back to `750` afterwards.

---

## Cause 5: allow / deny rules

```
access forbidden by rule
```

There's no filesystem involved. An `allow`/`deny` directive matched the client address. Rules are checked in order and the first match wins, so this permits only localhost:

```nginx
location /denied/ { allow 127.0.0.1; deny all; }
```

To find every rule in the loaded config, including included files:

```bash
sudo nginx -T 2>/dev/null | grep -nE "^\s*(allow|deny)"
```

If NGINX runs behind a load balancer or CDN, the client address it checks is the proxy's, not the real visitor's, unless the `realip` module is configured. A rule like `allow 203.0.113.0/24` then matches against the proxy's IP, so it blocks every visitor or none of them. This case wasn't part of the lab.

---

## A reload doesn't take effect instantly

While testing the `deny` fix, requests sent immediately after `systemctl reload nginx` still got the **old** answer:

```
$ sudo systemctl reload nginx; for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:8403/denied/; sleep 0.05; done
200 200 403 403 403 403
```

(This run changed the config from `allow 127.0.0.1; deny all;` back to `deny all;`, so 403 is the new behavior.) `reload` returns as soon as the signal is sent. The old workers keep accepting connections until the new ones take over, which took about 100 ms here. If you test a 403 fix with a script straight after a reload, wait a second or you may chase a fix that already worked.

---

## Checklist

1. Read the error log line. It names the cause, and `directory index`, `13: Permission denied` and `forbidden by rule` each need a different fix.
2. For permission errors, run `sudo namei -l <path from the log>` and look for a directory without `x` for others, or a file without `r`.
3. Confirm the fix as the worker user: `sudo -u www-data cat <file>`.
4. For directory URLs, check whether an `index` file actually exists at the path NGINX logged, and remember `$uri/` in `try_files` sends directories to the index module.
5. For `deny` rules, `sudo nginx -T | grep -n deny`. Behind a proxy, check `realip`.
6. On RHEL-family systems, SELinux labels can cause a 403 even when Unix permissions are fine. This lab ran on Ubuntu, so that case wasn't tested here. The [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide) has the `semanage`/`restorecon` steps.

The [NGINX config analyzer](/tools/nginx-config-analyzer) flags `autoindex on` and a missing deny-all block for hidden files, and [NGINX 413 Request Entity Too Large](/blog/nginx-413-request-entity-too-large) covers the other client-side 4xx that NGINX itself generates.

---

## FAQ

**Why does NGINX return 403 instead of 404 for a missing index.html?**
Because the directory exists. NGINX only returns 404 when the path itself isn't found. For an existing directory without an index file and with `autoindex` off, it returns 403 with `directory index of ... is forbidden`.

**Does NGINX need read permission on parent directories?**
No, only execute (`x`) to traverse them. In the lab, a parent directory with mode `711` (no read for others) served the file inside it with 200.

**Should I chmod 777 to fix an NGINX 403?**
No. NGINX workers only need read on files and execute on directories. `644`/`755` covers static sites. Write permission for everyone creates a new problem and doesn't fix a `deny` rule or a missing index.

**Why does try_files $uri $uri/ =404 return 403?**
`$uri/` matches any existing directory and passes the request to the index module, which returns 403 when there's no index file. Use `try_files $uri =404;` or `try_files $uri $uri/index.html =404;` if you want 404 there.

**Which user does NGINX use to read files?**
The worker processes run as the user in the `user` directive, `www-data` on Debian/Ubuntu and `nginx` on RHEL-family packages. Check with `ps -o user=,args= -C nginx`.
