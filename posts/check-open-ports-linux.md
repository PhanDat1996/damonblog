---
title: "Check Open Ports in Linux: ss vs netstat Explained"
date: "2026-04-21"
excerpt: "How to check open ports in Linux using ss and netstat — with real troubleshooting scenarios, filtering techniques, and a clear comparison of when to use each tool."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "check-open-ports-linux-ss-netstat"
---

## TL;DR

- **`ss`** is the modern replacement for `netstat` — faster, more accurate, pre-installed on all modern Linux
- **`netstat`** still works and is more familiar to many engineers — use it if you know it
- **`ss -tlnp`** — show TCP listening ports with process names (the command you will use most)
- **`ss -tlnp | grep :80`** — check if a specific port is open
- **`lsof -i :8080`** — alternative, shows process details including PID and user
- A port being "open" means something is listening — verify the correct process owns it
- Use `ss -tnp state established` to see active connections, not just listeners

---

## Introduction: Why Checking Open Ports Matters

Service will not start because "address already in use." A firewall rule is blocking traffic but you do not know what is supposed to be running on that port. A security audit asks you to enumerate all listening services.

**Checking open ports in Linux** is a daily task for any engineer managing servers. The right command tells you not just which ports are open, but what process owns them, whether they are accepting connections from all interfaces or just localhost, and how many connections they currently have.

---

## Using ss to Check Open Ports

`ss` (socket statistics) replaced `netstat` as the standard tool on modern Linux. It reads from the kernel directly, is faster, and shows more detail.

### The Most Useful Command

```bash
ss -tlnp
```

Breakdown of flags:
- **`-t`** — TCP sockets (add `-u` for UDP)
- **`-l`** — listening sockets only
- **`-n`** — show port numbers, not service names
- **`-p`** — show process name and PID

Output:
```
State    Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN   0       128     0.0.0.0:80         0.0.0.0:*          users:(("nginx",pid=1234,fd=6))
LISTEN   0       128     127.0.0.1:5432     0.0.0.0:*          users:(("postgres",pid=5678,fd=4))
LISTEN   0       128     0.0.0.0:22         0.0.0.0:*          users:(("sshd",pid=910,fd=3))
```

Reading this output:
- **`0.0.0.0:80`** — listening on all interfaces, port 80 (accessible from anywhere)
- **`127.0.0.1:5432`** — listening only on localhost, port 5432 (not accessible remotely)
- **`[::]:22`** — listening on all IPv6 interfaces

**The local address matters.** A service bound to `0.0.0.0` is accessible from any network interface. A service bound to `127.0.0.1` is only accessible locally. This is a common security misconfiguration — databases that should be localhost-only accidentally bound to all interfaces.

### Check a Specific Port

```bash
# Is anything listening on port 8080?
ss -tlnp | grep :8080

# Check port for both TCP and UDP
ss -tlnp | grep :53    # TCP
ss -ulnp | grep :53    # UDP

# Check all at once
ss -tlunp | grep :53
```

### All Listening Sockets (TCP + UDP)

```bash
ss -tlunp
```

### Active Connections (Not Just Listeners)

```bash
# All established TCP connections
ss -tnp state established

# Connections to a specific destination
ss -tnp dst 10.0.1.50

# Connections from a specific source
ss -tnp src 192.168.1.0/24

# Connections on a specific port
ss -tnp dport :443
```

### Socket Statistics Summary

```bash
ss -s
# Total: 287
# TCP:   45 (estab 12, closed 8, orphaned 0, timewait 4)
```

---

## Using netstat to Check Open Ports

`netstat` is from the `net-tools` package — older, but still widely known and available on most systems. It is deprecated in favor of `ss` but functional.

```bash
# Install if missing
apt install net-tools   # Ubuntu
dnf install net-tools   # RHEL

# Equivalent of ss -tlnp
netstat -tlnp

# Show all sockets
netstat -anp

# Show only listening
netstat -lnp
```

`netstat` output:
```
Proto  Recv-Q  Send-Q  Local Address    Foreign Address  State   PID/Program name
tcp    0       0       0.0.0.0:80      0.0.0.0:*        LISTEN  1234/nginx
tcp    0       0       127.0.0.1:5432  0.0.0.0:*        LISTEN  5678/postgres
```

---

## ss vs netstat: Side-by-Side Comparison

| Feature | ss | netstat |
|---|---|---|
| Pre-installed (modern Linux) | ✅ Yes | ❌ Often missing |
| Speed | Faster (reads kernel directly) | Slower (reads /proc) |
| Active development | ✅ Yes | ❌ Deprecated |
| Output format | Slightly different | Familiar to most engineers |
| Equivalent command | `ss -tlnp` | `netstat -tlnp` |
| Socket filter | ✅ Rich filter syntax | Limited |
| State filter | ✅ `state established` | Basic |

**Short answer:** Use `ss`. If you are on a system where `netstat` is not installed and `ss` is, that is intentional — the distribution chose `ss` as the default. Learn `ss -tlnp` and use it everywhere.

---

## Real Troubleshooting Scenarios

### Scenario 1: "Address Already in Use" on Service Start

Service fails to start with `bind: address already in use`.

```bash
# Find what is using the port
ss -tlnp | grep :8080
# LISTEN  0  128  0.0.0.0:8080  0.0.0.0:*  users:(("oldapp",pid=9901,fd=8))

# Identify the process
ps -p 9901 -o pid,comm,user,stat

# Decide: kill it or reconfigure the new service to use a different port
kill -15 9901
```

### Scenario 2: Port Is Open But Service Is Unreachable

Nginx is listening on port 80. Browser gets "connection refused."

```bash
# Confirm nginx is actually listening
ss -tlnp | grep :80
# LISTEN  0  128  127.0.0.1:80  ...

# Found it — nginx is bound to localhost only
# External traffic cannot reach 127.0.0.1
```

Fix: change `listen 127.0.0.1:80` to `listen 0.0.0.0:80` in nginx.conf.

### Scenario 3: Unexpected Port Open on Server

Security scan flagged port 3306 open externally.

```bash
# Confirm it is listening
ss -tlnp | grep :3306
# LISTEN  0  151  0.0.0.0:3306  0.0.0.0:*  users:(("mysqld",pid=2341,fd=30))

# MySQL is bound to 0.0.0.0 — accessible from any interface
# Should be 127.0.0.1 only if no remote connections needed
```

Fix in `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```
bind-address = 127.0.0.1
```

### Scenario 4: Check All Services Listening on External Interfaces

Security audit: what is exposed to the network?

```bash
# Find everything NOT bound to localhost
ss -tlnp | grep -v '127.0.0.1' | grep -v '::1'

# Or more explicitly
ss -tlnp | grep 'LISTEN' | grep -E '0\.0\.0\.0|::'
```

### Scenario 5: Connection Count to a Service

How many clients are connected to nginx right now?

```bash
# Count established connections to port 80
ss -tnp state established dport :80 | wc -l

# See who is connected (source IPs)
ss -tnp state established dport :80 | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn
```

---

## lsof as an Alternative

`lsof -i` is another way to check open ports — particularly useful because it shows more process detail.

```bash
# All listening ports
lsof -i -sTCP:LISTEN

# Specific port
lsof -i :8080

# Specific protocol and port
lsof -i TCP:443

# All connections by a specific process
lsof -i -p 1234
```

`lsof -i` is slower than `ss` on systems with many open files but provides user, PID, command, and file descriptor in a single view.

---

## Quick Reference

```bash
# ── CHECK LISTENING PORTS ────────────────────────────────────────
ss -tlnp                          # TCP listening, with process
ss -ulnp                          # UDP listening, with process
ss -tlunp                         # TCP + UDP listening
netstat -tlnp                     # netstat equivalent

# ── SPECIFIC PORT ─────────────────────────────────────────────────
ss -tlnp | grep :8080             # is port 8080 open?
lsof -i :8080                     # alternative with more detail

# ── ACTIVE CONNECTIONS ────────────────────────────────────────────
ss -tnp state established         # all active TCP connections
ss -tnp dst 10.0.1.50            # connections to specific host
ss -tnp dport :443               # connections on port 443

# ── SUMMARY ──────────────────────────────────────────────────────
ss -s                             # socket counts by state

# ── SECURITY AUDIT ───────────────────────────────────────────────
ss -tlnp | grep -v 127.0.0.1    # what is exposed externally?
```

---

## Conclusion

`ss -tlnp` is the command. Learn it once, use it everywhere.

When a service will not start, when a port seems open but unreachable, when a security audit asks what is exposed — `ss -tlnp` gives you the answer in one line: what is listening, on which interface, and which process owns it.

The interface binding is the detail most engineers miss. **A port open on `0.0.0.0` is exposed to every network interface.** A port on `127.0.0.1` is localhost only. That distinction matters for both connectivity and security.

---

*Related reading: [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — combining ss with lsof and strace for full network debugging. [Linux Process States Explained](/blog/linux-process-states-guide) — what happens when a process is stuck and not accepting connections.*
