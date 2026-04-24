---
title: "Too Many Open Files Linux: Fix Guide"
date: "2026-04-22"
excerpt: "Fix 'too many open files' errors on Linux — increase file descriptor limits for processes and system-wide, diagnose FD leaks, and configure permanent limits for production services."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "too-many-open-files-linux-fix"
category: "linux"
---

`Too many open files`. `EMFILE`. `Error 24`. Service starts throwing errors or refuses new connections. Here's how to diagnose and fix it — temporarily and permanently.

---

## TL;DR

```bash
# Check current limits for a process
cat /proc/<pid>/limits | grep "open files"

# Check how many FDs a process has open
ls /proc/<pid>/fd | wc -l

# Increase system-wide soft limit temporarily
ulimit -n 65535

# Permanent fix in /etc/security/limits.conf
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf
```

---

## Understand the Limits

There are two layers of file descriptor limits:

**1. Per-process limit** — how many FDs one process can have open
```bash
# Soft limit (enforced, can be raised up to hard limit by the process)
# Hard limit (ceiling, only root can raise)
ulimit -Sn   # soft limit for current shell
ulimit -Hn   # hard limit for current shell
cat /proc/<pid>/limits | grep "open files"
```

**2. System-wide limit** — total FDs across all processes
```bash
cat /proc/sys/fs/file-max          # total system limit
cat /proc/sys/fs/file-nr           # current open / available / max
```

The error almost always comes from the per-process limit (default 1024), not the system-wide limit.

---

## Diagnose: Is it a Leak or Just High Load?

```bash
# Count FDs for a specific process
ls /proc/<pid>/fd | wc -l

# Watch if it grows over time
watch -n 5 'ls /proc/<pid>/fd | wc -l'
```

- **Stable high count** — the application has many legitimate connections (websocket server, database with many connections). Increase the limit.
- **Growing count** — file descriptor leak. The app opens files/sockets but never closes them. Increasing the limit only delays the problem.

```bash
# See what types of FDs are leaking
ls -la /proc/<pid>/fd | awk '{print $NF}' | grep -oE '\w+$' | sort | uniq -c | sort -rn

# Most common types:
# socket:[12345]  = network connections
# /var/log/...    = log files being opened but not closed
# pipe:[12345]    = pipes
```

---

## Fix: Temporary (Current Session)

```bash
ulimit -n 65535
# Takes effect immediately for the current shell and its children
# Lost on logout/reboot
```

---

## Fix: Permanent — System-wide (limits.conf)

```bash
# /etc/security/limits.conf
# Format: <domain> <type> <item> <value>

# For a specific user
echo "appuser soft nofile 65535" >> /etc/security/limits.conf
echo "appuser hard nofile 65535" >> /etc/security/limits.conf

# For all users (wildcard)
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf

# For root specifically (wildcard * doesn't always cover root)
echo "root soft nofile 65535" >> /etc/security/limits.conf
echo "root hard nofile 65535" >> /etc/security/limits.conf
```

**Requires logout and re-login** to take effect for existing sessions. Services need a restart.

---

## Fix: systemd Services

For services managed by systemd, `limits.conf` often doesn't apply. Use the unit file instead:

```bash
# Option 1: edit the unit file directly
systemctl edit myapp    # creates override file

# Add to [Service] section:
[Service]
LimitNOFILE=65535
```

Or create the override file manually:

```bash
mkdir -p /etc/systemd/system/myapp.service.d/
cat > /etc/systemd/system/myapp.service.d/limits.conf << EOF
[Service]
LimitNOFILE=65535
EOF

systemctl daemon-reload
systemctl restart myapp

# Verify it applied
cat /proc/$(pgrep -x myapp | head -1)/limits | grep "open files"
```

---

## Fix: Nginx

```nginx
# /etc/nginx/nginx.conf
worker_processes auto;
worker_rlimit_nofile 65535;   # ← add this

events {
    worker_connections 4096;
}
```

```bash
nginx -t && systemctl reload nginx
```

---

## Fix: System-Wide fs.file-max

If the system-wide limit is the problem (rare on modern systems):

```bash
# Temporary
echo 2097152 > /proc/sys/fs/file-max

# Permanent
echo "fs.file-max = 2097152" >> /etc/sysctl.conf
sysctl -p
```

---

## Real Examples

### Node.js app: EMFILE on heavy load

```bash
# Check current limit
cat /proc/$(pgrep -x node)/limits | grep "open files"
# Max open files            1024                 1024

# Check current usage
ls /proc/$(pgrep -x node)/fd | wc -l
# 1019  ← approaching limit!

# Fix for systemd service
systemctl edit myapp
# Add:
# [Service]
# LimitNOFILE=65535

systemctl daemon-reload && systemctl restart myapp
```

### PostgreSQL: "could not open file"

```bash
# Default PostgreSQL limit is too low for max_connections > 200
# Each connection uses ~3 FDs

# Calculate needed limit
# max_connections * 3 + overhead (200 * 3 + 500 = 1100 minimum)
# Set to 65535 to be safe

# /etc/systemd/system/postgresql.service.d/limits.conf
[Service]
LimitNOFILE=65535
```

### File descriptor leak investigation

```bash
# App has been running 2 hours, FD count keeps growing
PID=4521

# Snapshot of open FDs
ls -la /proc/$PID/fd > /tmp/fds_before.txt
sleep 300
ls -la /proc/$PID/fd > /tmp/fds_after.txt

# What new FDs appeared?
diff /tmp/fds_before.txt /tmp/fds_after.txt | grep "^>"
# > lrwxrwxrwx ... /var/log/app/request.log
# > socket:[12345]
# → log files are being opened but never closed
```

---

## Common Mistakes

**Setting `ulimit` in the shell and wondering why the service isn't affected.** The service doesn't inherit the shell's ulimit — it has its own limit set at start time. Use the systemd unit file or `/etc/security/limits.conf` and restart.

**Only setting the soft limit.** The process can only raise its own FD limit up to the hard limit. If the hard limit is still 1024, the soft limit increase is useless once the app tries to raise it dynamically.

**Increasing limits instead of fixing a FD leak.** If the FD count grows without bound, increasing the limit buys time but the service will eventually hit the new limit too. Fix the leak.

**Not running `daemon-reload` after changing a systemd override.** New limits don't apply without reload + restart.

---

## Conclusion

Check the per-process limit first (`/proc/<pid>/limits`), then current usage (`ls /proc/<pid>/fd | wc -l`). For systemd services: add `LimitNOFILE=65535` to the unit override. For non-systemd: use `/etc/security/limits.conf`. If the count is growing, fix the FD leak — don't just raise the ceiling.

---

*Related: [strace, lsof, and ss: The Trio That Solves Every Mystery](/blog/strace-lsof-ss-debugging) — `lsof -p <pid>` shows exactly which files are open. [Linux Check Running Services with systemctl](/blog/linux-check-running-services-systemctl) — check service health after applying limits.*
