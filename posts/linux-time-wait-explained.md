---
title: "Linux TIME_WAIT Explained: Why It Causes Connection Failures and How to Fix It"
date: "2024-12-05"
excerpt: "Linux TIME_WAIT exhausts ephemeral ports and causes ECONNREFUSED under load — even when your app is healthy. Learn what TIME_WAIT is, how to detect port exhaustion with ss and netstat, and the exact sysctl fixes that resolve it."
tags: ["linux", "networking", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "linux"
---

## Introduction

Your application is healthy. Your database is healthy. NGINX is running. But under load, connections start failing with `ECONNREFUSED` or `cannot assign requested address`. You check everything and find nothing wrong.

Then you run `ss -s` and see this:

```
TCP: 31,204 (estab 312, closed 30,891, orphaned 0, timewait 30,847)
```

30,000 sockets in `TIME_WAIT`. That is your problem — and it is **entirely invisible until it is catastrophic**.

This article explains what `TIME_WAIT` actually is at the TCP level, why Linux enforces it, when it becomes a problem, and how to fix it without breaking your network stack.

> **Related:** If you are hitting this from an NGINX context, see [NGINX Upstream Keepalive Explained](/blog/nginx-upstream-keepalive) and [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load).

---

## TL;DR

**What is TIME_WAIT?**
A mandatory TCP state after a connection closes. The socket holds its port for 60 seconds before being freed — by design, to prevent stale packets from corrupting new connections.

**When does it become a problem?**
When connections close faster than TIME_WAIT drains, **ephemeral ports exhaust**. Linux defaults give you ~28,000 ports. At 467 short-lived connections/second, you hit the ceiling in 60 seconds. Result: `ECONNREFUSED` or `EADDRNOTAVAIL` — even though your app is perfectly healthy.

**Key fixes, in order:**
1. **Eliminate short-lived connections** — add keepalive to NGINX upstreams, use connection pools in app code
2. **Widen the port range** — `net.ipv4.ip_local_port_range = 1024 65535`
3. **Enable socket reuse** — `net.ipv4.tcp_tw_reuse = 1`
4. **Never use `tcp_tw_recycle`** — removed in kernel 4.12, breaks NAT

---

## TCP Lifecycle: The Full Picture

> 💡 **Diagram suggestion:** A side-by-side flow showing "connection without keepalive" (7 round trips, TIME_WAIT at end) vs "connection with keepalive" (1 handshake, N requests, 1 teardown) would make the cost of short-lived connections immediately obvious here.

To understand `TIME_WAIT`, you need to understand the **full lifecycle of a TCP connection**. Most engineers know the three-way handshake. Fewer know the teardown sequence — and that is where `TIME_WAIT` lives.

### Connection Establishment: The 3-Way Handshake

```
Client                          Server
  |                               |
  |-------- SYN (seq=x) -------->|
  |                               |
  |<------ SYN-ACK (seq=y) ------|
  |                               |
  |-------- ACK (seq=x+1) ------->|
  |                               |
  |      Connection ESTABLISHED   |
```

### Data Transfer

```
Client                          Server
  |                               |
  |-------- HTTP Request -------->|
  |<------- HTTP Response --------|
  |                               |
```

### Connection Teardown: The 4-Way Handshake

**This is the sequence that creates `TIME_WAIT`:**

```
Client                          Server
  |                               |
  |---------- FIN --------------->|   Client says: "I'm done sending"
  |<---------- ACK ---------------|   Server acknowledges
  |                               |
  |<---------- FIN ---------------|   Server says: "I'm done too"
  |----------- ACK -------------->|   Client acknowledges
  |                               |
  |   Client enters TIME_WAIT     |
  |   (waits 2×MSL before close)  |
```

The side that sends the **first FIN** — the **active closer** — is the one that enters `TIME_WAIT`. In a reverse proxy setup like NGINX, **NGINX is the active closer** making requests to your upstream — so NGINX accumulates `TIME_WAIT` sockets, not the upstream app.

---

## What Is Linux TIME_WAIT?

`TIME_WAIT` is a **mandatory holding period** after a TCP connection closes. The socket stays allocated, consuming a port, for a duration of **2 × MSL** (Maximum Segment Lifetime).

On Linux, MSL is hardcoded at 60 seconds. So `TIME_WAIT` should last 120 seconds — but the kernel constant `TCP_TIMEWAIT_LEN` is set to **60 seconds** in practice:

```bash
# You cannot change this without recompiling the kernel
grep TCP_TIMEWAIT_LEN /usr/include/linux/tcp.h
# #define TCP_TIMEWAIT_LEN (60*HZ)
```

### Why TIME_WAIT Exists: Two Reasons

**Reason 1: Guarantee the final ACK was delivered**

The last packet in teardown is an `ACK` from the active closer. If that `ACK` is lost, the passive closer retransmits its `FIN`. The active closer must still be alive to re-send the `ACK`. Without `TIME_WAIT`, the retransmitted `FIN` would hit a dead socket and get a `RST` — a protocol error.

**Reason 2: Prevent stale packets from corrupting new connections**

TCP packets can be delayed in the network. If `src:50234 → dst:8080` closes and a new connection immediately opens on the **same 4-tuple**, delayed packets from the old connection could be misread as data for the new one. `TIME_WAIT` prevents port reuse until those packets have definitely expired.

**`TIME_WAIT` is not a bug — it is a feature.** The problem is when it accumulates faster than it drains.

---

## When Linux TIME_WAIT Becomes a Problem: Ephemeral Port Exhaustion

`TIME_WAIT` only becomes destructive when you exhaust the **ephemeral port range**.

### What Are Ephemeral Ports?

When a process opens an outgoing TCP connection, the kernel assigns a **local (source) port** from the ephemeral range. This port is what differentiates multiple connections to the same destination.

```bash
# Check your current ephemeral port range
cat /proc/sys/net/ipv4/ip_local_port_range
# 32768   60999
```

The default range gives you **~28,000 ports**. Each port in `TIME_WAIT` is **unavailable for new outgoing connections** to the same destination. When the pool empties, the kernel cannot assign a new port:

```
EADDRNOTAVAIL: Cannot assign requested address
```

or more commonly:

```
ECONNREFUSED: Connection refused
```

### The Port Exhaustion Math

```
Ephemeral ports available:    ~28,000
TIME_WAIT duration:            60 seconds
Max sustainable conn rate:     28,000 / 60 = ~467 connections/second
```

At **467 new TCP connections per second**, you will exhaust the port pool within 60 seconds. In practice, exhaustion happens much sooner because:

- **Multiple worker processes** each open their own connections (NGINX `worker_processes 4` means 4× the connection rate)
- **Multiple upstream services** compete for the same port pool
- **Default port range** is not widened on most systems

Engineers typically see this at **50–200 req/s** on an NGINX server with no upstream keepalive configured.

---

## How to Detect TIME_WAIT Exhaustion on Linux

### Method 1: ss — The Right Tool

```bash
# Summary of all socket states
ss -s
```

Key output to watch:

```
Total: 31847
TCP:   30203 (estab 187, closed 29901, orphaned 0, timewait 29893)
```

Watch it live during a load test:

```bash
# Update every 0.5 seconds
watch -n 0.5 'ss -s | grep timewait'
```

**If `timewait` climbs continuously** without plateauing → you have a connection leak. **If it plateaus below ~20,000** → you are fine.

```bash
# TIME_WAIT sockets to a specific upstream
ss -tn state time-wait dst 127.0.0.1:8080 | wc -l

# All TIME_WAIT sockets with source/destination
ss -tn state time-wait | head -20

# Group by destination port to find the leaking upstream
ss -tn state time-wait | awk '{print $4}' | cut -d: -f2 | sort | uniq -c | sort -rn | head
```

### Method 2: netstat — Works Everywhere

```bash
# Count all sockets by state
netstat -ant | awk '{print $6}' | sort | uniq -c | sort -rn
# Output:
#   30201 TIME_WAIT
#     312 ESTABLISHED
#      45 LISTEN

# Watch live
watch -n 1 'netstat -ant | grep TIME_WAIT | wc -l'
```

### Method 3: /proc/net/sockstat — Raw Kernel Data

```bash
cat /proc/net/sockstat
# TCP: inuse 302 orphan 0 tw 29893 alloc 30195 mem 1847
```

The `tw` field is your `TIME_WAIT` count. This is what **Prometheus `node_exporter`** exposes as `node_sockstat_TCP_tw`.

### Confirming Port Exhaustion

These error messages, combined with high `TIME_WAIT` count, confirm exhaustion:

```bash
# Application-level (Go, Python, etc.)
dial tcp 127.0.0.1:8080: connect: cannot assign requested address

# NGINX error log
connect() failed (99: Cannot assign requested address) while connecting to upstream
connect() failed (111: Connection refused) while connecting to upstream
```

> **See also:** For a full breakdown of reading and correlating these error logs, see [Reading Logs Like a Detective: A Field Guide to Incident Triage](/blog/log-analysis-incident-triage).

---

## How to Fix Linux TIME_WAIT: In the Right Order

There are several approaches. **Apply them in this order** — kernel tuning should be a last resort, not a first instinct.

### Fix 1: Eliminate Unnecessary Short-Lived Connections (Root Cause Fix)

The correct fix is to stop creating so many `TIME_WAIT` sockets in the first place.

**For NGINX upstream connections** — add keepalive (see [NGINX Upstream Keepalive Explained](/blog/nginx-upstream-keepalive)):

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;
}
```

**For application HTTP clients** — use a connection pool:

```python
# Python requests — Session reuses connections automatically
session = requests.Session()
session.get('http://upstream/api')   # ✓ reuses connection

# NOT this — opens a new TCP connection every call
requests.get('http://upstream/api')  # ✗
```

```go
// Go — reuse the http.Client, never create one per request
var client = &http.Client{}     // ✓ declare once, reuse everywhere

http.Get("http://upstream/api") // ✗ creates a new client (new connection) each time
```

### Fix 2: Widen the Ephemeral Port Range

More ports = more headroom before exhaustion. This does not fix the root cause, but it buys time.

```bash
# Check current range
cat /proc/sys/net/ipv4/ip_local_port_range
# 32768   60999  (~28,000 ports)

# Apply immediately
echo "1024 65535" > /proc/sys/net/ipv4/ip_local_port_range

# Make permanent
echo "net.ipv4.ip_local_port_range = 1024 65535" >> /etc/sysctl.conf
sysctl -p
```

This gives you **~64,500 ports** — over double the default. At 200 connections/second, exhaustion time goes from ~140 seconds to ~322 seconds.

> **Safe to apply.** Ports below 1024 are privileged for listening — widening the ephemeral range to 1024 only affects outgoing connections.

### Fix 3: Enable tcp_tw_reuse

`tcp_tw_reuse = 1` allows the kernel to **reuse a `TIME_WAIT` socket** for a new outgoing connection when it is safe — verified via TCP timestamps (enabled by default).

```bash
echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
sysctl -p

# Verify
cat /proc/sys/net/ipv4/tcp_tw_reuse
# 1
```

**Safe and recommended** for servers making many outgoing connections (NGINX → upstream, microservices → database). Does not affect incoming connections.

> **Kernel version note:** Since Linux 4.12, `tcp_tw_reuse = 1` only applies to loopback by default. For all interfaces, use `tcp_tw_reuse = 2`.

### Fix 4: Tune tcp_fin_timeout

`tcp_fin_timeout` controls `FIN_WAIT_2` duration — a **different** state that also holds ports. Reducing it frees ports slightly faster:

```bash
# Default: 60 seconds — reduce to 15
echo "net.ipv4.tcp_fin_timeout = 15" >> /etc/sysctl.conf
sysctl -p
```

> **Important:** `tcp_fin_timeout` does **not** control `TIME_WAIT` duration. That is hardcoded at 60 seconds in the kernel and cannot be changed without a recompile.

### ⚠️ Do NOT Use tcp_tw_recycle

`net.ipv4.tcp_tw_recycle = 1` appears in countless old guides. **Do not use it — ever.**

- **Removed from the kernel in Linux 4.12 (2017)**
- Before removal, it broke connections from clients behind NAT by using per-destination timestamp tracking — most of the internet is behind NAT
- On modern kernels, the sysctl simply does not exist

```bash
# Verify it's gone on your system
sysctl net.ipv4.tcp_tw_recycle 2>&1
# sysctl: cannot stat /proc/sys/net/ipv4/tcp_tw_recycle: No such file or directory
```

If you see it in a runbook or Ansible playbook, remove it.

---

## Production-Ready sysctl Configuration

```bash
# /etc/sysctl.d/99-network-tuning.conf

# Widen ephemeral port range (~64,500 ports vs ~28,000 default)
net.ipv4.ip_local_port_range = 1024 65535

# Reuse TIME_WAIT sockets for outgoing connections (safe)
net.ipv4.tcp_tw_reuse = 1

# Reduce FIN_WAIT_2 timeout (does NOT affect TIME_WAIT)
net.ipv4.tcp_fin_timeout = 15

# Increase socket listen backlog for high connection rate
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# TCP timestamps — required for tcp_tw_reuse to work
net.ipv4.tcp_timestamps = 1
```

```bash
# Apply
sysctl -p /etc/sysctl.d/99-network-tuning.conf

# Verify
sysctl net.ipv4.ip_local_port_range net.ipv4.tcp_tw_reuse net.ipv4.tcp_fin_timeout
```

---

## Monitoring TIME_WAIT in Production

Do not wait for 2am alerts to discover port exhaustion. Add proactive monitoring.

### Prometheus + node_exporter

```promql
# Current TIME_WAIT socket count
node_sockstat_TCP_tw

# Alert rule
alert: HighTimeWait
expr: node_sockstat_TCP_tw > 20000
for: 2m
labels:
  severity: warning
annotations:
  summary: "High TIME_WAIT count on {{ $labels.instance }}"
  description: "{{ $value }} TIME_WAIT sockets. Port exhaustion risk."
```

### Shell Script Monitor (No Prometheus)

```bash
#!/bin/bash
# /usr/local/bin/check-timewait.sh

THRESHOLD=15000
TW_COUNT=$(awk '/TCP:/ {print $6}' /proc/net/sockstat)
PORT_RANGE=$(awk '{print $2 - $1}' /proc/sys/net/ipv4/ip_local_port_range)

echo "TIME_WAIT: $TW_COUNT / $PORT_RANGE ports used ($(( TW_COUNT * 100 / PORT_RANGE ))%)"

if [ "$TW_COUNT" -gt "$THRESHOLD" ]; then
    echo "WARNING: TIME_WAIT count is high — risk of port exhaustion"
    exit 1
fi
```

---

## Summary: TIME_WAIT Diagnostic Decision Tree

```
Seeing ECONNREFUSED or "cannot assign requested address" under load?
│
├─ Step 1: ss -s | grep timewait
│
├─ timewait < 5,000
│   └─ Not a TIME_WAIT problem
│       Check: upstream health, app logs, NGINX worker_connections
│
└─ timewait > 10,000 and climbing
    │
    ├─ Fix 1: Add keepalive to NGINX upstream blocks
    ├─ Fix 2: Use connection pooling in app HTTP clients
    ├─ Fix 3: Widen ip_local_port_range → 1024 65535
    ├─ Fix 4: Enable tcp_tw_reuse = 1
    └─ Fix 5: Reduce tcp_fin_timeout → 15
```

---

## Conclusion

**Linux `TIME_WAIT` is not a bug** — it is a deliberate TCP safety mechanism that protects against stale packets and lost ACKs. The problem is when short-lived connections accumulate faster than the 60-second `TIME_WAIT` timer drains, exhausting the ephemeral port pool.

The fix starts with **eliminating unnecessary connections** — upstream keepalive in NGINX, connection pools in application HTTP clients. Kernel tuning (`tcp_tw_reuse`, wider port range) provides safety margin but is not a substitute for fixing the connection pattern.

**Monitor `TIME_WAIT` counts in production.** A rising count is an early warning you can act on before users see a single error.

---

*For the NGINX-specific side of this problem, see [NGINX Upstream Keepalive Explained](/blog/nginx-upstream-keepalive) and [NGINX 502 Bad Gateway Under Load](/blog/nginx-502-under-load). For general socket-level debugging, see [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging).*