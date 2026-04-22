---
title: "systemctl Restart Service Not Working: Fix Guide"
date: "2026-04-22"
excerpt: "Fix systemctl restart not working — diagnose failed units, read journal logs, handle dependency failures, and resolve the most common systemd service restart failures."
tags: ["linux", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "systemctl-restart-service-not-working-fix"
---

`systemctl restart myapp` returns no error but the service stays dead, or keeps crashing, or the command itself fails. Here's the diagnostic path to find and fix it.

---

## TL;DR

```bash
# Step 1: what's the actual state?
systemctl status myapp

# Step 2: what did it log?
journalctl -u myapp -n 50 --no-pager

# Step 3: why did it fail?
journalctl -u myapp --since "5 minutes ago" -p err

# Step 4: check dependencies
systemctl list-dependencies myapp
```

---

## Step 1: Read the Status Output Carefully

```bash
systemctl status myapp
```

Example output for a failed service:

```
● myapp.service - My Application
   Loaded: loaded (/etc/systemd/system/myapp.service; enabled)
   Active: failed (Result: exit-code) since Mon 2026-04-20 14:22:03 UTC
  Process: 4521 ExecStart=/opt/app/start.sh (code=exited, status=1/FAILURE)
 Main PID: 4521 (code=exited, status=1/FAILURE)

Apr 20 14:22:03 server01 systemd[1]: myapp.service: Main process exited, code=exited, status=1/FAILURE
Apr 20 14:22:03 server01 systemd[1]: myapp.service: Failed with result 'exit-code'.
Apr 20 14:22:03 server01 systemd[1]: Failed to start My Application.
```

**Key fields:**

| Field | What it means |
|---|---|
| `Active: failed (Result: exit-code)` | Process exited with non-zero status |
| `Active: failed (Result: signal)` | Process was killed by a signal (OOM, SIGKILL) |
| `Active: activating (auto-restart)` | Systemd is restarting it in a loop |
| `status=1/FAILURE` | Exit code from the process |
| `code=killed, signal=KILL` | OOM killer or manual kill -9 |

---

## Step 2: Read the Full Journal

Status output is truncated. Get the full story:

```bash
# Last 50 lines
journalctl -u myapp -n 50 --no-pager

# Since last restart attempt
journalctl -u myapp --since "5 minutes ago" --no-pager

# Errors only
journalctl -u myapp -p err --since "today"

# From a previous boot (if service crashed and caused a reboot)
journalctl -b -1 -u myapp | tail -50
```

---

## Common Failure Patterns and Fixes

### Pattern 1: Service starts then immediately exits

```
Active: failed (Result: exit-code)
```

The process started but exited with an error. The exit code tells you where to look:

```bash
journalctl -u myapp -n 30 --no-pager
# Look for application-level error messages before the systemd "Failed" line
```

Common causes:
- Missing config file
- Wrong permissions on files the app needs
- Port already in use
- Missing environment variable

```bash
# Test manually with same user as the service
runuser -u appuser -- /opt/app/start.sh
# This shows the real error without systemd interference
```

### Pattern 2: Start limit hit — systemd stops trying

```
Active: failed (Result: start-limit-hit)
```

The service crashed and restarted too many times. Systemd backs off.

```bash
# Reset the failure counter to allow restarting
systemctl reset-failed myapp
systemctl start myapp
```

To prevent this in production, tune the restart limits in the unit file:

```ini
[Service]
Restart=on-failure
RestartSec=5s
StartLimitBurst=5          # allow 5 restarts
StartLimitIntervalSec=60s  # within 60 seconds
```

### Pattern 3: Signal kill — OOM or external kill

```
Active: failed (Result: signal)
code=killed, signal=KILL
```

Check if OOM killer was responsible:

```bash
journalctl -k --since "1 hour ago" | grep -i "oom\|killed"
dmesg | grep -i "oom\|killed process" | tail -10
```

If OOM: the service doesn't have enough memory. Increase memory limits or reduce the service's memory usage.

```ini
# Unit file — set memory limit to prevent OOM kill
[Service]
MemoryMax=2G
MemoryHigh=1.5G
```

### Pattern 4: Dependency failed

```
Active: inactive (dead)
Condition: start condition failed
```

A required service or condition wasn't met:

```bash
# Check what dependencies are needed
systemctl list-dependencies myapp

# Check which dependencies are failing
systemctl status $(systemctl list-dependencies myapp --plain | head -5)
```

Example: service requires a network mount that isn't ready:

```ini
[Unit]
After=network-online.target mnt-data.mount
Requires=mnt-data.mount
```

### Pattern 5: Unit file syntax error

```
Failed to load configuration: Invalid argument
```

```bash
# Validate unit file syntax
systemd-analyze verify /etc/systemd/system/myapp.service

# After editing unit file, always reload daemon
systemctl daemon-reload
systemctl restart myapp
```

**Forgetting `daemon-reload` after editing a unit file is the most common mistake.** systemd caches unit files — changes don't take effect until you reload.

### Pattern 6: Permission or file not found

```
code=exited, status=203/EXEC
```

Status 203 means the ExecStart binary couldn't be executed:

```bash
# Check the path in the unit file
systemctl cat myapp | grep ExecStart

# Verify it exists and is executable
ls -la /opt/app/start.sh
# Check it's not a script with wrong line endings (Windows CRLF)
file /opt/app/start.sh
```

---

## Full Diagnostic Workflow

```bash
# 1. Get current state
systemctl status myapp

# 2. Get logs with context
journalctl -u myapp -n 100 --no-pager

# 3. Test the command directly
systemctl cat myapp | grep ExecStart
# Run that command manually as the service user

# 4. Check for start-limit issues
systemctl is-failed myapp
systemctl reset-failed myapp

# 5. After any unit file change
systemctl daemon-reload

# 6. Restart and watch
systemctl restart myapp && journalctl -fu myapp
```

---

## Common Mistakes

**Mistake 1: Not running `daemon-reload` after editing the unit file**
Changes to `/etc/systemd/system/myapp.service` have zero effect until you reload.

```bash
systemctl daemon-reload    # always do this after editing unit files
```

**Mistake 2: Looking at truncated status output**
`systemctl status` shows ~10 lines. The real error is usually in `journalctl`.

**Mistake 3: `systemctl restart` on a failed service without resetting limits**
If it hit `StartLimitBurst`, restart will be silently ignored. Always check for `start-limit-hit`.

**Mistake 4: Testing as root when service runs as another user**
A script might work as root but fail for `appuser` due to file permissions.

```bash
# Test as the actual service user
runuser -u appuser -- /opt/app/start.sh
```

---

## Pro Tips

```bash
# Watch service status live while troubleshooting
journalctl -fu myapp

# Check all failed units at once
systemctl --failed

# See the full unit file including overrides
systemctl cat myapp

# Override specific settings without editing the unit file
systemctl edit myapp
# Creates /etc/systemd/system/myapp.service.d/override.conf

# Check what the service is actually doing right now
systemctl status myapp --full
```

---

## Conclusion

When `systemctl restart` doesn't work: check status for the failure reason, get the full journal log, run the command manually as the service user, and remember `daemon-reload` after any unit file change. `start-limit-hit` is the silent blocker that catches most people — `systemctl reset-failed` clears it.

---

*Related: [Linux Log Analysis: Debug Issues Like a Senior Engineer](/blog/linux-log-analysis-debugging-guide) — journalctl deep dive for log investigation. [Linux Process States Explained](/blog/linux-process-states-guide) — understanding what happens to a process after systemd sends a signal.*
