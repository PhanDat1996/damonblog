---
title: "Linux TIME_WAIT Explained: When It Actually Breaks Things"
date: "2024-12-05"
updated: "2026-10-28"
excerpt: "Thousands of TIME_WAIT sockets are usually harmless. Learn when they exhaust ephemeral ports, how to confirm it, and which sysctls help or hurt."
tags: ["linux", "networking", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

Under load, outgoing connections start failing:

```
connect() failed (99: Cannot assign requested address) while connecting to upstream
dial tcp 10.0.1.20:8080: connect: cannot assign requested address
```

You check `ss -s` and see tens of thousands of sockets in TIME-WAIT. Is that the cause?

Sometimes. Often a high TIME-WAIT count is completely harmless, and the sysctl "fixes" passed around for it range from useful to actively harmful. This page explains what TIME_WAIT is, the one situation where it really breaks things, and what to change in which order.

---

## TL;DR

- TIME_WAIT is a normal TCP state on the side that **closes first**. On Linux it lasts a fixed **60 seconds**.
- On a **server** handling inbound connections, lots of TIME-WAIT costs a little memory and nothing else.
- It hurts on a **client** making many short-lived connections to the **same destination IP and port**: each one holds a local port for 60 s, and the ephemeral range runs out. The error is `EADDRNOTAVAIL` ("Cannot assign requested address"), not "connection refused".
- Fix it by **reusing connections** (keepalive, pools). Then, if needed, widen `ip_local_port_range` and enable `tcp_tw_reuse`.
- `tcp_fin_timeout` does not change TIME_WAIT. `tcp_tw_recycle` no longer exists.

---

## Where TIME_WAIT comes from

```
Active closer (A)                        Passive closer (B)
   ESTABLISHED                              ESTABLISHED
       |  ---------------- FIN -------------->  |
   FIN-WAIT-1                               CLOSE-WAIT
       |  <--------------- ACK ---------------  |
   FIN-WAIT-2                                   |  (app calls close())
       |  <--------------- FIN ---------------  |
       |                                     LAST-ACK
       |  ---------------- ACK -------------->  |
   TIME-WAIT                                 CLOSED
   (60 s on Linux)
       |
     CLOSED
```

Whichever side sends the first FIN ends up in TIME-WAIT. It can be the client or the server; it depends on who closes. For HTTP, that's often the server when it doesn't keep connections alive, or the client when it closes after each request.

TIME-WAIT exists for two reasons:

1. **The last ACK can get lost.** If it does, B retransmits its FIN. A has to still remember the connection to ACK it again instead of answering with a RST.
2. **Delayed packets.** A late segment from the old connection must not be accepted by a new connection using the same four-tuple (source IP, source port, destination IP, destination port).

The TCP spec suggests holding the state for 2×MSL, which with the RFC's 2-minute MSL would be 4 minutes. Linux uses a fixed 60 seconds (`TCP_TIMEWAIT_LEN` in the kernel source), and there's no sysctl to change it.

---

## When it's harmless

**Server side, inbound connections.** Every connection to your web server uses the same local port (443). TIME-WAIT entries differ only by the client's address and port, so they don't consume anything you'll run out of. The kernel also caps them with `net.ipv4.tcp_max_tw_buckets`. If that cap is reached, it destroys the oldest entries early and logs `TCP: time wait bucket table overflow`. That's a warning, not an outage.

So 30,000 TIME-WAIT sockets on an NGINX box are not a problem in themselves. Look at which direction they're in before changing anything.

---

## When it breaks things: ephemeral port exhaustion

When a process opens an **outgoing** connection, the kernel picks a local port from the ephemeral range:

```bash
sysctl net.ipv4.ip_local_port_range
# net.ipv4.ip_local_port_range = 32768	60999
```

That's 28,232 ports. A four-tuple only has to be unique, so the same local port can be reused for *different* destinations. The limit therefore applies **per destination IP and port**:

```
28,232 ports / 60 s in TIME-WAIT ≈ 470 new connections per second
                                     to one destination ip:port
```

Exceed that rate to one destination (an NGINX upstream without keepalive, a service calling a single database or Redis endpoint, a load test client) and `connect()` fails with `EADDRNOTAVAIL`:

| Where | Message |
|---|---|
| NGINX | `connect() failed (99: Cannot assign requested address) while connecting to upstream` |
| Go | `dial tcp ...: connect: cannot assign requested address` |
| Python | `OSError: [Errno 99] Cannot assign requested address` |
| Java | `java.net.BindException: Cannot assign requested address` |

If you see `Connection refused` (errno 111), that's a different problem: the destination isn't accepting. Start with [cannot connect to server](/blog/cannot-connect-to-server-linux-troubleshooting).

---

## Confirm it

```bash
ss -s
```

```
Total: 31402
TCP:   30815 (estab 341, closed 30402, orphaned 0, timewait 30388)

Transport Total     IP        IPv6
RAW       0         0         0
UDP       7         5         2
TCP       413       401       12
INET      420       406       14
FRAG      0         0         0
```

Then see **which direction** they are in, grouped by remote endpoint:

```bash
ss -Htn state time-wait | awk '{print $4}' | sort | uniq -c | sort -rn | head
```

```
  28104 10.0.1.20:8080
    511 203.0.113.7:51234
    ...
```

With a `state` filter, `ss` drops the State column, so column 4 is the peer address. One peer `ip:port` with a count close to the size of your port range is exhaustion in the making. Many different client IPs connecting to your own server port is the harmless case.

Also check the raw kernel counter, which is what `node_exporter` exports as `node_sockstat_TCP_tw`:

```bash
cat /proc/net/sockstat
# TCP: inuse 402 orphan 0 tw 30388 alloc 455 mem 61
```

---

## Fix it, in this order

### 1. Reuse connections

This is the actual fix. Fewer new connections means fewer TIME-WAIT sockets, and it saves a TCP (and often TLS) handshake per request too.

NGINX upstreams need three things for keepalive, not one:

```nginx
upstream app_backend {
    server 10.0.1.20:8080;
    keepalive 32;                 # idle connections kept per worker
}

server {
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;          # keepalive needs HTTP/1.1
        proxy_set_header Connection "";  # don't forward "Connection: close"
    }
}
```

See [NGINX upstream keepalive](/blog/nginx-upstream-keepalive) for the details.

Application HTTP clients:

```python
# Python requests: a Session keeps a connection pool
session = requests.Session()
for item in items:
    session.get("http://10.0.1.20:8080/api")   # reuses connections

# requests.get() on its own creates a new connection each call
```

```go
// Go: http.Client and its Transport pool connections; create once, reuse.
var client = &http.Client{Timeout: 5 * time.Second}

resp, err := client.Get(url)
if err == nil {
    io.Copy(io.Discard, resp.Body) // read the body fully...
    resp.Body.Close()              // ...and close it, or the connection can't be reused
}
```

In Go, the common causes of connection churn are creating a new `http.Transport` (or a client with its own Transport) per request, and not draining and closing the response body.

Database clients: use the driver's pool, or a pooler like PgBouncer, instead of connect-per-query.

### 2. Widen the ephemeral port range

```bash
# /etc/sysctl.d/90-ephemeral-ports.conf
net.ipv4.ip_local_port_range = 10240 65535
```

```bash
sudo sysctl --system
```

That's about 55,000 ports per destination, roughly double. Don't go down to 1024: ports in this range can be grabbed as source ports by outgoing connections, which can collide with services that listen on them (8080, 9090, 5432…). Protect specific ports you listen on with `net.ipv4.ip_local_reserved_ports`.

### 3. tcp_tw_reuse

```bash
sysctl net.ipv4.tcp_tw_reuse
```

| Value | Meaning |
|---|---|
| `0` | Disabled |
| `1` | Reuse TIME-WAIT sockets for new **outgoing** connections when TCP timestamps show it's safe |
| `2` | Same, but only for loopback traffic. The default on recent kernels |

```bash
# /etc/sysctl.d/90-tw-reuse.conf
net.ipv4.tcp_tw_reuse = 1
```

It only affects connections this host *initiates*, and it relies on TCP timestamps (`net.ipv4.tcp_timestamps = 1`, the default). It's the reasonable kernel-side setting for a busy client or proxy. It doesn't replace step 1.

### Settings that don't do what people think

**`tcp_fin_timeout`** controls how long an orphaned socket waits in **FIN-WAIT-2**. It has no effect on TIME-WAIT duration. Lowering it is harmless but won't fix this.

**`tcp_tw_recycle`** was removed in Linux 4.12. Before that, it broke clients behind NAT by rejecting their connections based on per-host timestamps. If a runbook or Ansible role still sets it, `sysctl` will error with `cannot stat /proc/sys/net/ipv4/tcp_tw_recycle`. Delete the line.

**`SO_LINGER` with a zero timeout** in application code makes `close()` send a RST instead of a FIN, so no TIME-WAIT is created. It also throws away unsent data and loses the protections above. Treat it as a last resort for very specific cases, not a fix.

---

## Monitor it

Alert on the error, not the TIME-WAIT count. A Prometheus rule on `node_sockstat_TCP_tw` alone will page you for harmless server-side TIME-WAIT. Better signals:

- Application or NGINX error logs containing `Cannot assign requested address` / errno 99.
- TIME-WAIT toward **one** upstream as a fraction of the port range, using the `ss` grouping above in a script:

```bash
#!/bin/bash
# warn when TIME-WAIT toward one peer uses > 70% of the ephemeral range
read -r low high < /proc/sys/net/ipv4/ip_local_port_range
range=$(( high - low + 1 ))
ss -Htn state time-wait | awk '{print $4}' | sort | uniq -c | sort -rn | head -1 |
while read -r count peer; do
  pct=$(( count * 100 / range ))
  echo "top peer $peer: $count TIME-WAIT ($pct% of $range ports)"
  [ "$pct" -gt 70 ] && exit 1
done
```

---

## Decision tree

```
Errors under load?
│
├─ "Cannot assign requested address" (errno 99)
│     └─ ss -Htn state time-wait, grouped by peer
│          ├─ one peer ip:port dominates  → ephemeral port exhaustion
│          │      1. keepalive / connection pooling
│          │      2. ip_local_port_range = 10240 65535
│          │      3. tcp_tw_reuse = 1
│          └─ spread over many peers      → look elsewhere
│
├─ "Connection refused" (errno 111)   → destination not accepting; not TIME_WAIT
│
└─ High TIME-WAIT, no errors          → probably server-side and harmless
```

---

## FAQ

**Can I shorten TIME_WAIT on Linux?**
Not with a sysctl. The 60-second value is a kernel constant. Reduce the number of connections instead, or let `tcp_tw_reuse` reuse them for outgoing traffic.

**Is a high TIME_WAIT count bad?**
On its own, no. It matters only when it's toward a single destination on a host that opens outgoing connections, and you see `Cannot assign requested address`.

**What's the difference between TIME_WAIT and CLOSE_WAIT?**
TIME-WAIT is on the side that closed first and goes away by itself after 60 seconds. CLOSE-WAIT is on the side that received the FIN and hasn't closed its socket yet. It doesn't time out, and a growing count is an application bug. See [check open connections](/blog/linux-check-open-connections) to find which process holds them.

---

*Related: [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load) for the proxy side of this problem. [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for general socket debugging.*
