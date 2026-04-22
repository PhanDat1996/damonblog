---
title: "Linux Check Running Services with systemctl: Real Examples"
date: "2026-04-22"
excerpt: "Check running services in Linux using systemctl — list active units, find failed services, check service status, and filter by type with real command examples."
tags: ["linux", "infrastructure", "troubleshooting", "monitoring"]
featured: false
slug: "linux-check-running-services-systemctl"
---

You need to see which services are running, which have failed, or what's enabled at boot. `systemctl` is the tool for all of it on any modern Linux distribution.

---

## TL;DR

```bash
systemctl list-units --type=service --state=running   # all running services
systemctl list-units --type=service --state=failed    # failed services
systemctl status nginx                                 # status of one service
systemctl is-active nginx                             # quick boolean check
```

---

## List All Running Services

```bash
systemctl list-units --type=service --state=running
```

Output:

```
UNIT                     LOAD   ACTIVE SUB     DESCRIPTION
cron.service             loaded active running Regular background program processing daemon
docker.service           loaded active running Docker Application Container Engine
nginx.service            loaded active running A high performance web server
postgresql.service       loaded active running PostgreSQL Database Server
ssh.service              loaded active running OpenBSD Secure Shell server

LOAD   = Reflects whether the unit definition was properly loaded.
ACTIVE = The high-level unit activation state.
SUB    = The low-level unit activation state.
```

---

## List All Services (Any State)

```bash
systemctl list-units --type=service
```

This shows running, stopped, failed, and inactive services all at once. Useful for a full audit.

---

## Find Failed Services

```bash
# Failed services only
systemctl list-units --type=service --state=failed

# Short version
systemctl --failed
```

Output:

```
UNIT              LOAD   ACTIVE SUB    DESCRIPTION
myapp.service     loaded failed failed My Application

LOAD   = Reflects whether the unit definition was properly loaded.
ACTIVE = The high-level unit activation state.
SUB    = The low-level unit activation state.

1 loaded units listed.
```

One line with `failed` in the status means something needs your attention.

---

## Check a Specific Service

```bash
systemctl status nginx
```

```
● nginx.service - A high performance web server and a proxy server
   Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
   Active: active (running) since Mon 2026-04-20 09:15:02 UTC; 2 days ago
  Process: 1200 ExecStartPre=/usr/sbin/nginx -t (code=exited, status=0/SUCCESS)
 Main PID: 1234 (nginx)
    Tasks: 5 (limit: 4915)
   Memory: 12.4M
   CGroup: /system.slice/nginx.service
           ├─1234 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
           ├─1235 nginx: worker process
           └─1236 nginx: worker process

Apr 20 09:15:02 web01 systemd[1]: Starting A high performance web server...
Apr 20 09:15:02 web01 nginx[1200]: nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
Apr 20 09:15:02 web01 systemd[1]: Started A high performance web server.
```

Key fields:
- `Loaded` — is the unit file found? `enabled` = starts at boot
- `Active` — current state and how long it's been in that state
- `Main PID` — the master process PID
- Log lines at bottom — last few journal entries

---

## Quick Status Checks (For Scripts)

```bash
# Is the service active?
systemctl is-active nginx
# active (exit 0) or inactive (exit 1)

# Is it enabled at boot?
systemctl is-enabled nginx
# enabled, disabled, or static

# Is it failed?
systemctl is-failed nginx
# failed (exit 0) or active (exit 1) — note: reversed

# Use in a script
if systemctl is-active --quiet nginx; then
  echo "nginx is running"
fi
```

---

## Filter Services by State

```bash
# Active services
systemctl list-units --type=service --state=active

# Inactive (stopped but not failed)
systemctl list-units --type=service --state=inactive

# Services that failed
systemctl list-units --type=service --state=failed

# All enabled services (start at boot)
systemctl list-unit-files --type=service --state=enabled

# All disabled services
systemctl list-unit-files --type=service --state=disabled
```

---

## Real Examples

### Full service audit on a new server

```bash
echo "=== Running Services ==="
systemctl list-units --type=service --state=running --no-pager

echo "=== Failed Services ==="
systemctl --failed --no-pager

echo "=== Enabled at Boot ==="
systemctl list-unit-files --type=service --state=enabled --no-pager
```

### Find services listening on network ports

```bash
# Running services + their ports
systemctl list-units --type=service --state=running --no-pager | \
  awk '{print $1}' | grep '\.service$' | \
  while read svc; do
    pid=$(systemctl show -p MainPID --value "$svc" 2>/dev/null)
    [ "$pid" -gt 0 ] 2>/dev/null && \
      ss -tlnp | grep "pid=$pid" | awk -v s="$svc" '{print s": "$4}'
  done
```

### Disable unnecessary services (security hardening)

```bash
# Check what's enabled that you might not need
systemctl list-unit-files --type=service --state=enabled | grep -E "bluetooth|avahi|cups|rpcbind"

# Disable if not needed
systemctl disable --now bluetooth.service avahi-daemon.service
```

### Find which service owns a process

```bash
# Given a PID, find its service
systemctl status $(ps -p <pid> -o comm=)
# or
cat /proc/<pid>/cgroup | grep systemd
```

---

## Common Mistakes

**Mistake 1: Confusing `active` vs `enabled`**
- `active` = currently running right now
- `enabled` = will start at next boot
A service can be active but not enabled (won't survive reboot), or enabled but not active (failed to start).

**Mistake 2: Using `service` command on modern systems**
`service nginx status` still works but calls `systemctl` underneath. Use `systemctl` directly — it gives more detail and works consistently.

**Mistake 3: Missing `--no-pager` in scripts**
`systemctl list-units` pipes through `less` by default. In scripts, always add `--no-pager`:

```bash
systemctl list-units --type=service --no-pager | grep nginx
```

**Mistake 4: Not checking `list-unit-files` vs `list-units`**
`list-units` shows loaded units (currently in memory). `list-unit-files` shows all available unit files. A service can exist on disk but not be loaded.

---

## Pro Tips

```bash
# Show service start time (sort by slowest to start)
systemd-analyze blame | head -20

# Show service dependencies
systemctl list-dependencies nginx

# Follow service log live
journalctl -fu nginx

# Reload without restart (for nginx, PostgreSQL, etc.)
systemctl reload nginx

# Check if a unit file has errors
systemd-analyze verify /etc/systemd/system/myapp.service

# List all timers (scheduled tasks)
systemctl list-timers --all
```

---

## Conclusion

`systemctl list-units --type=service --state=running` and `systemctl --failed` are the two commands to run first when auditing a server. For individual services, `systemctl status` gives you state, logs, and PID in one view. In scripts, `systemctl is-active --quiet` is the clean boolean check.

---

*Related: [systemctl Restart Service Not Working: Fix Guide](/blog/systemctl-restart-service-not-working-fix) — when a service shows failed and restart doesn't help. [journalctl Filter by Time Range](/blog/journalctl-filter-time-range-guide) — get detailed logs from a specific service.*
