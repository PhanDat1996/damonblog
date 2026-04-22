---
title: "Port Already in Use Linux: How to Find and Fix It"
date: "2026-04-22"
excerpt: "Fix 'port already in use' errors on Linux — find what process owns the port, kill it safely, handle TIME-WAIT sockets, and prevent the issue from recurring."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "port-already-in-use-linux-fix"
---

`bind: address already in use`. Service won't start. Something is holding the port. Here's every way to find it and fix it.

---

## TL;DR

```bash
# Find what's using port 8080
ss -tlnp | grep :8080

# Kill it
fuser -k -TERM 8080/tcp

# Or explicitly
kill -15 <pid>
```

---

## Find What's Using the Port

### Method 1: ss (fastest)

```bash
ss -tlnp | grep :8080
# LISTEN 0 128 0.0.0.0:8080 0.0.0.0:* users:(("node",pid=4521,fd=12))
```

The `pid=4521` is what you need.

### Method 2: lsof

```bash
lsof -i :8080
# COMMAND  PID     USER   FD   TYPE NODE NAME
# node    4521  appuser  12u  IPv4  TCP *:http-alt (LISTEN)
```

### Method 3: fuser

```bash
fuser 8080/tcp
# 4521   ← PID only
```

---

## Kill the Process

```bash
# Graceful (always try this first)
kill -15 4521

# Confirm it's gone
sleep 3 && ss -tlnp | grep :8080

# Force kill only if graceful didn't work
kill -9 4521
```

**One-liner with fuser:**

```bash
fuser -k -TERM 8080/tcp   # SIGTERM
fuser -k 8080/tcp         # SIGKILL (if still alive)
```

---

## If It's a systemd Service

Don't kill the PID — stop the service:

```bash
# Find which service owns the process
systemctl status $(ss -tlnp | grep ':8080' | grep -oP 'pid=\K[0-9]+' | head -1)

# Stop the service properly
systemctl stop myapp

# Now start your service
systemctl start newapp
```

Killing a PID when systemd manages it will cause an immediate restart.

---

## The TIME-WAIT Case

Sometimes nothing is listening on the port but you still get "address already in use":

```bash
ss -tlnp | grep :8080
# Empty — nothing listening

ss -tn state time-wait | grep :8080
# TIME-WAIT socket still exists
```

TIME-WAIT sockets linger for ~60 seconds after a connection closes. Most servers set `SO_REUSEADDR` so this shouldn't block binding — but if your app doesn't, you have two options:

```bash
# Option 1: wait 60 seconds and retry

# Option 2: enable SO_REUSEADDR in your app (app-level fix)

# Option 3: shrink TIME-WAIT duration (sysctl — use carefully)
sysctl net.ipv4.tcp_fin_timeout
# Default: 60
sudo sysctl -w net.ipv4.tcp_fin_timeout=30
```

---

## Real Examples

### New app won't start after deploy

```bash
ss -tlnp | grep :3000
# node  9901  ...  (old process still running)

# Kill old process
kill -15 9901
sleep 2

# Start new version
systemctl start myapp
```

### Two services configured to the same port

```bash
ss -tlnp | grep :80
# nginx: 1234
# apache2: 5678  ← both trying port 80

# Fix: change one to a different port, or remove one
systemctl stop apache2
systemctl disable apache2
```

### Docker container port conflict

```bash
docker run -p 8080:8080 myimage
# Error: Bind for 0.0.0.0:8080 failed: port is already allocated

# Find what Docker container has the port
docker ps | grep 8080
# or
ss -tlnp | grep :8080   # shows dockerd or the container process

# Stop the conflicting container
docker stop <container_name>
docker run -p 8080:8080 myimage
```

---

## Prevent It Recurring

### Use systemd socket activation

Instead of the app binding to the port directly, let systemd manage the socket:

```ini
# /etc/systemd/system/myapp.socket
[Socket]
ListenStream=8080
BindIPv6Only=both

[Install]
WantedBy=sockets.target
```

This way the port is held by systemd, and a restart of the app doesn't release and re-acquire it — eliminating the race condition window.

### Check on startup

```bash
# Add to your start script
if ss -tlnp | grep -q ':8080'; then
  echo "ERROR: port 8080 already in use"
  ss -tlnp | grep :8080
  exit 1
fi
```

---

## Common Mistakes

**Mistake 1: `kill -9` immediately**
SIGTERM first. SIGKILL doesn't let the process clean up — can leave temp files, locks, or corrupt state.

**Mistake 2: Killing a PID managed by systemd**
It respawns immediately. Use `systemctl stop`.

**Mistake 3: Confusing TIME-WAIT for a live listener**
`ss -tlnp` shows listeners only. If it's empty, check `ss -tn state time-wait`. Two completely different problems.

---

## Conclusion

`ss -tlnp | grep :<port>` → find the PID → `kill -15 <pid>` or `systemctl stop <service>`. If nothing shows but bind still fails, check for TIME-WAIT sockets. If systemd manages the service, always use `systemctl stop`, not `kill`.

---

*Related: [Linux Kill Process by Port](/blog/linux-kill-process-by-port) — all methods to kill by port. [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — full ss usage guide.*
