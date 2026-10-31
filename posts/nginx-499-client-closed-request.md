---
title: "NGINX 499 Client Closed Request: Causes and Fixes"
date: "2026-10-31"
updated: "2026-10-31"
excerpt: "NGINX 499 in the access log, lab-tested: the backend keeps working after the client leaves, proxy_ignore_client_abort logs 200, and the error log is empty."
tags: ["nginx", "troubleshooting", "debugging", "linux", "infrastructure"]
featured: false
lab: true
category: "nginx"
---

Your access log has lines with status `499` and the error log has nothing about them. 499 isn't an HTTP status a client ever receives. NGINX writes it when **the client closed the connection before NGINX sent a response**. The client gave up, so the question is why the response took longer than the client was willing to wait.

The access log, error log and backend log lines below all come from a lab run: a Python backend that sleeps on request, NGINX in front of it, and curl with `--max-time` as the impatient client.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)`, curl 8.18.0, a Python 3.14 `ThreadingHTTPServer` backend on `127.0.0.1:9499` that sleeps `d` seconds and logs when it starts, finishes, and whether its write succeeded. NGINX listened on `127.0.0.1:8499` with `proxy_read_timeout 10s`. The backend ran as a normal user. Installing the NGINX config needed root.

---

## Quick answer

- **499 = client hung up first.** The client might be a browser, a mobile app, a load balancer, a health check, or a script with a timeout.
- **`$request_time` on 499 lines is the client's timeout.** In the lab, every 499 had `rt` within a few milliseconds of the curl timeout. Group your 499s by `$request_time` and you'll usually find one number, such as a load balancer's 30s or 60s idle timeout.
- **The backend doesn't stop.** NGINX closes the upstream connection, but the application keeps doing the work and only notices when it tries to write.
- **Nothing in the error log by default.** The related message is logged at `info` level.
- **The fix is almost always the slow backend**, or timeouts in the wrong order. `proxy_ignore_client_abort on` hides the 499s without helping anyone.

---

## Log the fields you need

The default `combined` format has no timing at all. This format was used in the lab:

```nginx
log_format lab499 '$status $request_uri rt=$request_time uht=$upstream_header_time '
                  'urt=$upstream_response_time ups=$upstream_status';
```

---

## Reproduce: client gives up at 2s, backend needs 5s

```
$ curl -sS --max-time 2 -o /dev/null -w "%{http_code} total=%{time_total}\n" "http://127.0.0.1:8499/slow?d=5"
curl: (28) Operation timed out after 2002 milliseconds with 0 bytes received
000 total=2.002518
```

From curl's side there's no status code at all (`000`). The 499 only exists in NGINX's access log:

```
499 /slow?d=5 rt=2.002 uht=- urt=2.003 ups=-
```

- `rt=2.002`: matches the client's 2-second timeout, not anything on the server side.
- `uht=-`: the backend never sent headers before the client left.
- `ups=-`: no upstream status, because NGINX dropped the upstream connection before a response arrived.

### The backend kept working

The backend's own log for that request:

```
02:00:33 start /slow?d=5
02:00:38 finished /slow?d=5 after 5.0s, write failed: BrokenPipeError
```

The backend did all 5 seconds of work. NGINX closed its side of the upstream connection at the 2-second mark, and the backend only found out when it tried to write the response and got `BrokenPipeError`. Whatever the request did (a database query, a report, an external API call) ran to completion for a client who wasn't there anymore.

This matters when 499s come in bursts. Clients that time out and retry add **new** work while the abandoned requests are still running, so a slow endpoint can get slower under its own retries.

### The error log is empty unless you ask for info

At the default `error_log` level, three 499s in a row left the server's error log at 0 bytes:

```
499 /slow?d=3 rt=1.001 uht=- urt=1.002 ups=-
499 /slow?d=3 rt=1.001 uht=- urt=1.001 ups=-
499 /slow?d=3 rt=1.002 uht=- urt=1.001 ups=-
```

```
--- error (default level) bytes:
0
```

With `error_log ... info;` the same kind of request logs:

```
[info] ... epoll_wait() reported that client prematurely closed connection, so upstream connection is closed too while sending request to upstream, client: 127.0.0.1, server: , request: "GET /slow?d=5 HTTP/1.1", upstream: "http://127.0.0.1:9499/slow?d=5", host: "127.0.0.1:8499"
```

Note the wording `while sending request to upstream`. The backend log shows it had already received the request and was sleeping, so don't take that phrase to mean the request never reached the backend. The useful parts are `client prematurely closed connection` and `upstream connection is closed too`. Turn on `info` only temporarily, because it's noisy: it also logs every normal `client ... closed keepalive connection`.

---

## proxy_ignore_client_abort: the 499 turns into a 200

`proxy_ignore_client_abort on` tells NGINX to keep the upstream connection open after the client leaves. Same client, same 2-second timeout:

```nginx
location /ignore/ { proxy_ignore_client_abort on; proxy_pass http://127.0.0.1:9499/; }
```

```
$ curl -sS --max-time 2 -o /dev/null -w "%{http_code} total=%{time_total}\n" "http://127.0.0.1:8499/ignore/slow?d=5"
curl: (28) Operation timed out after 2002 milliseconds with 0 bytes received
000 total=2.002422
```

The client still got nothing. The access log, though:

```
200 /ignore/slow?d=5 rt=5.001 uht=5.002 urt=5.002 ups=200
```

Backend log:

```
02:00:39 start /slow?d=5
02:00:44 finished /slow?d=5 after 5.0s, response written
```

The backend finished and wrote its response successfully, to NGINX, which threw it away. **The access log now records a 200 for a request whose client timed out.** Error rates and latency dashboards built on `$status` look healthier while users see exactly the same failures.

Advice to "just set `proxy_ignore_client_abort on` to get rid of 499s" swaps a visible signal for an invisible one. It's only useful when the backend must not see a dropped connection mid-request, for example an endpoint that isn't safe to interrupt. Even then, the client-side failure is still there.

---

## When NGINX gives up first: 504, not 499

Which timeout is shorter decides what you see. With the client willing to wait 15s, `proxy_read_timeout 10s`, and a backend that needs 12s:

```
$ curl -sS --max-time 15 -o /dev/null -w "%{http_code} total=%{time_total}\n" "http://127.0.0.1:8499/slow?d=12"
504 total=10.010254
```

```
504 /slow?d=12 rt=10.010 uht=- urt=10.010 ups=504
```

```
02:00:45 start /slow?d=12
02:00:57 finished /slow?d=12 after 12.0s, write failed: BrokenPipeError
```

Same pattern on the backend: 12 seconds of work, then a broken pipe. Only the label changed.

| Shortest timeout belongs to | Access log | Client sees | Error log (default level) |
|---|---|---|---|
| Client / load balancer | `499`, `ups=-` | Its own timeout error | Nothing |
| NGINX `proxy_read_timeout` | `504` | `504 Gateway Time-out` | `upstream timed out ... while reading response header` |
| App server's own timeout | Not tested in this lab | Depends on the app | Depends on how the app closes |

The order that gives you the clearest logs is **client/LB timeout > NGINX timeout (including retries) > app timeout**. Then the innermost layer fails first and logs why. More on the NGINX side: [NGINX 504 Gateway Timeout](/blog/nginx-504-gateway-timeout-fix).

---

## Finding the cause in production

1. **Group 499s by endpoint and `$request_time`.** If the times cluster at one value (30.0, 60.0), that's a client or load balancer timeout. If they're scattered and short, users are leaving or navigating away.

   ```bash
   awk '$1==499 {split($3,t,"="); printf "%s %.0fs\n", $2, t[2]}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
   ```

   This assumes the lab log format above (`$2` is the URI, `$3` is `rt=...`) and rounds the time to whole seconds. Adjust the field numbers for your format.

2. **Look at the same endpoint's 200s.** If its successful requests take nearly as long as the 499 cutoff, the endpoint is slow and the 499s are its tail.
3. **Check what's in front of NGINX.** A load balancer or CDN with a shorter idle timeout than your slowest legitimate request produces 499s at exactly that timeout.
4. **Health checks.** A health checker with a 2-second timeout against an endpoint that sometimes takes 3 seconds produces a steady trickle of 499s from the checker's IP.
5. **Fix the slow part.** Add the slow request to the app's own profiling or slow-query log. Raising timeouts is right only for endpoints that are slow by design, like exports and reports.

For the wider picture of reading NGINX status codes from logs, see [log analysis for incident triage](/blog/log-analysis-incident-triage) and the [NGINX troubleshooting guide](/blog/nginx-troubleshooting-guide).

---

## FAQ

**Is 499 a client error or a server error?**
Technically a client action: the client closed the connection. In practice it usually points to a server that's too slow for its callers. Every 499 in the lab was a request still being processed by the backend when the client left.

**Does a 499 stop the backend request?**
No. NGINX closes its upstream connection, but the application keeps running until it tries to write. In the lab, the backend finished all 5 seconds of work and then got `BrokenPipeError`.

**Why is there nothing in the NGINX error log for 499?**
The message (`client prematurely closed connection`) is logged at `info` level, below the default `error` level. In the lab, the error log stayed at 0 bytes for three 499s.

**Should I enable proxy_ignore_client_abort?**
Not to get rid of 499s. In the lab it turned a client timeout into a `200` in the access log while the client still got nothing. Use it only when the backend must not be interrupted mid-request.

**How do I find which client timeout causes the 499s?**
Look at `$request_time` on the 499 lines. In the lab it matched the client's timeout to within a few milliseconds (2.002s for a 2s timeout, 1.001s for 1s).
