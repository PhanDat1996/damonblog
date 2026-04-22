---
title: "systemctl Service Not Starting: Complete Fix Guide"
date: "2026-04-22"
excerpt: "Fix systemctl service not starting — diagnose failed units, read exit codes, resolve dependency errors, and fix the most common reasons a Linux service won't start."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "systemctl-service-not-starting-fix-linux"
---

Service won't start and `systemctl start myapp` returns no useful output. The error is always in the logs — you just need to know where to look.

---

## TL;DR

```bash
systemctl status myapp           # exit code and last log lines
journalctl -u myapp -n 50 --no-pager  # full logs
journalctl -u myapp -p err       # errors only
systemctl cat myapp              # view unit file
systemd-analyze verify /etc/systemd/system/myapp.service  # syntax check
```

---

## Step 1: Read the Status Output

```bash
systemctl status myapp
```

The `Active:` line tells you everything:

```
Active: failed (Result: exit-code)   → process exited non-zero
Active: failed (Result: signal)      → killed by signal (OOM, SIGKILL)
Active: failed (Result: start-limit-hit) → crashed too many times
Active: inactive (dead)              → stopped, not failed
Active: activating (start)           → stuck starting
```

The `code=` and `status=` at the bottom:

| Status | Meaning |
|---|---|
| `status=1/FAILURE` | App returned exit code 1 — check app logs |
| `status=2/INVALIDARGUMENT` | Wrong argument to systemd directive |
| `status=203/EXEC` | Binary not found or not executable |
| `status=217/USER` | Service user doesn't exist |
| `status=226/NAMESPACE` | Namespace/permission setup failed |
| `code=killed, signal=KILL` | OOM killer or manual `kill -9` |

---

## Step 2: Read Full Logs

`systemctl status` truncates. Get everything:

```bash
journalctl -u myapp -n 100 --no-pager

# Since last restart attempt
journalctl -u myapp --since "5 minutes ago" --no-pager

# Errors only
journalctl -u myapp -p err --since "today"
```

**Look for the line just BEFORE** `"Failed to start"` or `"Main process exited"` — that's the actual error.

---

## Fix by Exit Code

### status=203/EXEC — binary not found

```bash
# Check path in unit file
systemctl cat myapp | grep ExecStart

# Does the binary exist?
ls -la /opt/app/start.sh

# Is it executable?
chmod +x /opt/app/start.sh

# Is it a script with Windows line endings?
file /opt/app/start.sh
# "CRLF line terminators" = fix with:
sed -i 's/\r//' /opt/app/start.sh
```

### status=217/USER — service user missing

```bash
# Which user does the unit expect?
systemctl cat myapp | grep User

# Create missing user
useradd -r -s /bin/false appuser
```

### start-limit-hit — too many crashes

```bash
# Reset the counter
systemctl reset-failed myapp
systemctl start myapp

# Prevent future start-limit issues
# Add to [Service] section:
# StartLimitBurst=5
# StartLimitIntervalSec=60s
# RestartSec=5s
```

### exit-code — app crashes immediately

Test the command manually as the service user:

```bash
# Get the ExecStart command
systemctl cat myapp | grep ExecStart
# ExecStart=/opt/app/start.sh --config /etc/app/prod.conf

# Run it as the service user
runuser -u appuser -- /opt/app/start.sh --config /etc/app/prod.conf
# This shows the real error without systemd buffering it
```

---

## Common Fixes

### Missing environment variable

```bash
journalctl -u myapp | grep -iE "env|variable|not set|required"
# If found, add to unit file:
# [Service]
# Environment="DATABASE_URL=postgres://localhost/mydb"
# EnvironmentFile=/etc/myapp/env
```

### Port already in use

```bash
journalctl -u myapp | grep -i "address already in use\|bind\|EADDRINUSE"
ss -tlnp | grep :<port>
# Something else is on the port — kill it or change the port
```

### Permission denied on file or directory

```bash
journalctl -u myapp | grep -i "permission denied\|EACCES"
# Fix ownership
chown -R appuser:appuser /var/log/myapp /opt/app
chmod 755 /opt/app
```

### Dependency not ready

```bash
# Check what the service needs
systemctl list-dependencies myapp

# Is the dependency running?
systemctl status postgresql    # if myapp needs postgres
```

### Unit file error after edit

```bash
# ALWAYS run this after editing a unit file
systemctl daemon-reload
systemctl start myapp
```

---

## Full Diagnostic Script

```bash
#!/bin/bash
SERVICE=$1
echo "=== Status ==="
systemctl status $SERVICE --no-pager

echo -e "\n=== Last 30 log lines ==="
journalctl -u $SERVICE -n 30 --no-pager

echo -e "\n=== Errors only ==="
journalctl -u $SERVICE -p err --since "1 hour ago" --no-pager

echo -e "\n=== Unit file ==="
systemctl cat $SERVICE
```

---

## Common Mistakes

**Not running `daemon-reload` after editing unit files.** Changes are ignored until you reload.

**Testing as root when service runs as another user.** Root can read files the service user can't. Always test with `runuser -u <serviceuser>`.

**Killing the process PID when start-limit is hit.** Systemd already marked it failed. Use `systemctl reset-failed` first.

---

## Conclusion

The fix is always in the logs. `journalctl -u myapp -n 100 --no-pager` tells you what happened. The exit code in `systemctl status` narrows it down. Test the binary manually as the service user before debugging systemd configuration.

---

*Related: [systemctl Restart Service Not Working](/blog/systemctl-restart-service-not-working-fix) — when the service exists but restart fails. [journalctl Filter by Time Range](/blog/journalctl-filter-time-range-guide) — extract logs from the exact window when startup failed.*
