---
title: "ping vs curl vs telnet: Which to Use for Network Testing"
date: "2026-04-22"
excerpt: "Know when to use ping, curl, and telnet for network testing — what each tool tests, what its limitations are, and which to reach for first when debugging connectivity issues."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "ping-vs-curl-vs-telnet-difference"
---

Each tool tests a different layer of the network stack. Using the wrong one gives you a false positive or misses the real problem. Here's exactly what each one tests and when to use it.

---

## TL;DR

| Tool | Tests | Use when |
|---|---|---|
| `ping` | ICMP reachability, basic latency | Is the host alive at all? |
| `telnet` | TCP port connectivity | Is the port open? |
| `nc` | TCP/UDP port, also sends data | Better than telnet for scripting |
| `curl` | Full HTTP/HTTPS request | Is the web service responding correctly? |

---

## ping: Network Layer Only

```bash
ping -c 3 google.com
ping -c 3 192.168.1.100
```

**What it tests:** ICMP echo request/reply. Confirms the host is reachable at the IP level.

**What it does NOT test:**
- Whether any specific port is open
- Whether any service is running
- Whether a firewall is blocking TCP

```
PING google.com (142.250.80.46): 56 data bytes
64 bytes from 142.250.80.46: icmp_seq=0 ttl=116 time=12.3 ms
64 bytes from 142.250.80.46: icmp_seq=1 ttl=116 time=11.9 ms

--- google.com ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 11.9/12.1/12.3/0.2 ms
```

**Limitations:** Many servers block ICMP. `ping` failing doesn't mean the server is down — it might just block pings. A service can be unreachable on TCP while still responding to ping.

```bash
# Ping with interval and count
ping -c 5 -i 0.5 host    # 5 pings, 0.5s interval

# Ping with timeout
ping -W 3 host            # 3 second wait per reply

# Ping to check packet loss over time
ping -c 100 host | tail -2
```

---

## telnet: TCP Port Test

```bash
telnet host 80
telnet 192.168.1.100 8080
```

**What it tests:** Whether a TCP connection can be established to a specific port.

**What it does NOT test:**
- Whether the service is responding correctly
- HTTP response codes
- TLS certificates

If you see `Connected to host.` — the port is open. If you see `Connection refused` or it hangs — the port is closed or firewalled.

**Problem:** Not installed by default on many systems. Use `nc` instead:

```bash
nc -zv host 8080        # cleaner, shows clear success/failure
nc -zv -w 3 host 8080   # with timeout
```

---

## curl: Application Layer Test

```bash
curl -sv http://host:8080/health
curl -o /dev/null -s -w "%{http_code}" http://host/
```

**What it tests:** Full HTTP/HTTPS request and response — DNS resolution, TCP connection, TLS handshake, HTTP status code, response body.

**This is the most complete test.** If curl succeeds, everything from DNS to the application layer is working.

```bash
# Quick status check
curl -o /dev/null -s -w "HTTP %{http_code}  Connect: %{time_connect}s  Total: %{time_total}s\n" http://host/

# Verbose — see every step
curl -sv https://host/api/health 2>&1 | head -40

# Test with specific Host header (virtual host)
curl -H "Host: mysite.com" http://server-ip/

# Test with timeout
curl --connect-timeout 5 --max-time 10 http://host/

# Follow redirects
curl -L http://host/

# Test TLS certificate
curl -sv https://host/ 2>&1 | grep -E "SSL|TLS|Certificate|Verify"
```

---

## The Testing Ladder

Use tools in order from broad to specific:

```
1. ping host              → Is the host alive at the IP level?
   ↓ if works
2. nc -zv host 8080       → Is the TCP port reachable?
   ↓ if works
3. curl http://host:8080/ → Is the HTTP service responding?
   ↓ if works
4. curl -sv https://host/ → Is TLS working correctly?
```

Each step narrows the problem. If step 1 fails but step 2 works (ping blocked by firewall but TCP port is open), you know it's ICMP filtering, not a connectivity problem.

---

## Real Examples

### Classic false positive: ping works, service doesn't

```bash
ping -c 3 db01
# 0% packet loss — host is reachable

telnet db01 5432
# Connection refused

# Conclusion: host is up, database is not running
systemctl status postgresql  # on db01
```

### Classic false negative: ping fails, service works

```bash
ping -c 3 cloudflare.com
# 100% packet loss — Cloudflare blocks ICMP

curl https://cloudflare.com
# HTTP 200 — site works fine
```

Never conclude a server is down based on ping alone if you know the destination blocks ICMP.

### Debug why curl fails but nc succeeds

```bash
nc -zv api.example.com 443
# Connection succeeded

curl https://api.example.com/health
# curl: (60) SSL certificate problem: certificate has expired

# TCP is fine. TLS certificate is the problem.
openssl s_client -connect api.example.com:443 | grep "Verify"
```

### Measure what's slow

```bash
curl -o /dev/null -s -w "
DNS:     %{time_namelookup}s
Connect: %{time_connect}s
TLS:     %{time_appconnect}s
TTFB:    %{time_starttransfer}s
Total:   %{time_total}s
" https://host/api/endpoint
```

Breaks down where time is spent — slow DNS, slow TLS, slow app response.

---

## Common Mistakes

**Mistake 1: Concluding a server is down because ping fails**
Many cloud hosts block ICMP by default. Test the actual port instead.

**Mistake 2: Using telnet when curl is available for HTTP testing**
`telnet host 80` tells you the port is open. `curl http://host/` tells you the service is actually responding with valid HTTP.

**Mistake 3: Not testing from the right source**
A service might be accessible from the server itself but not from external clients. Always test from the location of the actual client (or as close as possible).

**Mistake 4: Forgetting `-L` with curl for redirects**
HTTP → HTTPS redirects make curl appear to fail:

```bash
curl http://host/         # might get 301, looks like failure
curl -L http://host/      # follows redirect to HTTPS, shows actual result
```

---

## Quick Reference

```bash
# Ping — network layer
ping -c 3 host
ping -c 3 -W 2 host    # 2s timeout per packet

# TCP port test — transport layer
nc -zv host 8080
nc -zv -w 3 host 8080   # 3s timeout

# HTTP test — application layer
curl -sv http://host/
curl -o /dev/null -s -w "%{http_code}" http://host/
curl --connect-timeout 5 http://host/

# Measure all layers
curl -w "DNS:%{time_namelookup} TCP:%{time_connect} Total:%{time_total}" \
  -o /dev/null -s https://host/
```

---

## Conclusion

Ping tests IP reachability, nc tests TCP ports, curl tests the full application stack. Use them in that order to narrow down where connectivity breaks. A ping failure doesn't mean the server is down. A curl failure doesn't mean the port is closed. Each tool is a lens on a different layer — use the right one for the question you're asking.

---

*Related: [How to Test TCP Connection Linux](/blog/how-to-test-tcp-connection-linux) — nc and /dev/tcp for port testing. [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — full diagnostic workflow.*
