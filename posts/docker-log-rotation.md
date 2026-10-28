---
title: "Docker Log Rotation: Stop Container Logs Filling the Disk"
date: "2024-10-03"
updated: "2026-10-28"
excerpt: "Docker logs filled your disk? Free space safely now, set max-size in daemon.json, and know why the change won't touch existing containers until recreated."
tags: ["docker", "logs", "infrastructure", "troubleshooting"]
featured: true
category: "devops"
---

The disk alert fires, services start failing writes, and `df -h` says `/` is at 100%. You follow the space down with `du` and end up in `/var/lib/docker/containers/<id>/`, at a single `<id>-json.log` file that's tens or hundreds of gigabytes.

That's Docker's default behavior. The `json-file` logging driver keeps **everything** a container writes to stdout/stderr, with no size limit. A chatty container (debug logging left on, a retry loop logging every failure) will eventually fill any disk.

This post covers the emergency fix, the permanent fix, and the gotcha that makes people think the permanent fix didn't work.

---

## Confirm it's container logs

```bash
df -h /var/lib/docker
sudo du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -h | tail -5
# 1.2G   /var/lib/docker/containers/9b1e.../9b1e...-json.log
# 87G    /var/lib/docker/containers/3f2a.../3f2a...-json.log
```

Map the ID to a container name:

```bash
docker ps -a --no-trunc --format '{{.ID}} {{.Names}}' | grep 3f2a
```

Or list every container's log path and size in one go:

```bash
docker ps -aq | xargs docker inspect -f '{{.Name}} {{.LogPath}}' \
  | while read name path; do printf '%s %s\n' "$(sudo du -h "$path" 2>/dev/null | cut -f1)" "$name"; done \
  | sort -h | tail
```

If the space is in `overlay2/` or `volumes/` instead, it isn't logs. Start with `docker system df` and the general [disk full cleanup guide](/blog/disk-full-linux-cleanup).

---

## Emergency: free the space now

**Don't `rm` the log file.** dockerd keeps it open, so deleting the name doesn't free the space. The blocks stay allocated until the container stops. (That "deleted but still open" trap is covered in [deleting large files safely](/blog/how-to-delete-large-files-linux-safely).)

Truncate it in place instead:

```bash
sudo truncate -s 0 /var/lib/docker/containers/<id>/<id>-json.log
```

> **Warning:** this permanently discards that container's log history. If you might need it for an incident, copy the tail first: `sudo tail -c 500M <file> > /root/<name>-last.log`.

Docker doesn't officially support editing these files, but truncation is the standard emergency move and space is freed immediately. Afterwards, `docker logs` may print a parse error for the first partial line. That's harmless.

Truncation buys time. The file starts growing again right away, so apply the permanent fix next.

---

## Permanent fix: limits in daemon.json

Edit (or create) `/etc/docker/daemon.json`:

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

- `max-size`: rotate when the active file reaches 50 MB.
- `max-file`: keep at most 5 files (active + rotated), so about 250 MB per container at most. Only takes effect when `max-size` is set.
- `compress`: gzip rotated files.

All `log-opts` values must be **strings**. `"max-file": 5` without quotes makes dockerd refuse to start. If `daemon.json` already exists, merge these keys into it rather than overwriting the file.

Validate before restarting (Docker 23.0+):

```bash
sudo dockerd --validate --config-file /etc/docker/daemon.json
# configuration OK
```

### daemon.json changes need a dockerd restart

`log-driver` and `log-opts` aren't reloadable settings, so `systemctl reload docker` won't apply them:

```bash
sudo systemctl restart docker
```

> **Warning:** restarting dockerd stops all running containers (containers with a restart policy come back afterwards) **unless** `"live-restore": true` is set in `daemon.json`. Plan a maintenance window, or enable `live-restore` first.

### The gotcha: existing containers are not affected

Log settings are copied into each container's config **when the container is created**. After restarting dockerd:

- **New containers** get the new limits.
- **Existing containers keep their old (unlimited) config**, even across `docker restart`.

Check what a container is actually using:

```bash
docker inspect -f '{{.HostConfig.LogConfig}}' mycontainer
# {json-file map[]}                                        ← old, unlimited
# {json-file map[compress:true max-file:5 max-size:50m]}   ← new
```

You have to **recreate** the container (`docker rm` + `docker run` with the same options, or let Compose do it) for the limits to apply. This is the main reason people report that "max-size doesn't work".

---

## Per-service limits in Compose

Set limits on the service itself, so they travel with the project and don't depend on each host's `daemon.json`:

```yaml
services:
  app:
    image: my-app:latest
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
        compress: "true"

  worker:
    image: my-worker:latest
    logging:
      driver: json-file
      options:
        max-size: "200m"
        max-file: "3"
```

```bash
docker compose up -d --force-recreate app worker
```

Plain `docker compose up -d` also recreates services whose configuration changed. `--force-recreate` makes sure they are recreated.

`docker run` equivalent:

```bash
docker run -d --log-opt max-size=50m --log-opt max-file=5 my-app:latest
```

---

## `json-file` vs `local`

| | `json-file` | `local` |
|---|---|---|
| Default rotation | **None** | 20 MB × 5 files, compressed |
| `docker logs` | Yes | Yes |
| Format on disk | One JSON object per line | Internal binary format |
| Tailing by log shippers (Filebeat, Promtail, Fluent Bit reading `/var/lib/docker/containers`) | Yes | No |

Docker's own docs recommend `local` for hosts where nothing reads the files directly. If a log agent tails the JSON files, stay on `json-file` and set `max-size`.

---

## Shipping logs off the host

Rotation caps disk use, but anything older than the last few files is gone. For production fleets, ship logs to central storage. There are two common patterns:

- **Agent tails the files** (Fluent Bit, Vector, Grafana Alloy, Filebeat reading `json-file`). This keeps `docker logs` working and doesn't affect container startup.
- **Remote logging driver** (`fluentd`, `gelf`, `syslog`, `awslogs`):

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

With a remote driver, `fluentd-async` matters. Without it, containers fail to start while the collector is down. Since Docker 20.10, "dual logging" keeps a local cache, so `docker logs` still works with remote drivers.

---

## Alert before the disk fills

Until central monitoring covers it, a cron script catches runaway logs early:

```bash
#!/bin/bash
# /usr/local/bin/docker-log-check.sh: run from root's cron every 15 minutes
THRESHOLD_MB=2048

docker ps -q | while read -r cid; do
  name=$(docker inspect -f '{{.Name}}' "$cid" | tr -d '/')
  path=$(docker inspect -f '{{.LogPath}}' "$cid")
  [ -f "$path" ] || continue
  size=$(du -m "$path" | cut -f1)
  if [ "$size" -gt "$THRESHOLD_MB" ]; then
    echo "ALERT: container $name log is ${size}MB ($path)"
  fi
done
```

A container that logs gigabytes per day is usually a bug (debug level in production, a tight retry loop). Fix the source too. [Linux log analysis](/blog/linux-log-analysis-guide) helps find out what it's repeating.

---

## Checklist

1. Find the big `*-json.log` and its container.
2. Emergency: `truncate -s 0` (after saving the tail if needed). Never `rm`.
3. Set `max-size`/`max-file` in `daemon.json` (quoted strings) or per service in Compose.
4. Restart dockerd (mind `live-restore`) for `daemon.json` changes.
5. **Recreate** existing containers, then verify with `docker inspect -f '{{.HostConfig.LogConfig}}'`.

---

## FAQ

**Does max-size apply to existing containers?**
No. Log options are fixed when a container is created. Recreate the container (not just restart it) after changing `daemon.json`. Compose services pick up their own `logging:` block when Compose recreates them.

**Is it safe to truncate a Docker container log?**
It's the standard emergency fix, and space is freed immediately. You lose that log history, and Docker doesn't officially support editing the file, so treat it as a one-off and set up rotation afterwards.

**Can I apply new log settings without restarting all containers?**
For `daemon.json` defaults, you need a dockerd restart (use `live-restore` to keep containers running) and then recreated containers. Per-container `--log-opt` or Compose `logging:` only needs that one container recreated.

---

*Related: [Check disk usage with du and df](/blog/check-disk-usage-linux-du-df) for tracking down space in general. [Docker container not starting](/blog/docker-container-not-starting-fix) when a crash-looping container is what's producing the logs.*
