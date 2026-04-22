---
title: "How to Trace Route in Linux: traceroute Examples"
date: "2026-04-22"
excerpt: "Use traceroute in Linux to diagnose network path issues — read hop output, interpret timeouts, use TCP mode to bypass firewalls, and identify where packets are being dropped."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "traceroute-linux-examples-guide"
---

Ping fails. Or it works but the connection is slow. `traceroute` shows you every hop between your server and the destination — and where the problem is.

---

## TL;DR

```bash
traceroute google.com              # ICMP/UDP traceroute
traceroute -T -p 443 google.com    # TCP traceroute (bypasses firewalls)
mtr google.com                     # live traceroute with stats
tracepath google.com               # no root required
```

---

## Install

```bash
apt install traceroute     # Ubuntu
dnf install traceroute     # RHEL
```

`tracepath` is usually pre-installed and requires no root. `mtr` is the modern alternative.

---

## Basic Usage

```bash
traceroute google.com
```

```
traceroute to google.com (142.250.80.46), 30 hops max, 60 byte packets
 1  _gateway (192.168.1.1)  1.234 ms  1.189 ms  1.201 ms
 2  isp-router.example.com (10.0.0.1)  5.432 ms  5.389 ms  5.401 ms
 3  core-router.isp.net (203.0.113.1)  8.912 ms  8.876 ms  8.899 ms
 4  * * *
 5  74.125.243.65 (74.125.243.65)  12.345 ms  12.298 ms  12.312 ms
 6  142.250.80.46 (142.250.80.46)  14.234 ms  14.189 ms  14.201 ms
```

Each line is one hop. Three latency values = three probe packets sent.

---

## Reading the Output

| Output | Meaning |
|---|---|
| `1.234 ms  1.189 ms  1.201 ms` | Normal — 3 probes, consistent latency |
| `* * *` | No response — hop blocks ICMP/UDP probes |
| `10.234 ms  10.189 ms  *` | Partial response — intermittent packet loss |
| Sudden latency jump | Congestion or long-distance link at that hop |
| `!X`, `!N`, `!H` | Error codes (prohibited, network unreachable, host unreachable) |

**`* * *` doesn't always mean broken.** Many routers drop ICMP TTL-exceeded packets intentionally. If packets get through the `* * *` hop and continue, the route is working.

---

## TCP Traceroute: Bypass Firewalls

Standard traceroute uses UDP (or ICMP). Firewalls often block these. TCP mode uses the actual application port:

```bash
# Test path to port 443 (HTTPS)
traceroute -T -p 443 google.com

# Test path to port 80
traceroute -T -p 80 192.168.1.100

# Test path to port 22 (SSH)
traceroute -T -p 22 server01
```

Use TCP traceroute when:
- Standard traceroute shows `* * *` everywhere
- You're debugging a specific port connection
- You're troubleshooting through a firewall

---

## mtr: Better Than traceroute

`mtr` combines ping and traceroute into a live display with statistics:

```bash
mtr google.com

# Non-interactive (report mode)
mtr --report --report-cycles 20 google.com

# TCP mode
mtr --tcp --port 443 google.com
```

```
Host                          Loss%   Snt   Last   Avg  Best  Wrst StDev
1. _gateway                    0.0%    20    1.2   1.2   1.1   1.4   0.1
2. isp-router.example.com      0.0%    20    5.4   5.4   5.3   5.6   0.1
3. * * *                       100.0%  20    0.0   0.0   0.0   0.0   0.0
4. 74.125.243.65                0.0%    20   12.3  12.4  12.2  12.8   0.2
```

`Loss%` column is the key — actual packet loss percentage per hop. If loss starts at hop 4 and continues, hop 4 is where the problem is. If only hop 3 shows loss but hop 4 is clean, hop 3 is just rate-limiting ICMP (not a real problem).

---

## Real Examples

### Diagnose high latency to a service

```bash
mtr --report --report-cycles 30 slow-service.example.com
```

Look for where latency jumps significantly. A hop from 5ms to 80ms = long-distance link or congestion at that router.

### Find where a connection is being dropped

```bash
# Standard traceroute stops responding after hop 8
traceroute target.server.com

# Switch to TCP to bypass ICMP filtering
traceroute -T -p 80 target.server.com
# If TCP traceroute completes: ICMP is blocked, connection works
# If TCP traceroute also stops: firewall blocking at that hop
```

### Verify path to database server

```bash
traceroute -T -p 5432 db01.internal.company.com
# Confirms packets route through expected network path
```

### Compare routes from two servers

```bash
# On server A
traceroute target.com > /tmp/trace_a.txt

# On server B
traceroute target.com > /tmp/trace_b.txt

diff /tmp/trace_a.txt /tmp/trace_b.txt
# Shows where the paths diverge
```

---

## tracepath: No Root Required

`tracepath` is simpler than `traceroute` and doesn't require root:

```bash
tracepath google.com
```

Useful in containers or restricted environments where you can't run `traceroute`.

---

## Common Mistakes

**Mistake 1: Assuming `* * *` means the route is broken**
Many production routers block ICMP TTL-exceeded responses. If packets continue past the `* * *` hop and reach the destination, the route is working. Check if the final destination responds.

**Mistake 2: Not using TCP mode when testing application connectivity**
If you're debugging why TCP port 443 isn't reaching a server, use `traceroute -T -p 443`. UDP traceroute tests a different path through some firewalls.

**Mistake 3: Reading individual probe times instead of trends**
One `* * *` among consistent results is noise. Look at the overall pattern: where does latency permanently increase? Where do probes stop responding entirely?

**Mistake 4: Comparing traceroutes taken at different times**
Network routes change. Compare routes taken simultaneously from the same source for meaningful analysis.

---

## Quick Reference

```bash
traceroute host              # standard (UDP/ICMP)
traceroute -T -p 443 host   # TCP mode, port 443
traceroute -I host          # ICMP mode
tracepath host               # no root needed
mtr host                     # live with stats
mtr --report -c 20 host     # generate report
mtr --tcp --port 443 host   # TCP mtr
```

---

## Conclusion

`traceroute` shows the path, `mtr` shows loss and latency statistics over time. Use TCP mode (`-T -p`) when testing a specific service port or when ICMP is blocked. The `Loss%` column in mtr is the most useful single metric — if only one hop shows loss but downstream hops are clean, that hop is rate-limiting probes, not dropping real traffic.

---

*Related: [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — traceroute is step 5 in the connectivity diagnostic workflow. [How to Test TCP Connection Linux](/blog/how-to-test-tcp-connection-linux) — nc and curl for testing specific ports.*
