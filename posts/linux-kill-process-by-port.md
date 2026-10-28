---
title: "Linux Kill Process by Port: fuser, ss and lsof Safely"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Kill whatever is listening on a port in one command, without also killing clients connected to it. fuser, ss and lsof versions, and when to use systemctl."
tags: ["linux", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

You need port 8080 back, now. The fastest answer:

```bash
sudo fuser -k -TERM 8080/tcp
```

That sends SIGTERM to every process using local TCP port 8080. It works, but it kills blind. Below are the safer versions, and the two cases where killing by port is the wrong move.

---

## Before you kill: is it a service?

```bash
PID=$(sudo ss -Htlnp 'sport = :8080' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
systemctl status "$PID"
```

If that shows a unit (`nginx.service`, `myapp.service`), use `sudo systemctl stop <unit>`. Killing the PID of a unit with `Restart=always` just makes systemd start it again, and the port is taken again a second later. The same goes for Docker: if the owner is `docker-proxy`, stop the container instead.

Kill by port when it's a stray process: a dev server left running, an old copy started by hand, a stuck script.

---

## Method 1: fuser (one command)

```bash
sudo fuser -v 8080/tcp          # show who's on it first
```

```
                     USER        PID ACCESS COMMAND
8080/tcp:            app        4521 F.... node
```

```bash
sudo fuser -k -TERM 8080/tcp    # SIGTERM: let it shut down cleanly
sudo fuser -k 8080/tcp          # SIGKILL: default signal for -k, last resort
```

Things to know:

- `-k` without a signal sends **SIGKILL**, not SIGTERM. Always pass `-TERM` first.
- The port must have the protocol suffix. `fuser 8080` looks for a *file* named `8080` in the current directory.
- `8080/tcp` matches the **local** port, so it hits the server process, not clients elsewhere connecting to a remote 8080.
- Without root, it only sees your own processes.
- `fuser` is in the `psmisc` package, which minimal images may not include.

UDP works the same way: `sudo fuser -k -TERM 53/udp`.

---

## Method 2: ss + kill (see exactly what you hit)

```bash
sudo ss -tlnp 'sport = :8080'
```

```
State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN  0       511           0.0.0.0:8080       0.0.0.0:*      users:(("node",pid=4521,fd=19))
```

```bash
ps -o pid,user,etime,cmd -p 4521     # confirm it's what you think it is
kill 4521                             # SIGTERM (the default)
sleep 5
ss -Htln 'sport = :8080'               # empty output = port free
```

Escalate only if it's still there after a reasonable wait:

```bash
kill -9 4521
```

SIGKILL can't be caught. The process gets no chance to flush buffers, finish in-flight requests, or remove PID and lock files. A database killed this way has to run crash recovery on the next start.

If the process ignores both, check its state with `ps -o stat -p 4521`. A `D` (uninterruptible sleep, usually stuck on I/O or NFS) can't be killed until the I/O returns. See [Linux process states](/blog/linux-process-states-guide).

As a one-liner that still only targets the listener:

```bash
sudo ss -Htlnp 'sport = :8080' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u | xargs -r kill
```

---

## Method 3: lsof

The common one-liner is dangerous:

```bash
lsof -ti :8080 | xargs kill -9     # DON'T
```

`-i :8080` matches port 8080 on **either** end of a socket. That includes the listening server, but also any local client that has a connection *to* port 8080 somewhere else: your browser, a health checker, another service. They all get killed.

Restrict it to the listener:

```bash
sudo lsof -nP -t -iTCP:8080 -sTCP:LISTEN               # PIDs only
sudo lsof -nP -t -iTCP:8080 -sTCP:LISTEN | xargs -r kill
```

`-t` prints PIDs only. `-r` makes `xargs` do nothing if the list is empty instead of running a bare `kill`.

---

## Several processes on one port

You may get more than one PID. That's normal when:

- a master process forked workers that share the listening socket (NGINX, Gunicorn, Apache prefork), or
- several processes bind with `SO_REUSEPORT`.

For a master/worker server, signal the **master**. It shuts the workers down cleanly. For NGINX, `nginx -s quit` (graceful) or `nginx -s stop` (fast).

Avoid `kill -9` on a master: the workers can be left running, still holding the port. If you have to force it for a systemd service, hit the whole cgroup at once:

```bash
sudo systemctl kill --signal=SIGKILL nginx.service
sudo systemctl start nginx.service
```

---

## Kill a range of ports

```bash
for port in 8080 8081 8082; do
  sudo fuser -k -TERM "$port/tcp" 2>/dev/null
done
```

Useful for cleaning up local dev servers. Don't use it on production hosts without listing first (`fuser -v`).

---

## After the kill

Confirm the port is free and nothing came back:

```bash
sleep 2; sudo ss -tlnp 'sport = :8080'
```

If a new PID appears, something restarted it: systemd, a container restart policy, supervisord, or a cron job. Stop it at that level.

Don't worry about leftover TIME-WAIT sockets on the port (`ss -tan state time-wait`). They don't block a server that uses `SO_REUSEADDR`, which almost all do. If your app still can't bind, see [port already in use](/blog/port-already-in-use-linux-fix) for the less obvious causes.

---

## Cheat sheet

| Goal | Command |
|---|---|
| Who's on the port | `sudo ss -tlnp 'sport = :8080'` or `sudo fuser -v 8080/tcp` |
| Graceful kill | `sudo fuser -k -TERM 8080/tcp` |
| Kill only the listener (lsof) | `sudo lsof -t -iTCP:8080 -sTCP:LISTEN \| xargs -r kill` |
| It's a service | `sudo systemctl stop <unit>` |
| It's a container | `docker stop <container>` |
| Force, last resort | `kill -9 <pid>` |

---

*Related: [Check Open Ports on Linux](/blog/check-open-ports-linux) to see everything that's listening before you start killing. [Find a Process by Name](/blog/linux-find-process-by-name) when you know the app but not the port.*
