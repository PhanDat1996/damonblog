---
title: "Port Already in Use on Linux: Find What Holds It"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Got EADDRINUSE on start? Find the process, socket unit or container holding the port, stop it the right way, and handle TIME-WAIT and IPv6 binds."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You restart a service after a deploy and it dies immediately:

```
nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)
```

Something already owns the port. Usually it's an old copy of the same app, but it can also be systemd, Docker, or the app tripping over itself. The fix depends on which, so find out first.

---

## The error in different software

All of these are `EADDRINUSE` (errno 98):

| Where | What you see |
|---|---|
| NGINX | `bind() to 0.0.0.0:80 failed (98: Address already in use)` |
| Node.js | `Error: listen EADDRINUSE: address already in use :::3000` |
| Python | `OSError: [Errno 98] Address already in use` |
| Java | `java.net.BindException: Address already in use` |
| Docker | `Bind for 0.0.0.0:8080 failed: port is already allocated` |

If you see `Permission denied` (`EACCES`) instead, that's a different problem: a non-root process trying to bind a port below 1024.

---

## Step 1: who has the port?

```bash
sudo ss -tlnp 'sport = :8080'
```

```
State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN  0       511           0.0.0.0:8080       0.0.0.0:*      users:(("node",pid=4521,fd=19))
```

Use `sudo`: without it the Process column is empty for sockets owned by other users. For UDP, use `-ulnp`. The [open ports guide](/blog/check-open-ports-linux) explains the rest of this output.

Then find out what that PID belongs to:

```bash
ps -o pid,ppid,user,etime,cmd -p 4521
systemctl status 4521        # systemctl accepts a PID and shows its unit
```

The second command is the important one. It tells you whether you're dealing with a managed service, a container, or a stray process someone started by hand.

---

## Step 2: stop it the right way for what it is

### An old instance under systemd

If `systemctl status <PID>` names a unit, stop the unit:

```bash
sudo systemctl stop oldapp.service
```

Killing the PID directly is a trap. If the unit has `Restart=always`, systemd starts it again within a second and you're back where you started. With `Restart=on-failure`, a `kill -9` counts as a failure and also triggers a restart.

### A stray process

Nobody manages it, so signal it yourself. SIGTERM first, so it can close connections and remove lock files:

```bash
kill 4521                    # SIGTERM
sleep 5; ss -tlnp 'sport = :8080'
```

Only if it's still there:

```bash
kill -9 4521                 # SIGKILL: no cleanup, last resort
```

More options, including `fuser`, are in [kill a process by port](/blog/linux-kill-process-by-port).

### A child process that inherited the socket

You stopped the app, but `ss` still shows the port with a *different* PID. Some apps spawn helpers (a worker, a shell-out, a reload script) that inherit the listening socket. The socket stays bound until **every** process holding it exits:

```bash
sudo ss -tlnp 'sport = :8080'
# users:(("myapp",pid=5102,fd=7),("sh",pid=5230,fd=7))
```

Stop the leftovers too. For a systemd service, `systemctl stop` kills the whole cgroup by default, which is one more reason to use it.

### A systemd socket unit

If the process shows as `systemd` with `pid=1`, a `.socket` unit is holding the port on behalf of a service:

```bash
systemctl list-sockets | grep 8080
sudo systemctl stop myapp.socket myapp.service
```

Stopping only the service doesn't help: the socket unit keeps listening and will start the service again on the next connection. `systemctl disable` the socket too if it shouldn't come back after reboot.

### A Docker container

```bash
docker ps --filter "publish=8080"
docker stop <container>
```

On the host, `ss` usually shows the port owned by `docker-proxy`, not by your application. Don't kill `docker-proxy` by hand; stop or reconfigure the container. If you need both, map a different host port: `-p 8081:8080`.

---

## Step 3: nothing is listening, but bind still fails

### Your app is conflicting with itself

Common with IPv6. On Linux, a socket bound to `[::]:8080` accepts IPv4 too (unless `net.ipv6.bindv6only=1` or the app sets `IPV6_V6ONLY`). If the app then also binds `0.0.0.0:8080`, the second bind fails with `EADDRINUSE`, and the error looks exactly like an outside conflict.

Check the config for the same port listed twice, or an IPv4 and an IPv6 listener on the same port where the framework doesn't set `IPV6_V6ONLY`. NGINX's `listen 80;` plus `listen [::]:80;` is fine, because NGINX sets `ipv6only=on` by default.

### TIME-WAIT on the server port

After a server restarts, connections it closed can linger in TIME-WAIT with the server's own port:

```bash
ss -tan state time-wait '( sport = :8080 )' | head
```

Linux keeps TIME-WAIT for a fixed 60 seconds. Almost every server framework sets `SO_REUSEADDR`, which lets a new listener bind despite these sockets. If yours doesn't, the real fix is to set `SO_REUSEADDR` in the app. Otherwise, wait a minute.

Changing `net.ipv4.tcp_fin_timeout` does **not** help: it controls the FIN-WAIT-2 timeout, not TIME-WAIT. [TIME_WAIT explained](/blog/linux-time-wait-explained) has the details.

### Port taken by an outgoing connection

Rare, but possible if your service port falls inside the ephemeral range (`cat /proc/sys/net/ipv4/ip_local_port_range`, by default `32768 60999`). An outgoing connection can grab it as a source port. Reserve the port so the kernel never hands it out:

```bash
echo 'net.ipv4.ip_local_reserved_ports = 50000' | sudo tee /etc/sysctl.d/90-reserved-ports.conf
sudo sysctl --system
```

---

## Stop it from happening on every deploy

- **Let systemd manage the process.** `systemctl restart` stops the whole cgroup before starting again, so no orphaned copy keeps the port.
- **Fail fast with a clear message** if your start script runs outside systemd:
  ```bash
  if ss -Htln 'sport = :8080' | grep -q .; then
    echo "port 8080 already in use:" >&2
    ss -tlnp 'sport = :8080' >&2
    exit 1
  fi
  ```
- **Two services configured for the same port** (Apache and NGINX both on 80 after a package install is a classic): disable the one you don't want with `systemctl disable --now apache2` rather than racing them at boot.

---

## Quick checklist

1. `sudo ss -tlnp 'sport = :PORT'` to get the PID.
2. `systemctl status PID` to see who manages it.
3. Stop the unit, socket unit or container; `kill` only stray processes, SIGTERM first.
4. Nothing listening? Check for duplicate/IPv6 binds in your own config, then TIME-WAIT.
5. Start the service and confirm it owns the port.

---

*Related: [Cannot Connect to Server](/blog/cannot-connect-to-server-linux-troubleshooting) if the service starts but clients still can't reach it. [systemctl Service Not Starting](/blog/systemctl-service-not-starting-fix) for other start-up failures.*
