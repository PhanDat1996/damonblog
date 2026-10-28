---
title: "Docker Container Not Starting? Read the Exit Code First"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Docker container exits right away or keeps restarting? Decode the exit code, read the real error, and fix the common causes: PID 1, OOM, ports, perms."
tags: ["docker", "troubleshooting", "infrastructure", "debugging"]
featured: false
category: "devops"
---

You run `docker run -d myapp`, get a container ID back, and `docker ps` shows nothing. Or `docker ps` shows `Restarting (1) 4 seconds ago` forever. Docker started the container just fine. The process inside it died, and Docker is reporting what happened.

Two pieces of information explain almost every case: the **exit code** and the **last lines the process printed**. Get those first, then match them below.

---

## TL;DR

```bash
docker ps -a --filter name=myapp                     # status, e.g. "Exited (137) 2 minutes ago"

docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' myapp

docker logs --tail 50 myapp                          # works on stopped containers too

docker run -it --rm --entrypoint sh myimage          # get a shell in the image to debug
```

`State.Error` is easy to overlook. When Docker itself couldn't start the container (port conflict, missing mount source, bad entrypoint path), the reason is there, not in `docker logs`.

---

## Decode the exit code

| Exit code | Meaning | First thing to check |
|---|---|---|
| `0` | Main process finished successfully | It's not a long-running process (see "Exits immediately") |
| `1` | Application error | `docker logs` |
| `125` | `docker run` itself failed | The error printed by `docker run` (bad flag, port taken, daemon error) |
| `126` | Command found but not executable | Missing `+x` on the entrypoint script |
| `127` | Command not found | Typo in `CMD`/`ENTRYPOINT`, binary missing from image, wrong `PATH` |
| `137` | Killed by SIGKILL (128 + 9) | `OOMKilled` true? If not: `docker kill` or a stop timeout |
| `139` | Segfault (128 + 11) | Binary built for a different libc (glibc vs musl), native module crash |
| `143` | SIGTERM (128 + 15) | Normal on `docker stop`. If unexpected, something stopped it |

Codes above 128 mean "killed by signal (code − 128)". Code 137 is **not** automatically OOM. `docker stop` sends SIGTERM, waits 10 seconds, then sends SIGKILL, which also produces 137. Only `"OOMKilled": true` confirms the memory case.

---

## Read the actual error

```bash
docker logs --tail 50 myapp
docker logs -t --since 10m myapp        # with timestamps

# Compose
docker compose ps -a
docker compose logs --tail 50 web
```

The cause is usually in the last few lines. If `docker logs` is empty, the process died before writing anything (exec errors, missing binary), or the container uses a remote logging driver with Docker's local cache (dual logging) turned off. Then check `State.Error` and the daemon log:

```bash
journalctl -u docker --since "10 min ago" --no-pager
```

For a container in a restart loop, watch the lifecycle:

```bash
docker events --filter container=myapp
```

---

## Container exits immediately (exit 0 or 1)

A container lives exactly as long as its **PID 1**. When that process exits, the container stops, even if it started other processes in the background.

The classic broken entrypoint:

```bash
#!/bin/sh
./configure-app
./app-server &        # backgrounded...
# script ends here → PID 1 exits → container stops
```

Fix it by running the main process in the foreground with `exec`, so it **replaces** the shell as PID 1 and receives signals from `docker stop`:

```bash
#!/bin/sh
set -e
./configure-app
exec ./app-server
```

A few things that don't work:

- `CMD ["./start.sh && wait"]`: the exec form doesn't use a shell, so Docker looks for a file literally named `./start.sh && wait`.
- `CMD service nginx start`: init scripts daemonize and return. Run the program in the foreground instead (`nginx -g 'daemon off;'`).
- `tail -f /dev/null` to keep it alive: the container stays up, but the real app can die unnoticed and `docker stop` won't stop it cleanly.

---

## `exec format error` or `no such file or directory` for a file that exists

```
exec /usr/local/bin/entrypoint.sh: exec format error
exec /usr/local/bin/entrypoint.sh: no such file or directory
```

Three common causes:

1. **Wrong CPU architecture.** An `arm64` image (built on an Apple Silicon Mac) on an `amd64` server, or the reverse. Check with `docker image inspect -f '{{.Architecture}}' myimage` and build with `--platform linux/amd64`.
2. **Windows line endings in the script.** The shebang becomes `#!/bin/sh\r`, and `/bin/sh\r` doesn't exist. Fix with `sed -i 's/\r$//' entrypoint.sh` or `.gitattributes`.
3. **Missing interpreter.** `#!/bin/bash` in an Alpine image, which has only `/bin/sh` unless you install bash. Same for a dynamically linked binary copied into `scratch` or Alpine without the libraries it needs.

For `126` (permission denied), add `RUN chmod +x /usr/local/bin/entrypoint.sh` in the Dockerfile, or `COPY --chmod=755` with BuildKit.

---

## Exit 137 with OOMKilled: true

```bash
docker inspect -f '{{.State.OOMKilled}} {{.HostConfig.Memory}}' myapp
# true 536870912         ← killed at a 512 MiB limit

dmesg -T | grep -iE "killed process|oom" | tail -5
```

The kernel killed the process because the container hit its memory limit, or because the host itself ran out of memory. Options:

```bash
docker run -m 1g myimage
```

```yaml
# docker-compose.yml
services:
  app:
    image: myimage
    deploy:
      resources:
        limits:
          memory: 1g
```

Raise the limit only if the app legitimately needs more. Runtimes that size their heap from the host's RAM (older JVMs, Node with a large `--max-old-space-size`) can be told to respect the container limit, for example `-XX:MaxRAMPercentage=75` for Java. If usage only ever grows, it's a leak. See [Linux memory leak troubleshooting](/blog/linux-memory-leak-troubleshooting).

---

## Port is already allocated

```
docker: Error response from daemon: driver failed programming external connectivity on endpoint web:
Bind for 0.0.0.0:8080 failed: port is already allocated.
```

Something already holds host port 8080, either another container or a host process:

```bash
docker ps --filter publish=8080        # another container?
ss -ltnp 'sport = :8080'               # a host process?
```

Map a different host port (`-p 8081:8080`), or stop the other container. `docker rm -f old_container` deletes that container and anything written inside it that isn't on a volume, so prefer `docker stop old_container` unless you're sure. For host processes, see [port already in use](/blog/port-already-in-use-linux-fix).

---

## Permission denied on a mounted volume

```
PermissionError: [Errno 13] Permission denied: '/app/data/app.db'
```

The image runs as a non-root user (say UID 1000), but the host directory you bind-mounted belongs to root. Inside the container, permissions are checked by **numeric UID**, not by name:

```bash
docker run --rm myimage id                 # which UID does the app run as?
ls -ln ./data                              # numeric owner on the host
```

Fix it on the host for that one directory:

```bash
sudo chown -R 1000:1000 ./data             # match the container's UID
```

Or run the container as your own UID if the image supports it:

```bash
docker run --user "$(id -u):$(id -g)" -v "$PWD/data:/app/data" myimage
```

Avoid `chmod -R 777` on the host directory. It works, but it makes the data writable by every user on the host. On SELinux hosts (RHEL, Fedora), add `:z` to the mount (`-v ./data:/app/data:z`) so Docker relabels it. More on reading these errors: [Permission denied on Linux](/blog/permission-denied-linux-fix-chmod-chown).

---

## Missing configuration or environment

```
Error: DATABASE_URL is required
KeyError: 'SECRET_KEY'
```

```bash
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' myapp   # what it actually got
docker run --env-file .env myimage
```

Be careful pasting `docker inspect` output into tickets or chat. `Config.Env` contains every secret passed as an environment variable.

If the app starts but exits because it **can't reach its database**, it's a networking problem, not a config one. `localhost` inside a container is the container itself, not the host. See [Docker networking](/blog/docker-networking-guide).

---

## Debug inside the image

When logs aren't enough, start a shell in the same image with the same config, and run the entrypoint by hand:

```bash
docker run -it --rm --entrypoint sh \
  --env-file .env \
  -v "$PWD/data:/app/data" \
  myimage

# inside:
id
ls -la /app
cat /usr/local/bin/entrypoint.sh
/usr/local/bin/entrypoint.sh
```

Distroless and `scratch` images have no shell. Use `docker cp` to pull files out, or temporarily build a `-debug` variant of the image.

If the image itself seems wrong (files missing), check `.dockerignore` and rebuild without cache: `docker build --no-cache -t myimage .`.

---

## Checklist

1. `docker ps -a`: what's the exit code?
2. `docker inspect`: check `OOMKilled` and `State.Error`.
3. `docker logs --tail 50`: what did the process say last?
4. Exit 0/1: is PID 1 a foreground process started with `exec`?
5. 126/127/exec errors: architecture, CRLF, interpreter, `+x`.
6. Still stuck: `--entrypoint sh` and run the start command by hand.

---

## FAQ

**Why does my container keep restarting?**
A restart policy (`--restart always` / `unless-stopped`, or `restart:` in Compose) restarts it every time the process exits. The restart is not the problem. Read the exit code and `docker logs` of the last run, then fix why the process exits.

**How do I see logs of a container that already exited?**
`docker logs <name>` works on stopped containers until they're removed. Containers started with `--rm` are deleted on exit, so drop `--rm` while debugging.

**Exit code 137 but OOMKilled is false. What killed it?**
SIGKILL from somewhere else. Usually `docker stop` timed out because the app ignores SIGTERM (often a shell script as PID 1 without `exec`), or `docker kill` was used, or the host's OOM killer picked the process when the host itself ran out of memory.

---

*Related: [Docker log rotation](/blog/docker-log-rotation) so logs don't fill the disk while a container crash-loops. [Docker inspect container IP](/blog/docker-inspect-container-ip) for network-related startup failures.*
