---
title: "Cannot Connect to Server Linux: Step-by-Step Troubleshooting"
date: "2026-04-22"
excerpt: "Troubleshoot 'cannot connect to server' on Linux — diagnose connection refused, timeout, and network unreachable errors with a systematic step-by-step approach."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "cannot-connect-to-server-linux-troubleshooting"
category: "linux"
---

Connection refused. Connection timed out. Network unreachable. Each error means something different and points to a different fix.

---

## TL;DR: Read the Error First

| Error | Meaning | Start here |
|---|---|---|
| `Connection refused` | Server up, nothing listening on that port | Check if service is running |
| `Connection timed out` | Packets dropped (firewall, routing, server down) | Check firewall and routing |
| `Network unreachable` | No route to destination | Check routing table |
| `Name or service not known` | DNS resolution failed | Check DNS |
| `No route to host` | ARP failed or host down | Check if host is up |

---

## Step 1: Confirm the Error Type

```bash
# Test connection
curl -v http://10.0.1.50:8080/health
nc -zv 10.0.1.50 8080
telnet 10.0.1.50 8080
```

The error message is your first diagnostic. Don't skip this — "connection refused" and "connection timed out" have completely different causes.

---

## Step 2: Is the Host Reachable at All?

```bash
ping -c 3 10.0.1.50

# If ping fails:
# - host is down
# - ICMP is blocked by firewall
# - wrong IP address

# Check routing
ip route get 10.0.1.50
# Shows which interface and gateway will be used

traceroute 10.0.1.50
# Shows where packets stop
```

---

## Step 3: Fix "Connection Refused"

`Connection refused` means the host is reachable but nothing is listening on that port.

```bash
# On the SERVER: is the service running?
systemctl status myapp
ss -tlnp | grep :8080

# Not running? Start it
systemctl start myapp

# Running but on wrong interface?
ss -tlnp | grep :8080
# 127.0.0.1:8080 — only accessible locally!
# Fix: change bind address in app config to 0.0.0.0
```

**Bound to localhost is the most common cause.** The service is running but only accessible from the server itself.

---

## Step 4: Fix "Connection Timed Out"

Timeout = packets are being dropped. Usually a firewall.

```bash
# On the SERVER: check firewall
# Ubuntu (ufw)
ufw status
ufw allow 8080/tcp

# RHEL (firewalld)
firewall-cmd --list-all
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload

# Raw iptables
iptables -L INPUT -n | grep 8080
iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
```

```bash
# Is the server's firewall blocking?
# Test from the server itself:
curl localhost:8080    # works = firewall is blocking external
curl 10.0.1.50:8080   # still works = cloud security group issue
```

Cloud servers (AWS/GCP/Azure/Vercel) also have security groups / VPC firewall rules outside the OS. Check those in the cloud console.

---

## Step 5: Fix DNS Issues

```bash
# Test DNS resolution
nslookup api.example.com
dig api.example.com

# If DNS fails but IP works:
curl http://api.example.com/health  # fails
curl http://1.2.3.4/health          # works

# Check DNS config
cat /etc/resolv.conf

# Flush DNS cache
systemd-resolve --flush-caches
# or
service nscd restart
```

---

## Step 6: Check from Both Sides

If you have access to the destination server:

```bash
# ON THE DESTINATION SERVER:

# 1. Is the service listening?
ss -tlnp | grep :8080

# 2. Is the firewall blocking?
iptables -L INPUT -n -v | grep :8080

# 3. Are connections arriving?
tcpdump -i any port 8080 -n
# (run this, then trigger the connection from the client)
# If no packets show: network/routing issue
# If packets show but no response: app issue
```

`tcpdump` is definitive — if packets arrive at the server, the network is fine. If they don't, the problem is between the client and server.

---

## Real Examples

### App deployed, clients get "connection refused"

```bash
# Server side
ss -tlnp | grep :3000
# LISTEN 0 128 127.0.0.1:3000 ...
# ^^^^ bound to localhost only

# Fix: in app config (Node.js example)
# app.listen(3000, '0.0.0.0')  ← was: app.listen(3000)
```

### Works from server, times out from client

```bash
# From server: works
curl localhost:8080

# From client: times out
# → Firewall blocking external access

# On server (Ubuntu)
ufw allow from 10.0.0.0/8 to any port 8080
```

### Intermittent timeouts under load

```bash
# Check connection states
ss -s
# TIME-WAIT: 14000 climbing → port exhaustion

# Check backlog
ss -tlnp | grep :8080
# Recv-Q: 128 → accept backlog full, new connections dropped

# Fix: increase backlog and reuse ports
echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
sysctl -p
```

---

## Common Mistakes

**Testing from the server itself and assuming external works the same.** `curl localhost:8080` succeeds but external connections get refused — the service is bound to 127.0.0.1.

**Fixing the OS firewall but forgetting cloud security groups.** AWS security groups, GCP firewall rules, and Azure NSGs are separate from `iptables`/`firewalld`.

**Not checking which interface the service is bound to.** `0.0.0.0` = all interfaces. `127.0.0.1` = localhost only. `10.0.1.50` = specific interface only.

---

## Conclusion

Read the error message carefully — it tells you where to start. `Connection refused` = service not running or wrong bind address. `Timed out` = firewall or routing. Use `tcpdump` when you need ground truth about whether packets are actually arriving.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — confirm what's actually listening. [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — socket-level debugging.*
