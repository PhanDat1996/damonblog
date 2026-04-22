---
title: "How to Test TCP Connection in Linux: nc, curl, telnet"
date: "2026-04-22"
excerpt: "Test TCP connections in Linux using nc, curl, telnet, and /dev/tcp — verify port reachability, measure response time, and debug connection failures with real examples."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "how-to-test-tcp-connection-linux"
---

You need to know if a port is reachable before debugging further. Here are the reliable ways to test a TCP connection — and what the output actually tells you.

---

## TL;DR

```bash
nc -zv host 8080          # test port — best general purpose
curl -v telnet://host:8080  # curl TCP test
telnet host 8080           # classic, interactive
cat /dev/null > /dev/tcp/host/8080 && echo open || echo closed  # no extra tools
```

---

## nc (netcat): The Standard Tool

```bash
nc -zv 192.168.1.100 8080
```

Flags:
- `-z` — scan mode, don't send data
- `-v` — verbose, shows result clearly

Output:

```
# Success:
Connection to 192.168.1.100 8080 port [tcp/http-alt] succeeded!

# Refused (nothing listening):
nc: connect to 192.168.1.100 port 8080 (tcp) failed: Connection refused

# Timed out (firewall DROP):
nc: connect to 192.168.1.100 port 8080 (tcp) failed: Connection timed out
```

**Refused** = something reachable but nothing on that port.
**Timed out** = firewall silently dropping packets, or host unreachable.

### Test multiple ports

```bash
for port in 80 443 8080 8443; do
  nc -zv -w 2 192.168.1.100 $port 2>&1 | grep -E "succeeded|failed"
done
```

### Set a timeout

```bash
nc -zv -w 3 host 8080   # 3 second timeout instead of hanging
```

### Test UDP

```bash
nc -zvu host 53    # test DNS UDP port
```

---

## /dev/tcp: No Extra Tools Required

Available in bash without any packages:

```bash
# Test if port is open
timeout 3 bash -c 'cat /dev/null > /dev/tcp/192.168.1.100/8080' 2>/dev/null \
  && echo "Port open" || echo "Port closed/filtered"
```

Useful in minimal containers where nc isn't installed.

---

## curl: Test HTTP and TCP

```bash
# HTTP test
curl -sv http://host:8080/health 2>&1 | head -30

# Raw TCP (no HTTP)
curl -v telnet://host:8080

# With timeout
curl -sv --connect-timeout 5 http://host:8080/

# Check just the response code
curl -o /dev/null -s -w "%{http_code}\n" http://host:8080/health
```

`curl -v` shows the full TLS handshake and HTTP exchange — useful for SSL debugging.

---

## telnet: Classic Interactive Test

```bash
telnet host 8080
```

- If it connects: you'll see a blank line or a banner. Port is open.
- `Connection refused`: nothing listening.
- Hangs: firewall DROP rule.

Press `Ctrl+]` then `quit` to exit.

Not installed by default on minimal systems, but widely available.

---

## Measure Connection Time

```bash
# Measure TCP handshake time with curl
curl -o /dev/null -s -w "Connect: %{time_connect}s  Total: %{time_total}s\n" http://host:8080/

# With nc (measure time to connect)
time nc -zv -w 5 host 8080
```

---

## Real Examples

### Verify a service is reachable from another server

```bash
# From app server, test database connectivity
nc -zv db01 5432
# Connection to db01 5432 port [tcp/postgresql] succeeded!
```

### Debug "connection refused" during deployment

```bash
# Is the new app listening yet?
while ! nc -z localhost 8080; do
  echo "Waiting for app to start..."
  sleep 2
done
echo "App is up"
```

### Test port from inside a Docker container

```bash
docker exec mycontainer nc -zv db 5432
# If nc isn't in container:
docker exec mycontainer bash -c 'cat /dev/null > /dev/tcp/db/5432 && echo open'
```

### Test through a specific interface

```bash
# Force connection through eth1
nc -s 192.168.2.10 -zv destination.host 443
```

### SSL/TLS port test

```bash
# Test TLS handshake
openssl s_client -connect host:443 -servername hostname < /dev/null 2>&1 | grep -E "Verify|Cipher|subject"

# Quick TLS check
curl -sv https://host:443/ 2>&1 | grep -E "Connected|SSL|TLS|Certificate"
```

---

## Interpreting Results

| Result | Cause | Next step |
|---|---|---|
| `succeeded` | Port is open and reachable | Service is running |
| `Connection refused` | Port not listening | Check if service is running: `ss -tlnp` |
| `Connection timed out` | Firewall DROP rule or host unreachable | Check firewall, check routing |
| `Name or service not known` | DNS failure | Check DNS: `dig hostname` |
| `No route to host` | Routing problem | Check `ip route`, check if host is up |

---

## Common Mistakes

**Mistake 1: Not setting a timeout**
Without `-w 3` or `--connect-timeout`, nc and curl wait the OS default (30+ seconds) on timed-out connections. Always set a timeout in scripts.

**Mistake 2: Confusing refused vs timed out**
Refused = firewall with REJECT, or no service. Timed out = firewall with DROP. REJECT is more user-friendly but exposes that something is there. DROP reveals nothing.

**Mistake 3: Testing from the wrong host**
A service can be reachable locally (`nc -zv localhost 8080`) but not from external hosts if it's bound to `127.0.0.1`. Always test from the actual client perspective.

---

## Quick Reference

```bash
nc -zv host port              # test TCP port
nc -zv -w 3 host port         # with 3s timeout
nc -zuv host 53               # test UDP
curl -o /dev/null -s -w "%{http_code}" http://host/  # HTTP status
timeout 3 bash -c 'cat /dev/null > /dev/tcp/host/port'  # no tools needed
openssl s_client -connect host:443  # TLS test
```

---

## Conclusion

`nc -zv host port` is the cleanest test — works for any TCP port, clear success/failure output. Add `-w 3` to avoid hanging on filtered ports. For HTTP specifically, `curl -sv` gives you headers and TLS info. In minimal environments without nc, `/dev/tcp` is always available in bash.

---

*Related: [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — full diagnostic workflow when nc shows a problem. [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — verify what's listening on the server side.*
