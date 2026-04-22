---
title: "Linux Kill Process by Port: Step-by-Step Guide"
date: "2026-04-22"
excerpt: "Kill a process by port number on Linux — using fuser, lsof, ss + kill, and pkill. Step-by-step with real examples for each method."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
slug: "linux-kill-process-by-port"
---

# Linux Kill Process by Port: Step-by-Step Guide

Port is occupied and something won't start. You need to find what's using it and kill it. Here's every reliable way to do that.

---

## TL;DR

```bash
# Method 1 — fastest
fuser -k 8080/tcp

# Method 2 — explicit, see what you're killing first
ss -tlnp | grep :8080                    # find the PID
kill -15 <pid>                           # graceful stop

# Method 3 — lsof
lsof -ti :8080 | xargs kill -15
```

---

## Method 1: fuser (Fastest)

`fuser` finds and optionally kills the process using a file or socket.

```bash
# Show PID using port 8080
fuser 8080/tcp

# Kill it immediately (sends SIGKILL)
fuser -k 8080/tcp

# Kill gracefully (SIGTERM first)
fuser -k -TERM 8080/tcp
```

One command, done. The downside: no preview — it kills without confirmation. In production, always check first.

---

## Method 2: ss + kill (Recommended for Production)

See what you're killing before killing it.

```bash
# Step 1: find the PID
ss -tlnp | grep :8080

# Output:
# LISTEN 0 128 0.0.0.0:8080 0.0.0.0:* users:(("node",pid=4521,fd=12))

# Step 2: check the process
ps -p 4521 -o pid,comm,user,stat,etime

# Step 3: send SIGTERM (graceful shutdown)
kill -15 4521

# Step 4: confirm port is free
sleep 3 && ss -tlnp | grep :8080
```

If the process doesn't die after 5 seconds:

```bash
kill -9 4521
```

Use `-9` (SIGKILL) as a last resort. It doesn't allow cleanup — databases can leave corrupt files or stale lock files.

---

## Method 3: lsof + xargs

```bash
# Find PID
lsof -i :8080

# Output:
# COMMAND  PID     USER   FD   TYPE  NODE NAME
# node    4521  appuser  12u  IPv4  TCP *:http-alt (LISTEN)

# Kill inline
lsof -ti :8080 | xargs kill -15

# Force kill if needed
lsof -ti :8080 | xargs kill -9
```

The `-t` flag makes `lsof` output PID-only, which pipes cleanly into `xargs`.

---

## Method 4: pkill by Port (via Process Name)

If you know the process name:

```bash
pkill -f "node server.js"
pkill -TERM nginx
```

This doesn't search by port directly — use it when you know the app name and want to kill all instances.

---

## Real Examples

### Kill whatever is blocking port 3000

```bash
fuser -k -TERM 3000/tcp
# If still alive after 3s:
fuser -k 3000/tcp
```

### Kill a stuck Nginx that won't reload

```bash
ss -tlnp | grep :80
# users:(("nginx",pid=1234,fd=6))

# Graceful shutdown
kill -QUIT 1234     # nginx-specific graceful stop
# or
nginx -s quit

# Force if needed
kill -9 1234
systemctl restart nginx
```

### Multiple processes on the same port (rare but happens)

```bash
lsof -ti :8080 | xargs kill -15
# Kills all PIDs using that port at once
```

### Kill process on a UDP port

```bash
fuser -k 53/udp   # kill whatever's on UDP port 53
```

---

## Output Explanation

When you run `ss -tlnp | grep :8080`:

```
LISTEN 0 128 0.0.0.0:8080 0.0.0.0:* users:(("node",pid=4521,fd=12))
                                               ^cmd   ^pid    ^fd
```

- `pid=4521` — this is what you pass to `kill`
- `fd=12` — file descriptor number inside the process
- `"node"` — the command name (may be truncated for long paths)

---

## Common Mistakes

**Mistake 1: Using `kill -9` immediately**
Always try `kill -15` first. SIGTERM lets the process flush buffers, close connections, and release locks. SIGKILL (`-9`) skips all that.

**Mistake 2: Killing a process that gets respawned**
If a process is managed by systemd, killing the PID doesn't stop the service — systemd restarts it immediately.

```bash
# Wrong approach
kill -9 $(lsof -ti :8080)   # systemd restarts it in <1s

# Right approach
systemctl stop myapp         # stops the unit, doesn't respawn
```

**Mistake 3: Port still in use after kill**
`TIME_WAIT` sockets keep the port "occupied" for 60 seconds after a connection closes. The port isn't actually blocked — new binds work fine with `SO_REUSEADDR` (which most servers set by default).

```bash
# If you see TIME-WAIT but can't bind:
ss -tn state time-wait | grep :8080
# Usually fine to ignore — will clear in 60s
```

**Mistake 4: Wrong port format with fuser**
```bash
fuser 8080         # WRONG — checks file, not port
fuser 8080/tcp     # CORRECT
fuser 8080/udp     # for UDP
```

---

## Pro Tips

```bash
# Find and kill in one line, safely
kill -15 $(ss -tlnp | grep ':8080' | awk '{print $6}' | grep -oP 'pid=\K[0-9]+')

# Check what will be killed before doing it
lsof -i :8080

# Kill all processes on a port range
for port in 8080 8081 8082; do fuser -k -TERM $port/tcp; done

# Verify port is fully free (wait for TIME-WAIT to clear)
while ss -tlnp | grep -q :8080; do sleep 1; done && echo "port free"
```

---

## Conclusion

For quick one-liners: `fuser -k -TERM 8080/tcp`. For production where you want to see what you're killing: `ss -tlnp | grep :8080` then `kill -15 <pid>`. Always check if the process is managed by systemd before killing — `systemctl stop` is the right tool in that case.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — full port inspection guide. [Linux Process States Explained](/blog/linux-process-states-guide) — understand what happens to a process after you send a signal.*
