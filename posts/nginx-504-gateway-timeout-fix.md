---
title: "NGINX 504 Gateway Timeout: Find Which Timeout Fired"
date: "2026-10-28"
updated: "2026-10-28"
excerpt: "NGINX returns 504 Gateway Timeout? Lab-tested: tell a read timeout from a connect timeout, why retries double the wait, and when a 504 becomes a 502."
tags: ["nginx", "troubleshooting", "debugging", "linux", "infrastructure"]
featured: false
category: "nginx"
---

The browser shows `504 Gateway Time-out` and the NGINX error log has `upstream timed out (110: Connection timed out)`. NGINX gave up waiting for the backend. The rest of that log line tells you whether it gave up while **connecting** or while **waiting for the response**, and those two cases have different fixes.

Every log line and timing below comes from a lab run, using a Python backend that can be made slow and a firewall rule that silently drops connections to some backend ports.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX `1.28.3 (Ubuntu)` with `worker_processes auto` (4 workers on 4 vCPU), curl 8.18.0, Python 3.14 backends on `127.0.0.1`. The NGINX test server used `proxy_connect_timeout 3s` and `proxy_read_timeout 5s` to keep the runs short. The backends ran as a normal user. Installing the NGINX config and adding the `nftables` drop rule on loopback needed root.

---

## Quick answer

```bash
grep "upstream timed out" /var/log/nginx/error.log | tail -5
```

| Error log says | Timeout that fired | Usual cause | Fix |
|---|---|---|---|
| `while reading response header from upstream` | `proxy_read_timeout` (default 60s) | App is slow: DB query, external API call, worker pool saturated | Make the app faster. Raise the timeout only for routes that are slow by design |
| `while connecting to upstream` | `proxy_connect_timeout` (default 60s) | SYNs dropped: firewall, dead host, full accept queue | Check the network path and the backend's listen queue. A longer timeout won't help |
| `while reading upstream` | `proxy_read_timeout`, after headers | Backend stalled mid-body | The client gets a **200 with a truncated body**, not a 504 (see below) |
| `while sending request to upstream` | `proxy_send_timeout` | Backend stopped reading a large request body | Not reproduced here. Same logic, opposite direction |

Then add upstream timings to the access log (below) so you can see where the time went for each request.

---

## Log the timings first

The default `combined` log format has no upstream timings. This is the format used in the lab:

```nginx
log_format timing '$status $request_method $request_uri '
                  'rt=$request_time uct=$upstream_connect_time '
                  'uht=$upstream_header_time urt=$upstream_response_time '
                  'ups=$upstream_status addr=$upstream_addr';
```

- `uct`: time to establish the TCP connection to the backend. `-` means the connection never completed.
- `uht`: time until the backend's response headers arrived. `-` means they never arrived.
- `urt`: total time spent on that upstream.
- When NGINX tries more than one backend, each variable lists one value per attempt, separated by commas. That's how you spot retries.

---

## Read timeout: the backend is slow

The backend's `/slow?d=8` route sleeps 8 seconds before it answers. The server-level `proxy_read_timeout` is 5s, and the `/long/` location raises it to 20s:

```nginx
proxy_read_timeout 5s;

location /      { proxy_pass http://fast_backend; }
location /long/ { proxy_read_timeout 20s; proxy_pass http://fast_backend/; }
```

```
$ curl -s -o /dev/null -w "%{http_code} total=%{time_total}\n" "http://127.0.0.1:8504/slow?d=8"
504 total=5.005834
$ curl -s -o /dev/null -w "%{http_code} total=%{time_total}\n" "http://127.0.0.1:8504/long/slow?d=8"
200 total=8.002485
```

Error log for the 504:

```
upstream timed out (110: Connection timed out) while reading response header from upstream, client: 127.0.0.1, server: , request: "GET /slow?d=8 HTTP/1.1", upstream: "http://127.0.0.1:9201/slow?d=8", host: "127.0.0.1:8504"
```

Access log:

```
504 GET /slow?d=8 rt=5.005 uct=0.000 uht=- urt=5.005 ups=504 addr=127.0.0.1:9201
200 GET /long/slow?d=8 rt=8.003 uct=0.000 uht=8.002 urt=8.002 ups=200 addr=127.0.0.1:9201
```

`uct=0.000` shows the connection succeeded at once. `uht=-` shows the headers never arrived. That's the signature of a slow application, not a network problem.

### proxy_read_timeout is per read, not per request

The `/drip` route sends its headers immediately, then one byte every 3 seconds, 5 bytes in total. The whole response takes 15 seconds, three times the 5-second `proxy_read_timeout`:

```
$ curl -s -w " %{http_code} total=%{time_total}\n" "http://127.0.0.1:8504/drip?n=5&i=3"
xxxxx 200 total=15.002513
```

No 504. The timer resets every time data arrives. A report that streams progress every few seconds never trips the timeout, but an endpoint that computes for 61 seconds before sending its first byte always does with the default 60s.

### Stall after the headers: a 200 that is actually broken

The `/stall-body` route sends `200 OK` with `Content-Length: 100`, writes 10 bytes, then goes silent for 30 seconds:

```
$ curl -sv "http://127.0.0.1:8504/stall-body" -o /dev/null
< HTTP/1.1 200 OK
< Content-Length: 100
...
$ curl -sS "http://127.0.0.1:8504/stall-body" -o /dev/null
curl: (18) end of response with 100 bytes missing
```

Error log, note the different wording:

```
upstream timed out (110: Connection timed out) while reading upstream, client: 127.0.0.1, server: , request: "GET /stall-body HTTP/1.1", upstream: "http://127.0.0.1:9201/stall-body", host: "127.0.0.1:8504"
```

Access log:

```
200 GET /stall-body rt=5.005 uct=0.000 uht=0.002 urt=5.005 ups=200 addr=127.0.0.1:9201
```

The status was already sent, so NGINX can't change it to 504. It logs **200** and closes the connection. With `proxy_buffering` on (the default), the client didn't even get the 10 bytes the backend had sent: curl reported all 100 bytes missing. **A dashboard that counts 5xx won't see these failures.** Search the error log for `while reading upstream` to find them.

---

## Connect timeout: packets are being dropped

To simulate a backend whose packets disappear (a firewall `DROP`, a dead host, a wrong security group), an `nftables` rule dropped loopback traffic to ports 9202 and 9203:

```
table inet lab504 {
	chain out {
		type filter hook output priority filter; policy accept;
		oifname "lo" tcp dport { 9202, 9203 } drop
	}
}
```

```
$ curl -s -o /dev/null -w "%{http_code} total=%{time_total}\n" "http://127.0.0.1:8504/dropped/"
504 total=3.003890
```

```
upstream timed out (110: Connection timed out) while connecting to upstream, client: 127.0.0.1, server: , request: "GET /dropped/ HTTP/1.1", upstream: "http://127.0.0.1:9202/", host: "127.0.0.1:8504"
```

```
504 GET /dropped/ rt=3.004 uct=- uht=- urt=3.003 ups=504 addr=127.0.0.1:9202
```

`uct=-` shows the TCP handshake never finished. A port with nothing listening is a different failure: Linux answers with a reset straight away, so you get a fast **502** with `connect() failed (111: Connection refused)` instead of a 504 (that case isn't repeated in this lab; the [502 post](/blog/nginx-502-bad-gateway-fix-linux) covers it). A connect **timeout** almost always means packets are being dropped somewhere, or the backend's accept queue is full. The accept-queue case is reproduced in [NGINX 502 under load](/blog/nginx-502-under-load), where an overloaded backend produced mostly 504s, not 502s. To test the path from the NGINX host by hand, see [how to test a TCP connection](/blog/test-tcp-connection-linux).

---

## Multiple backends: retries add up, then 504 turns into 502

With more than one `server` in the `upstream` block, `proxy_next_upstream` (default `error timeout`) makes NGINX try the next backend after a timeout. The lab used two dropped backends:

```nginx
upstream two_dropped { server 127.0.0.1:9202; server 127.0.0.1:9203; }
```

```
$ curl ... http://127.0.0.1:8504/twodropped/
504 total=6.006806
```

```
504 GET /twodropped/ rt=6.007 uct=-, - uht=-, - urt=3.003, 3.004 ups=504, 504 addr=127.0.0.1:9202, 127.0.0.1:9203
```

Two connect timeouts in a row, so the client waited **6 seconds**: `proxy_connect_timeout` multiplied by the number of servers. With the default 60s and three backends, that's three minutes before the 504, and your load balancer probably gave up long before (the client side then shows up as a [499](/blog/nginx-troubleshooting-guide)).

Sending the same request again right away:

```
504 total=6.006592
502 total=0.000486
```

```
no live upstreams while connecting to upstream, client: 127.0.0.1, server: , request: "GET /twodropped/ HTTP/1.1", upstream: "http://two_dropped/", host: "127.0.0.1:8504"
```

After a failure, NGINX marks a server unavailable for `fail_timeout` (default 10s, with `max_fails=1`). Once every server is marked down, NGINX doesn't try any of them and returns an instant **502**. The same outage can show up as slow 504s, then fast 502s, then 504s again as the 10-second windows expire.

### Retries on read timeout: GET yes, POST no

Two healthy backends, both slow (`/slow?d=8`), with `proxy_read_timeout 5s`:

```
GET:  504 total=10.010974
      504 GET /pair/slow?d=8 rt=10.011 uct=0.000, 0.001 uht=-, - urt=5.005, 5.006 ups=504, 504 addr=127.0.0.1:9201, 127.0.0.1:9204

POST: 504 total=5.005277
      504 POST /pair/slow?d=8 rt=5.005 uct=0.000 uht=- urt=5.005 ups=504 addr=127.0.0.1:9201
```

The GET went to the second backend after the read timeout, which doubled the wait. The POST did not. Since 1.9.13, NGINX doesn't pass a non-idempotent request (POST, LOCK, PATCH) to another server once it has been sent, unless you add `non_idempotent` to `proxy_next_upstream`. A connect timeout is different: the request was never sent, so the POST **was** retried:

```
200 POST /failover/ rt=3.005 uct=-, 0.000 uht=-, 0.002 urt=3.003, 0.002 ups=504, 200 addr=127.0.0.1:9202, 127.0.0.1:9201
```

To cap the total time spent on retries, use `proxy_next_upstream_timeout` and `proxy_next_upstream_tries`.

---

## Finding: without `zone`, each worker has its own list of failed servers

The `/failover/` upstream had a dropped server first and a healthy one second. Three POSTs in a row, each taking the full 3-second connect timeout:

```
200 total=3.005236
200 total=3.005405
200 total=3.005549
```

The error log shows why. Each request landed on a different worker process (`10346`, `10347`, `10345`):

```
[error] 10346#10346: *35 upstream timed out (110: Connection timed out) while connecting to upstream ...
[error] 10347#10347: *38 upstream timed out (110: Connection timed out) while connecting to upstream ...
[error] 10345#10345: *41 upstream timed out (110: Connection timed out) while connecting to upstream ...
```

Without a shared memory `zone`, the "this server is down" state lives inside each worker. On a 4-worker server, a dead backend can cost the full `proxy_connect_timeout` up to four times per `fail_timeout` window instead of once. After adding `zone`:

```nginx
upstream dropped_then_ok { zone dto 64k; server 127.0.0.1:9202; server 127.0.0.1:9201; }
```

```
200 total=3.005598
200 total=0.002229
200 total=0.001591
200 total=0.001812
```

Only the first request paid the timeout. The workers now share the failure state. Add `zone` to every `upstream` block with more than one server. It costs 64k of shared memory.

---

## Fix checklist

1. **Read the error-log wording**: `while connecting` (network or queue problem) vs `while reading response header` (slow app) vs `while reading upstream` (logged as 200, truncated).
2. **Add `$upstream_connect_time` and `$upstream_header_time`** to the access log. Commas in `$upstream_addr` mean NGINX retried.
3. **Slow app**: find out why it's slow before you touch the timeout. If an endpoint is slow by design, raise `proxy_read_timeout` only in its own `location`.
4. **Connect timeouts**: lower `proxy_connect_timeout` to a few seconds. A healthy backend on the same network connects in milliseconds, and 60s just makes clients wait. Then fix the dropped packets or the full queue.
5. **Multiple backends**: add `zone`, and set `proxy_next_upstream_tries` / `proxy_next_upstream_timeout` so retries can't add up past the timeout of the load balancer in front of NGINX.
6. **Keep timeouts ordered**: client/LB timeout > NGINX total (including retries) > app server timeout. Otherwise the outer layer gives up first and you get 499s instead of 504s.

For PHP-FPM (`fastcgi_read_timeout`) and uWSGI (`uwsgi_read_timeout`), the same logic applies with the matching directives. These weren't tested in this lab. To check a full config for missing timeouts and other risky defaults, paste it into the [NGINX config analyzer](/tools/nginx-config-analyzer).

---

## FAQ

**What is the difference between 502 and 504 in NGINX?**
504 means a timeout fired while connecting to the backend or waiting for its response. 502 means the connection failed outright (refused, reset) or the response was invalid. In the lab, the same dead backend produced both: 504 on the first try, then an instant 502 (`no live upstreams`) while the server was marked down. More 502 causes: [NGINX 502 Bad Gateway](/blog/nginx-502-bad-gateway-fix-linux).

**Does proxy_read_timeout limit the total response time?**
No. It limits the gap between two successive reads from the backend. In the lab, a 15-second response that sent a byte every 3 seconds passed a 5-second `proxy_read_timeout`.

**Why does my 504 take twice as long as proxy_read_timeout?**
NGINX retried the request on another server in the upstream group. It does this for idempotent methods like GET after a timeout. The `$upstream_addr` and `$upstream_response_time` fields show one value per attempt.

**Should I just set proxy_read_timeout to 300s?**
Only for the specific locations that are slow by design. A global 300s makes every stuck request hold a connection for 5 minutes, and it hides slow-app problems you'd want to know about.

**Why does the access log show 200 when users report broken downloads?**
If the backend stalls after sending its headers, NGINX logs `upstream timed out ... while reading upstream` but keeps the original 200 status, because it was already sent. Search the error log for that phrase.
