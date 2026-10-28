---
title: "Check Open Ports on Linux: Listening Ports with ss"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "See which ports are listening on Linux, which process owns each one, and whether it is reachable from outside. ss, lsof and netstat, with real output."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

A deploy fails with `bind: address already in use`. Or a client gets `Connection refused` from a service you are sure is running. Or a scanner flags port 3306 as exposed and someone asks you what else is open.

All three start with the same question: what is listening on this box, on which address, and which process owns it?

```bash
sudo ss -tulpn
```

That one command answers most of it. The rest of this page is about reading the output correctly, because the port number is the least interesting column.

---

## The commands you'll actually use

```bash
sudo ss -tlnp                       # TCP listeners with process
sudo ss -ulnp                       # UDP sockets with process
sudo ss -tulpn                      # both
sudo ss -tlnp 'sport = :8080'       # one specific port (exact match)
sudo lsof -nP -iTCP -sTCP:LISTEN    # same thing, lsof style
```

| Flag | Meaning |
|---|---|
| `-t` / `-u` | TCP / UDP sockets |
| `-l` | Listening sockets only |
| `-n` | Numeric ports and addresses (`80`, not `http`) |
| `-p` | Show the owning process. Needs root to see other users' processes |

`ss` is part of `iproute2` and is installed on practically every current distribution. `netstat` comes from the older `net-tools` package and is often missing. For a full comparison and a command translation table, see [netstat vs ss](/blog/netstat-vs-ss-command).

---

## Read the output

```bash
sudo ss -tlnp
```

```
State   Recv-Q  Send-Q  Local Address:Port   Peer Address:Port  Process
LISTEN  0       128           0.0.0.0:22          0.0.0.0:*      users:(("sshd",pid=812,fd=3))
LISTEN  0       511           0.0.0.0:80          0.0.0.0:*      users:(("nginx",pid=1190,fd=6))
LISTEN  0       4096    127.0.0.53%lo:53          0.0.0.0:*      users:(("systemd-resolve",pid=640,fd=14))
LISTEN  0       244         127.0.0.1:5432        0.0.0.0:*      users:(("postgres",pid=1342,fd=5))
LISTEN  0       128              [::]:22             [::]:*      users:(("sshd",pid=812,fd=4))
LISTEN  0       4096                *:9100              *:*      users:(("node_exporter",pid=905,fd=3))
```

### Local Address: who can reach it

This column decides whether a port is "open" in any useful sense.

| Local Address | Reachable from |
|---|---|
| `0.0.0.0:80` | Any IPv4 address on any interface |
| `[::]:22` | Any IPv6 address (IPv6 only, if a separate `0.0.0.0` socket exists, as with sshd above) |
| `*:9100` | Any interface, IPv4 and IPv6: a single dual-stack socket (shown this way on current iproute2) |
| `127.0.0.1:5432` | This host only |
| `127.0.0.53%lo:53` | This host only (systemd-resolved's stub resolver, normal on Ubuntu) |
| `[::1]:6379` | This host only, IPv6 |
| `10.0.1.10:8080` | Only via that one address |

Two consequences:

- **A service on `127.0.0.1` gives remote clients `Connection refused`**, even though `systemctl status` says it's running. Very common with apps whose default bind is `localhost`.
- **A database on `0.0.0.0` is exposed on every interface**, including the public one. Only the firewall stands between it and the internet.

### Recv-Q and Send-Q mean something different on listeners

For a `LISTEN` socket:

- **Send-Q** is the maximum accept backlog: the smaller of the app's `listen()` backlog and `net.core.somaxconn`. That's why nginx shows 511 and sshd shows 128.
- **Recv-Q** is how many fully established connections are waiting for the app to `accept()` them right now.

`Recv-Q` near or equal to `Send-Q` means the application isn't accepting fast enough, and the kernel will start dropping new connection attempts. Clients see this as intermittent timeouts, not refusals. Confirm with `nstat -az TcpExtListenOverflows`, which counts overflows since boot.

### Process

`users:(("nginx",pid=1190,fd=6))` gives the command name, PID and file descriptor. If the Process column is empty, you ran `ss` without root and the socket belongs to another user.

---

## Check one specific port

```bash
sudo ss -tlnp 'sport = :8080'
```

No output means nothing is listening on TCP 8080.

Prefer the filter over `grep :80`, which also matches `:8080`, `:8000` and peer addresses. If you do grep, anchor it: `ss -tlnp | grep -E ':80\s'`.

To check several:

```bash
sudo ss -tlnp '( sport = :80 or sport = :443 )'
```

If the port is taken and you need it back, [find and stop the process holding it](/blog/port-already-in-use-linux-fix).

---

## UDP: there is no LISTEN state

UDP is connectionless, so UDP sockets show as `UNCONN`, not `LISTEN`:

```bash
sudo ss -ulnp
```

```
State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
UNCONN  0       0       127.0.0.53%lo:53         0.0.0.0:*      users:(("systemd-resolve",pid=640,fd=13))
UNCONN  0       0             0.0.0.0:123        0.0.0.0:*      users:(("chronyd",pid=702,fd=5))
```

A script that does `ss -tulnp | grep LISTEN` silently skips every UDP service (DNS, NTP, syslog, WireGuard).

---

## Audit what is exposed

List everything not bound to loopback:

```bash
sudo ss -Htulnp | grep -vE '127\.0\.0\.[0-9]+(%[a-z0-9]+)?:|\[::1\]:'
```

`-H` drops the header line (supported by any reasonably recent iproute2). On a typical web server you'd expect 22, 80 and 443. Anything else needs an owner and a reason.

Compare against an expected list:

```bash
EXPECTED="22 80 443"
sudo ss -Htln | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un | while read -r port; do
  echo " $EXPECTED " | grep -q " $port " || echo "Unexpected listener on port $port"
done
```

Save a baseline and diff it after changes:

```bash
sudo ss -Htulnp | sort > ports-before.txt
# ... deploy, upgrade, etc.
sudo ss -Htulnp | sort > ports-after.txt
diff ports-before.txt ports-after.txt
```

PIDs change on restart, so expect some noise in the Process column.

---

## Listening is not the same as reachable

`ss` reports what the kernel has bound. It knows nothing about the firewall in front of it. A port can be listening on `0.0.0.0` and still be unreachable because:

- the host firewall (nftables, iptables, firewalld, ufw) drops it ([check firewall status](/blog/check-firewall-status-linux))
- a cloud security group or network ACL blocks it
- you are on the wrong network path entirely

So check from the client side too:

```bash
# from another machine
nc -zv -w 3 10.0.1.10 5432
nmap -Pn -p 22,80,443,5432 10.0.1.10
```

Scanning `localhost` from the server itself mostly proves nothing about the firewall, because loopback traffic is usually allowed. Run the scan from where the real clients are. [Testing a TCP connection](/blog/test-tcp-connection-linux) covers how to read `refused` vs `timed out`.

The reverse also happens: a port can be reachable even though `ss` doesn't show what you expect. Docker publishes ports with iptables DNAT rules. You'll normally see a `docker-proxy` process listening on the host, but if the userland proxy is disabled, nothing appears in `ss` at all while the port still works. Docker's rules also bypass ufw on Ubuntu, which surprises a lot of people.

---

## Ports inside containers

A container has its own network namespace, so `ss` on the host does not show sockets that only exist inside it. Check inside:

```bash
docker exec mycontainer ss -tlnp            # if the image has iproute2
```

Slim images often have neither `ss` nor `netstat`. Run the host's `ss` inside the container's namespace instead:

```bash
PID=$(docker inspect -f '{{.State.Pid}}' mycontainer)
sudo nsenter -t "$PID" -n ss -tlnp
```

---

## lsof and netstat

`lsof` is handy when you want the user column, or when you are already thinking in terms of files:

```bash
sudo lsof -nP -iTCP -sTCP:LISTEN
```

```
COMMAND    PID     USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
sshd       812     root    3u  IPv4  21431      0t0  TCP *:22 (LISTEN)
nginx     1190     root    6u  IPv4  24510      0t0  TCP *:80 (LISTEN)
postgres  1342 postgres    5u  IPv4  25102      0t0  TCP 127.0.0.1:5432 (LISTEN)
```

Always pass `-nP`. Without them lsof does DNS lookups and turns ports into service names, which is slow and makes `8080` show up as `http-alt`. Note that lsof shows the master process that owns the socket. Worker processes that inherited it appear as separate lines.

`netstat -tlnp` gives the same information if you're on a box that has `net-tools`. The [netstat vs ss](/blog/netstat-vs-ss-command) page covers the differences.

---

## Common mistakes

**Checking without `sudo`.** You get the sockets, but no process names for anything you don't own.

**Forgetting `-n`.** `ss -tlp` shows `http` and `ssh` instead of `80` and `22`, and `grep :8080` won't match `http-alt`.

**Assuming `0.0.0.0` covers IPv6.** It doesn't. If clients connect over IPv6 (often because `localhost` resolves to `::1` first), you need `[::]` or a dual-stack `*` listener too.

**Treating listeners and connections as the same thing.** `-l` shows sockets waiting for connections. To see who is actually connected right now, use [`ss` with a state filter](/blog/linux-check-open-connections).

---

## Quick checklist

1. `sudo ss -tulpn` to list every TCP and UDP listener with its process.
2. Read the Local Address: loopback, a specific IP, or everything.
3. Match each unexpected port to a PID and a service.
4. Test from a real client to confirm reachability through the firewall.
5. In containers, look inside the network namespace, not on the host.

---

*Related: [Port Already in Use](/blog/port-already-in-use-linux-fix) when the port you need is taken. [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for deeper socket debugging. [Linux Kill Process by Port](/blog/linux-kill-process-by-port) once you know which PID to stop.*
