---
title: "Check Open Ports on Linux with ss: Connections and Port in Use"
date: "2026-04-21"
updated: "2026-11-02"
excerpt: "What is listening on a Linux port, who is connected, and what holds the port you need. ss, lsof, fuser, netstat equivalents, and how to free a port safely."
tags: ["linux", "networking", "troubleshooting", "debugging", "monitoring", "infrastructure"]
featured: false
category: "linux"
---

A deploy fails with `bind: address already in use`. Or a client gets `Connection refused` from a service you are sure is running. Or a scanner flags port 3306 as exposed and someone asks you what else is open. Or the database is refusing new clients with "too many connections".

All of these start with the same tool. What is listening on this box, on which address, which process owns it, and who is connected to it right now?

```bash
sudo ss -tulpn                                # every TCP and UDP listener, with process
sudo ss -tlnp 'sport = :8080'                 # who holds port 8080
sudo ss -tnp state established                # who is connected right now
sudo fuser -k -TERM 8080/tcp                  # free port 8080 (stray process only)
```

That covers most of it. The rest of this page is about reading the output correctly, because the port number is the least interesting column, and about freeing a port without making things worse.

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

`ss` is part of `iproute2` and is installed on practically every current distribution. `netstat` comes from the older `net-tools` package and is often missing. The netstat vs ss section below has the comparison and a translation table.

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

`users:(("nginx",pid=1190,fd=6))` gives the command name, PID and file descriptor. If several processes share a socket (nginx master and workers), all of them are listed in the same field. If the Process column is empty, you ran `ss` without root and the socket belongs to another user.

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

If the port is taken and you need it back, see Port already in use below.

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

- the host firewall (nftables, iptables, firewalld, ufw) drops it ([check firewall status](/blog/iptables-block-ip-example))
- a cloud security group or network ACL blocks it
- you are on the wrong network path entirely

So check from the client side too:

```bash
# from another machine
nc -zv -w 3 10.0.1.10 5432
nmap -Pn -p 22,80,443,5432 10.0.1.10
```

Scanning `localhost` from the server itself mostly proves nothing about the firewall, because loopback traffic is usually allowed. Run the scan from where the real clients are. [Testing a TCP connection](/blog/cannot-connect-to-server-linux-troubleshooting) covers how to read `refused` vs `timed out`.

The reverse also happens: a port can be reachable even though `ss` doesn't show what you expect. Docker publishes ports with iptables DNAT rules. You'll normally see a `docker-proxy` process listening on the host, but if the userland proxy is disabled, nothing appears in `ss` at all while the port still works. Docker's rules also bypass ufw on Ubuntu, which surprises a lot of people.

---

## Ports inside containers

A container has its own network namespace, so `ss` on the host does not show sockets that only exist inside it. Check inside:

```bash
docker exec mycontainer ss -tlnp            # if the image has iproute2
```

Minimal images frequently ship without `iproute2` *and* without `net-tools`. Options, best first:

```bash
# From the host, run ss inside the container's network namespace
PID=$(docker inspect -f '{{.State.Pid}}' mycontainer)
sudo nsenter -t "$PID" -n ss -tlnp

# Inside the container, read the kernel table directly (ports in hex, state 0A = LISTEN)
cat /proc/net/tcp /proc/net/tcp6
```

Installing packages into a running production container is a last resort; it won't survive a restart anyway.

---

## Check open connections: who is connected right now

Listening ports tell you what *could* accept traffic. When a service feels slow or the database says "too many connections", you want the **connections** that exist right now: who, from where, and how many.

```
             LISTEN socket (one per port)
                 0.0.0.0:443
                     │ accept()
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
 10.0.1.10:443   10.0.1.10:443   10.0.1.10:443     ESTABLISHED sockets
 ↔ 203.0.113.7   ↔ 198.51.100.4  ↔ 10.0.2.15       (one per client)
   :51234          :40112          :38807
```

`ss -l` shows the top row. `ss state established` shows the bottom row. A web server can have one listener and ten thousand established connections.

### See established connections

```bash
sudo ss -tnp state established
```

```
Recv-Q  Send-Q  Local Address:Port   Peer Address:Port   Process
0       0           10.0.1.10:443   203.0.113.7:51234    users:(("nginx",pid=1191,fd=12))
0       0           10.0.1.10:443  198.51.100.4:40112    users:(("nginx",pid=1192,fd=9))
0       0           10.0.1.10:41876   10.0.1.20:5432     users:(("python3",pid=2210,fd=7))
0       36          10.0.1.10:22    192.0.2.50:60011     users:(("sshd",pid=3301,fd=4))
```

With a `state` filter, `ss` omits the State column. The peer address is column 4, not 5, which matters for every `awk` one-liner below.

The direction is in the ports: a well-known port on the **local** side (`:443`) means an inbound client; a well-known port on the **peer** side (`:5432`) means this host is the client.

### Filter by port: sport vs dport

`sport` is the local port, `dport` is the remote port. Mixing these up is the most common mistake with `ss` filters.

```bash
# Inbound: clients connected to our HTTPS server
sudo ss -tnp state established '( sport = :443 )'

# Outbound: our connections to a PostgreSQL server
sudo ss -tnp state established '( dport = :5432 )'

# Everything to or from one host
sudo ss -tnp dst 10.0.1.20
```

### Count connections

`-H` suppresses the header line, so `wc -l` gives the real number (on older iproute2 without `-H`, subtract one):

```bash
ss -Htn state established '( sport = :443 )' | wc -l     # inbound HTTPS
ss -Htn state established '( dport = :5432 )' | wc -l    # our connections to PostgreSQL
```

Top remote IPs connected to the web server:

```bash
ss -Htn state established '( sport = :443 )' \
  | awk '{print $4}' | sed -E 's/:[0-9]+$//' | sort | uniq -c | sort -rn | head
```

```
    412 10.0.0.5
     38 203.0.113.7
      9 198.51.100.4
```

The `sed` strips the trailing port, which also works for IPv6 addresses like `[2001:db8::1]:51234` where cutting on `:` would not. A single IP with most of the connections is usually a load balancer or NAT gateway, so check that before you block anything.

Connections per process:

```bash
sudo ss -Htnp state established | grep -oE '"[^"]+",pid=[0-9]+' | sort | uniq -c | sort -rn | head
```

### Count by state

The fastest overview:

```bash
ss -s
```

```
Total: 1214
TCP:   980 (estab 512, closed 402, orphaned 0, timewait 398)

Transport Total     IP        IPv6
RAW       1         0         1
UDP       9         6         3
TCP       578       541       37
INET      588       547       41
FRAG      0         0         0
```

For a full breakdown by state:

```bash
ss -Htan | awk '{print $1}' | sort | uniq -c | sort -rn
```

```
    512 ESTAB
    398 TIME-WAIT
     41 CLOSE-WAIT
     22 LISTEN
      3 SYN-SENT
```

| State | What it tells you |
|---|---|
| `ESTAB` | Open connection. Idle keepalive connections count too |
| `TIME-WAIT` | This side closed first. Lasts 60 s on Linux. Normal in moderation |
| `CLOSE-WAIT` | The peer closed; the local app hasn't called `close()` yet |
| `SYN-SENT` | We sent a SYN, no answer yet. Many of these = destination down or filtered |
| `SYN-RECV` | Inbound handshakes in progress. A flood of these can mean a SYN flood |
| `FIN-WAIT-2` | We closed, waiting for the peer's FIN |

Two patterns worth acting on:

- **CLOSE-WAIT that keeps growing** is almost always an application bug: the remote side hung up and the code never closed its socket. It eventually ends in [too many open files](/blog/too-many-open-files-linux-fix). Group it by peer to find which client library is leaking:
  ```bash
  ss -Htn state close-wait | awk '{print $4}' | sort | uniq -c | sort -rn | head
  ```
- **Thousands of TIME-WAIT** are usually harmless on a server. They matter on the *client* side when they pile up toward one destination and exhaust ephemeral ports. [TIME_WAIT explained](/blog/linux-time-wait-explained) covers when to worry.

### Which process owns a connection

The `users:(...)` field shows it. To list everything one process is connected to:

```bash
PID=2210
sudo ss -tnp state established | grep "pid=$PID,"
```

The trailing comma stops `pid=221` from matching `pid=2210`.

With `lsof`, remember that options are OR'ed unless you add `-a`:

```bash
sudo lsof -nP -a -p 2210 -iTCP -sTCP:ESTABLISHED # this PID AND established TCP
sudo lsof -nP -iTCP -sTCP:ESTABLISHED            # all established TCP
```

```
COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
python3 2210  app    7u  IPv4  58123      0t0  TCP 10.0.1.10:41876->10.0.1.20:5432 (ESTABLISHED)
```

Without `-a`, `lsof -p 2210 -i` lists every file of PID 2210 *plus* every network socket on the box.

### Watch over time

```bash
# Inbound connection count every 2 seconds
watch -n 2 "ss -Htn state established '( sport = :443 )' | wc -l"

# Connection count of one process, logged every 30 s
PID=$(pgrep -o -x myapp)
while sleep 30; do
  echo "$(date +%T) $(ss -Htnp state established | grep -c "pid=$PID,")"
done
```

If the count tracks traffic, it's load. If it only ever goes up, the application isn't returning connections to its pool, or isn't closing them.

### Database pool check

When an app reports "too many connections", compare both ends:

```bash
# On the app host: how many connections does it hold?
ss -Htn state established '( dport = :5432 )' | wc -l

# On the database
sudo -u postgres psql -c "SHOW max_connections;"
sudo -u postgres psql -c "SELECT client_addr, state, count(*) FROM pg_stat_activity GROUP BY 1,2 ORDER BY 3 DESC;"
```

Many connections in state `idle` from one client usually means its pool is oversized, or several app instances each have their own full-size pool.

---

## netstat vs ss

You paste `netstat -tlnp` from an old runbook and get `command not found`. Or a colleague's script parses `netstat` output and you're wondering whether to rewrite it.

**Use `ss`.** It ships with `iproute2`, which every current distribution installs, it's faster on busy hosts, and it can filter by state, address and port without `grep`. `netstat` belongs to `net-tools`, which has been unmaintained for years and is left out of many minimal and cloud images.

Keep `netstat` only for legacy scripts you can't change yet, and for BusyBox-based systems (Alpine, many embedded devices) where BusyBox provides a `netstat` applet but `ss` isn't installed.

| | `ss` | `netstat` |
|---|---|---|
| Package | `iproute2` | `net-tools` (deprecated) |
| Installed by default | Practically all current distros | Often not, especially minimal/cloud images |
| How it reads sockets | Netlink (`sock_diag`) straight from the kernel | Parses `/proc/net/tcp`, `/proc/net/udp`, … |
| Speed with tens of thousands of sockets | Fast | Noticeably slower |
| Built-in filters | State, address, port expressions | None; pipe to `grep` |
| TCP internals (RTT, cwnd, timers) | `ss -ti`, `ss -to` | Timers only (`-o`) |
| Send-Q on a LISTEN socket | Shows the backlog limit | Shows 0 |
| Protocol counters (`-s`) | Summary only | Detailed; the `ss` equivalent is `nstat` |

### Command translation

Most of the common flags carry over unchanged:

| Task | netstat | ss / iproute2 |
|---|---|---|
| TCP listeners + process | `netstat -tlnp` | `ss -tlnp` |
| TCP + UDP listeners | `netstat -tulnp` | `ss -tulnp` |
| All TCP sockets, all states | `netstat -tan` | `ss -tan` |
| Established TCP only | `netstat -tn` (then grep) | `ss -tn state established` |
| One port | `netstat -tlnp \| grep ':8080 '` | `ss -tlnp 'sport = :8080'` |
| Timers | `netstat -tno` | `ss -tno` |
| Protocol statistics | `netstat -s` | `nstat -az` |
| Routing table | `netstat -rn` | `ip route` |
| Interface counters | `netstat -i` | `ip -s link` |
| Multicast groups | `netstat -g` | `ip maddr` |

`ss` only replaces the socket part of `netstat`. The routing, interface and statistics parts moved to `ip` and `nstat`, also in `iproute2`.

### Where the output differs

```
$ sudo netstat -tlnp
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      812/sshd
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      1190/nginx
tcp        0      0 127.0.0.1:5432          0.0.0.0:*               LISTEN      1342/postgres
```

Compare with the `ss -tlnp` output in Read the output above. Things that break scripts or trip people up:

- **Column order.** `ss` puts State first; `netstat` puts it sixth. Any `awk '{print $6}'` written for netstat needs rewriting.
- **State spelling.** netstat prints `TIME_WAIT`, `CLOSE_WAIT`. ss prints `TIME-WAIT`, `CLOSE-WAIT`, and its filter keywords are lowercase: `state time-wait`.
- **State column disappears.** When you filter with `ss state established`, the peer address moves from column 5 to column 4.
- **Send-Q on listeners.** `ss` reports the accept backlog limit (128, 511); `netstat` shows 0. For a listener, `ss` is telling you something useful.
- **Process format.** `users:(("nginx",pid=1190,fd=6))` vs `1190/nginx`.
- **Wildcard addresses.** For a dual-stack IPv6 socket, current `ss` prints `*:9100`; `netstat` prints `:::9100` with protocol `tcp6`.
- **Without root,** both hide processes you don't own: `ss` leaves the Process column empty, `netstat` prints `-`.

### What only ss does well

Filters run in the kernel query, not in a pipe:

```bash
ss -tn state time-wait                            # sockets in TIME-WAIT
ss -tn state syn-sent                             # connection attempts stuck in handshake
ss -tn '( sport = :443 ) and ( dst 10.0.0.0/8 )'  # inbound HTTPS from the private range
```

Per-connection TCP internals, which `netstat` never had:

```bash
ss -ti dst 10.0.1.50
# ... cubic wscale:7,7 rto:204 rtt:3.1/1.2 mss:1448 cwnd:10 bytes_acked:52113 ...
```

`rtt`, `rto`, `cwnd` and retransmit counters per socket are often the fastest way to tell a slow network from a slow application.

### Install either tool

```bash
sudo apt install iproute2 net-tools    # Debian/Ubuntu
sudo dnf install iproute net-tools     # RHEL/Rocky/Alma/Fedora (package is "iproute")
sudo apk add iproute2 net-tools        # Alpine
```

---

## Port already in use

You restart a service after a deploy and it dies immediately:

```
nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)
```

Something already owns the port. Usually it's an old copy of the same app, but it can also be systemd, Docker, or the app tripping over itself. The fix depends on which, so find out first.

All of these are `EADDRINUSE` (errno 98):

| Where | What you see |
|---|---|
| NGINX | `bind() to 0.0.0.0:80 failed (98: Address already in use)` |
| Node.js | `Error: listen EADDRINUSE: address already in use :::3000` |
| Python | `OSError: [Errno 98] Address already in use` |
| Java | `java.net.BindException: Address already in use` |
| Docker | `Bind for 0.0.0.0:8080 failed: port is already allocated` |

If you see `Permission denied` (`EACCES`) instead, that's a different problem: a non-root process trying to bind a port below 1024.

### Step 1: who has the port?

```bash
sudo ss -tlnp 'sport = :8080'
```

```
State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN  0       511           0.0.0.0:8080       0.0.0.0:*      users:(("node",pid=4521,fd=19))
```

Use `sudo`, and `-ulnp` for UDP. Then find out what that PID belongs to:

```bash
ps -o pid,ppid,user,etime,cmd -p 4521
systemctl status 4521        # systemctl accepts a PID and shows its unit
```

The second command is the important one. It tells you whether you're dealing with a managed service, a container, or a stray process someone started by hand.

### Step 2: stop it the right way for what it is

**An old instance under systemd.** If `systemctl status <PID>` names a unit, stop the unit:

```bash
sudo systemctl stop oldapp.service
```

Killing the PID directly is a trap. If the unit has `Restart=always`, systemd starts it again within a second and you're back where you started. With `Restart=on-failure`, a `kill -9` counts as a failure and also triggers a restart.

**A systemd socket unit.** If the process shows as `systemd` with `pid=1`, a `.socket` unit is holding the port on behalf of a service:

```bash
systemctl list-sockets | grep 8080
sudo systemctl stop myapp.socket myapp.service
```

Stopping only the service doesn't help: the socket unit keeps listening and will start the service again on the next connection. `systemctl disable` the socket too if it shouldn't come back after reboot.

**A Docker container.**

```bash
docker ps --filter "publish=8080"
docker stop <container>
```

On the host, `ss` usually shows the port owned by `docker-proxy`, not by your application. Don't kill `docker-proxy` by hand; stop or reconfigure the container. If you need both, map a different host port: `-p 8081:8080`.

**A child process that inherited the socket.** You stopped the app, but `ss` still shows the port with a *different* PID. Some apps spawn helpers (a worker, a shell-out, a reload script) that inherit the listening socket. The socket stays bound until **every** process holding it exits:

```bash
sudo ss -tlnp 'sport = :8080'
# users:(("myapp",pid=5102,fd=7),("sh",pid=5230,fd=7))
```

Stop the leftovers too. For a systemd service, `systemctl stop` kills the whole cgroup by default, which is one more reason to use it.

**A stray process.** Nobody manages it, so signal it yourself: see Kill a process by port below.

### Step 3: nothing is listening, but bind still fails

**Your app is conflicting with itself.** Common with IPv6. On Linux, a socket bound to `[::]:8080` accepts IPv4 too (unless `net.ipv6.bindv6only=1` or the app sets `IPV6_V6ONLY`). If the app then also binds `0.0.0.0:8080`, the second bind fails with `EADDRINUSE`, and the error looks exactly like an outside conflict.

Check the config for the same port listed twice, or an IPv4 and an IPv6 listener on the same port where the framework doesn't set `IPV6_V6ONLY`. NGINX's `listen 80;` plus `listen [::]:80;` is fine, because NGINX sets `ipv6only=on` by default.

**TIME-WAIT on the server port.** After a server restarts, connections it closed can linger in TIME-WAIT with the server's own port:

```bash
ss -tan state time-wait '( sport = :8080 )' | head
```

Linux keeps TIME-WAIT for a fixed 60 seconds. Almost every server framework sets `SO_REUSEADDR`, which lets a new listener bind despite these sockets. If yours doesn't, the real fix is to set `SO_REUSEADDR` in the app. Otherwise, wait a minute.

Changing `net.ipv4.tcp_fin_timeout` does **not** help: it controls the FIN-WAIT-2 timeout, not TIME-WAIT. [TIME_WAIT explained](/blog/linux-time-wait-explained) has the details.

**Port taken by an outgoing connection.** Rare, but possible if your service port falls inside the ephemeral range (`cat /proc/sys/net/ipv4/ip_local_port_range`, by default `32768 60999`). An outgoing connection can grab it as a source port. Reserve the port so the kernel never hands it out:

```bash
echo 'net.ipv4.ip_local_reserved_ports = 50000' | sudo tee /etc/sysctl.d/90-reserved-ports.conf
sudo sysctl --system
```

### Stop it from happening on every deploy

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

## Kill a process by port: fuser, ss and lsof

Kill by port when it's a stray process: a dev server left running, an old copy started by hand, a stuck script. If `systemctl status <PID>` shows a unit, or the owner is `docker-proxy`, go back to Step 2 above instead.

### Method 1: fuser (one command)

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

### Method 2: ss + kill (see exactly what you hit)

```bash
sudo ss -tlnp 'sport = :8080'        # get the PID
ps -o pid,user,etime,cmd -p 4521     # confirm it's what you think it is
kill 4521                            # SIGTERM (the default)
sleep 5
ss -Htln 'sport = :8080'             # empty output = port free
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

### Method 3: lsof

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

### Several processes on one port

You may get more than one PID. That's normal when:

- a master process forked workers that share the listening socket (NGINX, Gunicorn, Apache prefork), or
- several processes bind with `SO_REUSEPORT`.

For a master/worker server, signal the **master**. It shuts the workers down cleanly. For NGINX, `nginx -s quit` (graceful) or `nginx -s stop` (fast).

Avoid `kill -9` on a master: the workers can be left running, still holding the port. If you have to force it for a systemd service, hit the whole cgroup at once:

```bash
sudo systemctl kill --signal=SIGKILL nginx.service
sudo systemctl start nginx.service
```

### Kill a range of ports

```bash
for port in 8080 8081 8082; do
  sudo fuser -k -TERM "$port/tcp" 2>/dev/null
done
```

Useful for cleaning up local dev servers. Don't use it on production hosts without listing first (`fuser -v`).

### After the kill

```bash
sleep 2; sudo ss -tlnp 'sport = :8080'
```

If a new PID appears, something restarted it: systemd, a container restart policy, supervisord, or a cron job. Stop it at that level. Leftover TIME-WAIT sockets on the port don't block a server that uses `SO_REUSEADDR`; if the app still can't bind, see Step 3 under Port already in use.

### Cheat sheet

| Goal | Command |
|---|---|
| Who's on the port | `sudo ss -tlnp 'sport = :8080'` or `sudo fuser -v 8080/tcp` |
| Graceful kill | `sudo fuser -k -TERM 8080/tcp` |
| Kill only the listener (lsof) | `sudo lsof -t -iTCP:8080 -sTCP:LISTEN \| xargs -r kill` |
| It's a service | `sudo systemctl stop <unit>` |
| It's a container | `docker stop <container>` |
| Force, last resort | `kill -9 <pid>` |

---

## lsof for listeners

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

---

## Common mistakes

**Checking without `sudo`.** You get the sockets, but no process names for anything you don't own.

**Forgetting `-n`.** `ss -tlp` shows `http` and `ssh` instead of `80` and `22`, and `grep :8080` won't match `http-alt`.

**Assuming `0.0.0.0` covers IPv6.** It doesn't. If clients connect over IPv6 (often because `localhost` resolves to `::1` first), you need `[::]` or a dual-stack `*` listener too.

**Treating listeners and connections as the same thing.** `-l` shows sockets waiting for connections. To see who is actually connected, use a state filter (Check open connections, above).

**Mixing up `sport` and `dport`.** `sport` is the local port, `dport` the remote one.

**Killing the PID of a systemd unit.** It comes straight back. Stop the unit.

---

## FAQ

**Is netstat deprecated?**
The `net-tools` package (netstat, ifconfig, route, arp) has been considered deprecated on Linux for years in favor of `iproute2`. It still works where it's installed, but it isn't a default package on many distributions.

**Is ss output the same as netstat output?**
The information is largely the same; the layout isn't. Column order, state names and the meaning of Send-Q on listening sockets differ, so scripts that parse netstat by column need to be rewritten, not just renamed.

**What replaces netstat -s?**
`nstat -az` from `iproute2` prints the same kernel SNMP counters (retransmits, listen overflows, resets). `ss -s` is only a socket count summary.

---

## Quick checklist

1. `sudo ss -tulpn` to list every TCP and UDP listener with its process.
2. Read the Local Address: loopback, a specific IP, or everything.
3. Test from a real client to confirm reachability through the firewall. In containers, look inside the network namespace.
4. For load or leaks: `ss -s`, then `ss -tnp state established` with `sport` (inbound) or `dport` (outbound); watch CLOSE-WAIT and TIME-WAIT separately.
5. Port in use: `sudo ss -tlnp 'sport = :PORT'`, then `systemctl status PID` to see who manages it.
6. Stop the unit, socket unit or container; `kill` only stray processes, SIGTERM first.
7. Nothing listening but bind fails? Check for duplicate/IPv6 binds in your own config, then TIME-WAIT.

---

*Related: [Cannot Connect to Server](/blog/cannot-connect-to-server-linux-troubleshooting) if the service starts but clients still can't reach it. [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for deeper socket debugging. [systemctl Service Not Starting](/blog/systemctl-service-not-starting-fix) for other start-up failures. [Find a Process by Name](/blog/ps-command-linux-troubleshooting) when you know the app but not the port.*
