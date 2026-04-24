---
title: "Docker Container Not Starting: Fix Guide"
date: "2026-04-22"
excerpt: "Fix Docker container not starting — diagnose exit codes, read container logs, resolve port conflicts, permission errors, and OOM kills in production."
tags: ["docker", "troubleshooting", "infrastructure", "debugging"]
featured: false
slug: "docker-container-not-starting-fix"
category: "devops"
---

Container exits immediately. Container keeps restarting. `docker run` returns an error. Each symptom has a different cause — here's how to find and fix it.

---

## TL;DR

```bash
# See why it stopped
docker logs <container>
docker logs <container> --tail 50

# Inspect exit code
docker inspect <container> | jq '.[0].State'

# Run interactively to debug
docker run -it --rm imagename sh
```

---

## Read the Exit Code

```bash
docker inspect <container> | jq '.[0].State.ExitCode'
```

| Exit Code | Meaning |
|---|---|
| `0` | Exited cleanly (expected, if entrypoint finishes) |
| `1` | General error — check logs |
| `125` | Docker daemon error (run failed) |
| `126` | Command not executable (permission issue) |
| `127` | Command not found |
| `137` | OOM killed (128 + SIGKILL signal 9) |
| `139` | Segfault (128 + SIGSEGV signal 11) |
| `143` | Graceful SIGTERM (128 + 15) — expected on stop |

---

## Read Container Logs

```bash
# All logs
docker logs mycontainer

# Last 50 lines
docker logs mycontainer --tail 50

# Follow live
docker logs -f mycontainer

# With timestamps
docker logs -t mycontainer --tail 50
```

The error is almost always in the last few lines before exit.

---

## Fix: Container Exits Immediately

### CMD/Entrypoint finishes instantly

Docker stops the container when PID 1 exits. If your entrypoint script completes, the container stops.

```dockerfile
# WRONG: script runs and exits
CMD ["./start.sh"]

# In start.sh:
# #!/bin/bash
# configure_app
# start_app_in_background &
# (container exits here — nothing holds PID 1)

# FIX: keep a foreground process
CMD ["./app-binary"]           # foreground process
# or
CMD ["./start.sh && wait"]     # wait for background processes
# or in start.sh: exec <foreground-command> at the end
```

### Application crashes on startup

```bash
# Read the crash reason
docker logs mycontainer 2>&1 | tail -30

# Run interactively to debug
docker run -it --rm \
  -e DATABASE_URL=postgres://localhost/mydb \
  myimage sh

# Then run the start command manually inside the container
/app/start.sh
```

---

## Fix: Port Already in Use

```bash
docker run -p 8080:8080 myimage
# Error: Bind for 0.0.0.0:8080 failed: port is already allocated

# Find what's using host port 8080
ss -tlnp | grep :8080
# or for docker-specific conflicts:
docker ps | grep "0.0.0.0:8080"

# Kill the old container
docker rm -f old_container

# Or map to a different host port
docker run -p 8081:8080 myimage
```

---

## Fix: Exit Code 137 — OOM Kill

```bash
docker inspect mycontainer | jq '.[0].State'
# "ExitCode": 137, "OOMKilled": true

# Check system OOM logs
dmesg | grep -i "oom\|killed"

# Increase memory limit
docker run -m 2g myimage

# Or in docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       memory: 2g
```

---

## Fix: Permission Denied

```bash
docker logs mycontainer
# Permission denied: '/app/logs/app.log'
# or: cannot open '/etc/app/config': Permission denied

# Check file ownership
ls -la ./config/
# If files are owned by root but container runs as non-root user:

# Fix 1: change ownership
chown -R 1000:1000 ./config    # 1000 = typical app user UID

# Fix 2: set user in Dockerfile
USER root   # temporarily for setup, then switch back
RUN chown -R appuser /app
USER appuser

# Fix 3: run as root (not recommended for production)
docker run --user root myimage
```

---

## Fix: Missing Environment Variables

```bash
docker logs mycontainer
# Error: DATABASE_URL is required but not set
# or: KeyError: 'SECRET_KEY'

# Pass env vars
docker run -e DATABASE_URL=postgres://... -e SECRET_KEY=... myimage

# Better: use env file
docker run --env-file .env.production myimage

# In docker-compose.yml:
# environment:
#   - DATABASE_URL
# env_file:
#   - .env.production
```

---

## Fix: Image Build Issues

```bash
# Rebuild without cache
docker build --no-cache -t myimage .

# Check what's actually in the image
docker run -it --rm myimage sh
ls /app
cat /app/start.sh

# Check if required files are included
# (might be excluded by .dockerignore)
cat .dockerignore
```

---

## Debug: Run Interactively

The most effective debugging technique — bypass the entrypoint and get a shell:

```bash
# Override entrypoint
docker run -it --rm --entrypoint sh myimage

# With environment variables
docker run -it --rm \
  --entrypoint sh \
  -e DATABASE_URL=postgres://localhost/mydb \
  --network host \
  myimage

# Then test manually inside:
/app/start.sh         # run startup command
env | grep -i db      # check env vars are set
ping database-host    # test connectivity
```

---

## Common Mistakes

**Reading only `docker ps` status without checking logs.** `Exited (1)` tells you something failed. The logs tell you what.

**Not checking OOMKilled in inspect.** Exit code 137 looks like a crash but is actually the kernel killing the container for using too much memory. The fix is different (increase memory limit) than a real crash.

**Volume mount permissions.** When mounting host directories, the container user (often non-root) may not have write access.

```bash
# Fix volume permissions
docker run -v /host/data:/app/data:rw \
  --user $(id -u):$(id -g) \    # run as current user
  myimage
```

---

## Conclusion

Start with `docker logs <container>` and the exit code. Exit code 137 = OOM. Exit code 127 = binary not found. Exit code 1 = app error — read the logs. When stuck, `docker run -it --rm --entrypoint sh myimage` gets you inside to debug manually.

---

*Related: [Docker Log Rotation: Stop Disk Exhaustion](/blog/docker-log-rotation) — prevent log files from killing your containers. [Docker Networking Demystified](/blog/docker-networking-guide) — fix container connectivity issues.*
