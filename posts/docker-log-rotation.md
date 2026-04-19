---
title: "Docker Ate My Disk: Fixing Log Rotation Before It Kills Production"
date: "2024-10-03"
excerpt: "How a single verbose container filled a 500GB disk in 72 hours, and the exact daemon.json config that stops it from ever happening again."
tags: ["docker", "logs", "infrastructure", "troubleshooting"]
featured: true
---

## 3am, Disk Full, Everything Down

The alert came in at 3:17am: disk utilization at 100%, multiple services failing. SSH into the host:

```bash
df -h
# Filesystem      Size  Used Avail Use% Mounted on
# /dev/sda1       500G  500G     0 100% /
```

Find the culprit:

```bash
du -sh /* 2>/dev/null | sort -rh | head -10
# 487G  /var
```

```bash
du -sh /var/* 2>/dev/null | sort -rh | head -5
# 487G  /var/lib/docker
```

```bash
du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -5
# 484G  /var/lib/docker/containers
```

There it was. Docker container logs — unrotated, unbounded, growing forever.

```bash
ls -lah /var/lib/docker/containers/a3f9b1c.../
# -rw-r----- 1 root root 484G Nov 3 03:17 a3f9b1c...-json.log
```

484 gigabytes. One log file. One container. 72 hours of verbose output with no rotation configured.

## The Emergency Fix

You can't just `rm` the file while Docker holds it open — the inode stays allocated. The right move:

```bash
# Truncate the file (Docker keeps the handle, disk space is freed immediately)
truncate -s 0 /var/lib/docker/containers/<container-id>/<container-id>-json.log
```

Services came back up within seconds. But this was a symptom, not the problem.

## Why This Happens

By default, Docker's `json-file` logging driver has **no size limit and no rotation**. Every byte your container writes to stdout/stderr goes into that file and stays there forever. On a verbose app, that's a disaster.

The dangerous default:

```json
{
  "log-driver": "json-file"
}
```

That's it. No `max-size`. No `max-file`. No expiry. Pure chaos at scale.

## The Permanent Fix: daemon.json

Edit `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5",
    "compress": "true"
  }
}
```

This sets a global default for **all containers** on the host:
- `max-size: 50m` — rotate when the log hits 50MB
- `max-file: 5` — keep 5 rotated files (250MB max total per container)
- `compress: true` — gzip rotated files to save space

Restart Docker to apply:

```bash
systemctl restart docker
```

> **Warning:** This restarts all running containers. Do this during a maintenance window or roll it out carefully.

## Per-Container Override in Compose

For containers that need different limits, set it per-service in `docker-compose.yml`:

```yaml
services:
  app:
    image: my-app:latest
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "10"
        compress: "true"

  debug-service:
    image: my-debug:latest
    logging:
      driver: json-file
      options:
        max-size: "200m"   # verbose in dev, generous limit
        max-file: "3"
```

## Monitoring Disk Usage by Container

Add this to your monitoring toolkit:

```bash
#!/bin/bash
# check-docker-logs.sh
# Alerts when any container log exceeds threshold

THRESHOLD_GB=5

find /var/lib/docker/containers -name '*-json.log' | while read logfile; do
  size_gb=$(du -BG "$logfile" | awk '{print $1}' | tr -d 'G')
  container_id=$(echo "$logfile" | cut -d'/' -f6 | cut -c1-12)
  
  if [ "$size_gb" -gt "$THRESHOLD_GB" ]; then
    echo "ALERT: Container $container_id log is ${size_gb}GB"
    docker inspect --format='{{.Name}}' "$container_id" 2>/dev/null
  fi
done
```

Run it from cron every 30 minutes until you have proper observability set up.

## Consider a Centralized Logging Driver

For production, `json-file` with rotation is a band-aid. The real solution is shipping logs somewhere:

```json
{
  "log-driver": "fluentd",
  "log-opts": {
    "fluentd-address": "localhost:24224",
    "fluentd-async": "true",
    "tag": "docker.{{.Name}}"
  }
}
```

Or use the `loki` driver if you're in the Grafana ecosystem. Central log aggregation means:
- No local disk pressure from logs
- Queryable log history across all containers
- Retention policies enforced centrally

## Quick Reference

| Problem | Fix |
|---|---|
| Log file too large right now | `truncate -s 0 /path/to/container.log` |
| Global log limits | Edit `/etc/docker/daemon.json` |
| Per-container limits | Use `logging:` block in compose |
| Ongoing monitoring | Script + cron or Prometheus node exporter |

Don't wait for 3am to learn this one.
