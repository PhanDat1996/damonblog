---
title: "Linux Check Listening Ports with ss: Complete Guide"
date: "2026-04-22"
excerpt: "Check listening ports in Linux with ss — see TCP and UDP listeners, find which process owns each port, filter by interface binding, and detect unexpected services."
tags: ["linux", "networking", "troubleshooting", "security", "monitoring"]
featured: false
slug: "linux-check-listening-ports-ss-command"
---

What's listening on this server? Which process owns port 8080? Is the database exposed to the network or localhost only? `ss` answers all of it in one command.

---

## TL;DR

```bash
ss -tlnp          # TCP listening ports with process
ss -ulnp          # UDP listening ports
ss -tlunp         # both TCP and UDP
ss -tlnp | grep :8080    # specific port
```

---

## The Core Command

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

Flags:
- `-t` — TCP only
- `-l` — listening sockets only
- `-n` — port numbers, not service names
- `-p` — process name and PID

---

## Read the Local Address Column

This is the most important column for security and connectivity:

| Local Address | Meaning |
|---|---|
| `0.0.0.0:80` | All IPv4 interfaces — externally reachable |
| `127.0.0.1:5432` | Localhost only — not reachable from network |
| `[::]:22` | All IPv6 interfaces |
| `[::1]:6379` | IPv6 localhost only |
| `10.0.1.10:8080` | Specific interface only |

A database showing `0.0.0.0:3306` instead of `127.0.0.1:3306` is a misconfiguration — it's exposed to every network interface.

---

## Check a Specific Port

```bash
# Is port 8080 in use?
ss -tlnp | grep :8080

# Nothing returned = port is free
# Output returned = something is listening
```

---

## UDP Ports

```bash
# UDP listeners (DNS, NTP, syslog, etc.)
ss -ulnp

# Both TCP and UDP
ss -tlunp
```

---

## Security Audit: What's Exposed?

```bash
# Everything NOT on localhost — potentially reachable externally
ss -tlnp | grep -v '127\.0\.0\.1' | grep -v '\[::1\]' | grep LISTEN
```

Expected on a web server: ports 22, 80, 443.
Anything else needs a documented reason.

---

## Real Examples

### After starting a service — did it bind to the right port?

```bash
systemctl start myapp
sleep 1
ss -tlnp | grep :8080
# If empty: app crashed on startup → check journalctl -u myapp
# If present: verify it's on the right interface
```

### Find what port a service is actually using

```bash
ss -tlnp | grep nginx
# Shows nginx on 80 and 443

# Or by PID
PID=$(pgrep nginx | head -1)
ss -tlnp | grep "pid=$PID"
```

### Detect services you didn't expect

```bash
# Compare against known-good list
EXPECTED="22 80 443"
ss -tlnp | awk '/LISTEN/{print $4}' | grep -oE '[0-9]+$' | sort -n | uniq | while read port; do
  if ! echo "$EXPECTED" | grep -qw "$port"; then
    echo "Unexpected port: $port"
    ss -tlnp | grep ":$port"
  fi
done
```

### Check if service is listening before connecting

```bash
# Health check script
check_port() {
  ss -tlnp | grep -q ":$1 "
  return $?
}

if check_port 8080; then
  echo "Service is up"
else
  echo "Service is not listening on 8080"
  exit 1
fi
```

### Find all services using IPv6

```bash
ss -tlnp | grep '\[::'
```

---

## Recv-Q on LISTEN Sockets

```
State    Recv-Q  Local Address:Port
LISTEN   0       0.0.0.0:80         ← normal
LISTEN   45      0.0.0.0:80         ← backlog filling up
```

`Recv-Q > 0` on a LISTEN socket means the accept backlog is filling. Clients are connecting faster than the application calls `accept()`. The service is under pressure.

---

## Common Mistakes

**Mistake 1: Not using `-n`**
Without `-n`, ss resolves port numbers to service names. Non-standard ports show as `?` or take time to resolve. Always use `-n`.

**Mistake 2: Forgetting `-p` needs root**
```bash
ss -tlnp              # (null) for sockets owned by other users
sudo ss -tlnp         # shows all process names
```

**Mistake 3: Assuming IPv4 listener covers IPv6**
`0.0.0.0:80` listens on IPv4 only. On many Linux systems, you also need `[::]:80` for IPv6. Check both:

```bash
ss -tlnp | grep :80
# 0.0.0.0:80  AND [::]:80 = both protocols covered
# 0.0.0.0:80 only = no IPv6 support
```

**Mistake 4: Checking port without checking interface**
Port 80 open doesn't mean it's reachable. `127.0.0.1:80` rejects external connections. Always check the full Local Address, not just the port number.

---

## Quick Reference

```bash
ss -tlnp                        # TCP listeners + process
ss -ulnp                        # UDP listeners
ss -tlunp                       # TCP + UDP
ss -tlnp | grep :8080           # specific port
ss -tlnp | grep -v 127.0.0.1   # externally exposed only
sudo ss -tlnp                   # with process names for all users
```

---

## Conclusion

`ss -tlnp` — memorise it. The Local Address column tells you whether a service is accessible from the network or locked to localhost. `Recv-Q > 0` on a listener means backlog pressure. For a security audit, filter out localhost addresses and check what's left.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — broader guide including established connections. [Linux Check Open Connections](/blog/linux-check-open-connections-command) — see who's connected, not just what's listening.*
