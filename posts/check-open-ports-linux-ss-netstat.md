---
title: "How to Check Open Ports in Linux: ss vs netstat"
date: "2026-04-22"
excerpt: "Check open ports in Linux using ss and netstat — with real command examples, output explanation, and when to use each tool in production troubleshooting."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "check-open-ports-linux-ss-netstat-guide"
category: "linux"
---

# How to Check Open Ports in Linux: ss vs netstat (With Real Examples)

If a service isn't reachable or you need to audit what's exposed on a server, checking open ports is step one. Both `ss` and `netstat` do the job — but `ss` is faster, more accurate, and pre-installed on every modern Linux system.

---

## TL;DR

```bash
ss -tlnp        # TCP listening ports with process names (use this first)
ss -ulnp        # UDP listening ports
netstat -tlnp   # same output, older syntax
```

---

## ss vs netstat: Which One to Use

`netstat` comes from the deprecated `net-tools` package. On minimal installs (Docker containers, cloud images) it's often missing. `ss` reads directly from the kernel socket layer — it's faster and always available.

| Feature | ss | netstat |
|---|---|---|
| Pre-installed | ✅ Always | ❌ Often missing |
| Speed | Fast | Slower |
| Actively maintained | ✅ | ❌ Deprecated |
| Same basic flags | ✅ | ✅ |

Use `ss`. Learn `netstat` for legacy systems you don't control.

---

## Check All Open TCP Ports

```bash
ss -tlnp
```

Flags:
- `-t` — TCP only
- `-l` — listening sockets only
- `-n` — show port numbers, not service names
- `-p` — show process name and PID

Output:

```
State    Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN   0       128     0.0.0.0:22          0.0.0.0:*          users:(("sshd",pid=1023,fd=3))
LISTEN   0       511     0.0.0.0:80          0.0.0.0:*          users:(("nginx",pid=2341,fd=6))
LISTEN   0       128     127.0.0.1:5432      0.0.0.0:*          users:(("postgres",pid=3012,fd=4))
```

---

## Reading the Output

The `Local Address:Port` column is what matters:

- `0.0.0.0:80` — listening on all interfaces, reachable from anywhere
- `127.0.0.1:5432` — localhost only, not externally accessible
- `[::]:22` — all IPv6 interfaces

**This distinction matters for security.** A database bound to `0.0.0.0` instead of `127.0.0.1` is exposed to every network interface.

---

## Real Examples

### Check if a specific port is open

```bash
ss -tlnp | grep :8080

# Nothing returned = nothing listening on 8080
# Output returned = something is bound to that port
```

### Check both TCP and UDP

```bash
ss -tlunp
# -u adds UDP sockets
```

### Check with netstat (if ss is unavailable)

```bash
netstat -tlnp
netstat -tlnp | grep :3306    # is MySQL exposed?
```

### Check active connections (not just listeners)

```bash
ss -tnp state established
# Shows who is currently connected, not just what's listening
```

### Count connections to a port

```bash
ss -tnp state established dport :443 | wc -l
```

### Security audit — what's exposed externally?

```bash
# Everything NOT bound to localhost
ss -tlnp | grep -v '127\.0\.0\.1' | grep -v '\[::1\]'
```

---

## Output Explanation: What Each Column Means

```
State      = socket state (LISTEN, ESTABLISHED, TIME-WAIT)
Recv-Q     = bytes received but not yet read by the app
Send-Q     = bytes queued to send (high = slow consumer or congestion)
Local Address:Port   = what this machine is listening on
Peer Address:Port    = remote side (0.0.0.0:* = any remote)
Process    = pid and command name
```

**Recv-Q > 0 on a LISTEN socket** means the accept backlog is filling up — your app is slower than incoming connections. That's a problem.

---

## Real-World Use Case: "Address Already in Use"

Service fails to start with `bind: address already in use`.

```bash
# Find what's holding the port
ss -tlnp | grep :8080
# Output: users:(("oldapp",pid=9901,fd=8))

# Check if it should be running
ps -p 9901 -o comm,stat

# Kill it if it's stale
kill -15 9901

# Confirm port is free
ss -tlnp | grep :8080
# No output = port is available
```

---

## Common Mistakes

**Mistake 1: Using `netstat` on a minimal container**
It's not installed. Use `ss` — it's always there.

**Mistake 2: Assuming a listening port means it's reachable**
The service could be bound to `127.0.0.1`. Check the local address column before assuming firewall issues.

**Mistake 3: Not using `-n`**
Without `-n`, `ss` tries to resolve port numbers to service names (`http`, `ssh`). That's slower and hides the actual port number when troubleshooting non-standard ports.

**Mistake 4: Forgetting `-p` needs root for process names**
```bash
sudo ss -tlnp    # shows process names for all sockets
ss -tlnp         # may show (null) for sockets owned by other users
```

---

## Pro Tips

```bash
# Watch port connections in real time
watch -n 1 'ss -tlnp | grep :80'

# Find what port a PID is using
ss -tlnp | grep pid=1234

# Socket summary (total counts by state)
ss -s

# Check TIME-WAIT buildup (causes 502s under load)
ss -tn state time-wait | wc -l

# Show sockets with extended info (timers, etc.)
ss -tnoe
```

---

## Conclusion

`ss -tlnp` is the command. Use it every time. It tells you what's listening, on which interface, and which process owns it — in one line.

The interface binding (`0.0.0.0` vs `127.0.0.1`) is the detail that catches most engineers off guard. A port being open doesn't mean it's accessible remotely. Check the local address column.

---

*Also useful: [Check Running Processes in Linux](/blog/check-running-process-linux-guide) — pair port checks with process investigation. [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — deeper socket-level debugging.*
