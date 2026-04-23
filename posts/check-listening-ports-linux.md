---
title: "How to Check Listening Ports in Linux (2026 Guide)"
date: "2026-04-22"
excerpt: "Check listening ports in Linux with ss, netstat, lsof, and nmap — know which service owns each port, detect unexpected listeners, and troubleshoot connection refused errors."
tags: ["linux", "networking", "troubleshooting", "security"]
featured: false
slug: "check-listening-ports-linux-guide"
---

A connection refused error. An unexpected service. A security audit question. All of them start the same way: which ports are listening, on which interface, and which process owns them?

---

## TL;DR

```bash
ss -tlnp          # TCP listening ports — use this first
ss -tlunp         # TCP + UDP listening
lsof -i -sTCP:LISTEN   # alternative with more process detail
nmap -sT localhost      # scan from outside the process table
```

---

## ss: The Primary Tool

`ss` (socket statistics) is the modern replacement for `netstat`, pre-installed on all current Linux distributions.

```bash
ss -tlnp
```

```
State    Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN   0       128     0.0.0.0:22          0.0.0.0:*          users:(("sshd",pid=1023,fd=3))
LISTEN   0       511     0.0.0.0:80          0.0.0.0:*          users:(("nginx",pid=2341,fd=6))
LISTEN   0       128     127.0.0.1:5432      0.0.0.0:*          users:(("postgres",pid=3012,fd=4))
LISTEN   0       128     [::]:22             [::]:*             users:(("sshd",pid=1023,fd=4))
```

### Flags

```bash
-t   # TCP only
-l   # listening sockets only
-n   # show numbers, not service names
-p   # show process (requires root for full info)
-u   # include UDP
```

### Check a specific port

```bash
ss -tlnp | grep :8080    # is 8080 in use?
ss -tlnp | grep :3306    # is MySQL accessible?
```

---

## What the Output Tells You

### Interface binding — the most important detail

```
0.0.0.0:80      → accessible from any network interface (externally reachable)
127.0.0.1:5432  → localhost only (not reachable from outside)
[::]:22         → all IPv6 interfaces
[::1]:6379      → IPv6 localhost only
```

**This is the key security question.** A service on `0.0.0.0` is exposed to every interface. A database that should be localhost-only but shows `0.0.0.0:3306` is a misconfiguration.

### Recv-Q on LISTEN sockets

```
Recv-Q = 0   → normal
Recv-Q > 0   → accept backlog filling up — app is slower than connection rate
```

---

## Alternative: lsof

`lsof -i` shows open internet sockets with more readable process detail:

```bash
lsof -i -sTCP:LISTEN
```

```
COMMAND   PID     USER   FD   TYPE  NODE NAME
sshd      1023    root    3u  IPv4  TCP  *:ssh (LISTEN)
nginx     2341    www     6u  IPv4  TCP  *:http (LISTEN)
postgres  3012    pg      4u  IPv4  TCP  localhost:postgresql (LISTEN)
```

```bash
# Check who's on a specific port
lsof -i :8080

# All TCP listeners with PIDs
lsof -nP -iTCP -sTCP:LISTEN
```

---

## netstat (If ss Is Unavailable)

On older systems or containers where `ss` isn't available:

```bash
netstat -tlnp

# Install if missing (Ubuntu)
apt install net-tools

# Install if missing (RHEL)
dnf install net-tools
```

The output format is similar to `ss` but slightly different column ordering.

---

## Real Examples

### Full server port audit

```bash
echo "=== TCP Listeners ===" && ss -tlnp
echo "=== UDP Listeners ===" && ss -ulnp
echo "=== Established Connections ===" && ss -tnp state established | wc -l
```

### Find unexpected listeners (security check)

```bash
# What's listening on non-standard ports?
ss -tlnp | awk '{print $4}' | grep -oE ':[0-9]+$' | sort -t: -k2 -n | uniq

# Expected ports on a web server: 22, 80, 443
# Anything else needs an explanation
```

### Verify service is actually listening after start

```bash
systemctl start myapp
sleep 2
ss -tlnp | grep :8080
# If nothing: service crashed on startup — check journalctl -u myapp
```

### Check if port is accessible from outside (nmap)

```bash
# Scan from the same host
nmap -sT -p 80,443,8080 localhost

# From another host
nmap -sT -p 80,443,8080 192.168.1.100
```

The difference between `ss` and `nmap`: `ss` shows what the kernel reports from inside the system. `nmap` tests actual network reachability — accounting for firewall rules. Both are useful.

### Find which service is blocking a port

```bash
# Port 8080 shows in use but you don't know what:
ss -tlnp | grep :8080
# users:(("java",pid=4521,fd=12))

ps -p 4521 -o pid,comm,user,args
# Shows full command line of the process
```

---

## Troubleshoot: Connection Refused

When clients get `connection refused` on a port you expect to be open:

```bash
# 1. Is anything listening?
ss -tlnp | grep :<port>
# Nothing → service not running or bound to wrong port

# 2. Is it bound to localhost only?
ss -tlnp | grep :<port>
# 127.0.0.1:8080 → only accessible locally

# 3. Is firewall blocking it?
iptables -L INPUT -n | grep <port>
# or
firewall-cmd --list-all   # RHEL
ufw status                # Ubuntu

# 4. Is the service on the right interface?
ss -tlnp | grep :<port>
# [::1]:8080 → IPv6 localhost only — if client is IPv4, won't connect
```

---

## Common Mistakes

**Mistake 1: Assuming a listening port is reachable**
The port could be bound to `127.0.0.1` or blocked by a firewall. Always check the local address column.

**Mistake 2: Not using `-n` flag**
Without `-n`, `ss` resolves ports to service names (`http`, `postgresql`). For non-standard ports, it shows nothing or hangs. Use `-n` always.

**Mistake 3: Missing process info because not running as root**
```bash
ss -tlnp              # may show (null) for process
sudo ss -tlnp         # shows full process info
```

**Mistake 4: Only checking TCP**
Some services use UDP (DNS, NTP, Syslog):
```bash
ss -ulnp              # UDP listeners
ss -tlunp             # both TCP and UDP
```

---

## Pro Tips

```bash
# Watch for new listeners in real time
watch -n 2 'ss -tlnp'

# Find all listening ports sorted by port number
ss -tlnp | awk 'NR>1 {print $4}' | sort -t: -k2 -n

# Check if IPv6 is also listening (after binding to 0.0.0.0)
ss -tlnp | grep -E '0\.0\.0\.0|::'

# Monitor connection counts per port
watch -n 1 "ss -tn state established | awk '{print \$4}' | cut -d: -f2 | sort | uniq -c | sort -rn | head"

# Export to file for comparison
ss -tlnp > /tmp/ports_before.txt
# (make changes)
ss -tlnp > /tmp/ports_after.txt
diff /tmp/ports_before.txt /tmp/ports_after.txt
```

---

## Conclusion

`ss -tlnp` gives you the full picture: port, interface, process. The local address column is what matters — `0.0.0.0` means externally reachable, `127.0.0.1` means local only. When connection refused errors appear, check if anything is listening, then check if it's bound to the right interface, then check the firewall.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — more depth on ss and netstat comparison. [Linux Kill Process by Port](/blog/linux-kill-process-by-port) — once you find the port, how to kill what's using it.*
