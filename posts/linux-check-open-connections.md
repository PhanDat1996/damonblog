---
title: "Linux Check Open Connections: Who Is Connected Right Now"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "See established TCP connections on Linux, count them by remote IP or state, and find which process owns them. ss filters that work, plus CLOSE-WAIT."
tags: ["linux", "networking", "troubleshooting", "monitoring"]
featured: false
category: "linux"
---

Your database is refusing new clients with "too many connections". Or a service suddenly feels slow and you want to know who is hitting it, from where, and how hard. That isn't a question about which ports are open. It's about the **connections** that exist right now.

```bash
sudo ss -tnp state established
```

This page is about established connections: counting them, grouping them, and spotting the bad patterns. If you want to know which ports are *listening*, use the [open ports guide](/blog/check-open-ports-linux) instead.

---

## Listeners vs connections

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

---

## See established connections

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

Note that with a `state` filter, `ss` omits the State column. The peer address is column 4, not 5, which matters for every `awk` one-liner below.

The direction is in the ports: a well-known port on the **local** side (`:443`) means an inbound client; a well-known port on the **peer** side (`:5432`) means this host is the client.

---

## Filter by port: sport vs dport

`sport` is the local port, `dport` is the remote port. Mixing these up is the most common mistake with `ss` filters.

```bash
# Inbound: clients connected to our HTTPS server
sudo ss -tnp state established '( sport = :443 )'

# Outbound: our connections to a PostgreSQL server
sudo ss -tnp state established '( dport = :5432 )'

# Everything to or from one host
sudo ss -tnp dst 10.0.1.20
```

---

## Count connections

`-H` suppresses the header line, so `wc -l` gives the real number (on older iproute2 without `-H`, subtract one):

```bash
# Inbound HTTPS connections
ss -Htn state established '( sport = :443 )' | wc -l

# Our connections to PostgreSQL
ss -Htn state established '( dport = :5432 )' | wc -l
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

---

## Count by state

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

---

## Which process owns a connection

```bash
sudo ss -tnp state established '( dport = :5432 )'
```

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

---

## Watch over time

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

## Quick checklist

1. `ss -s` for the overall picture.
2. `ss -tnp state established` with `sport` (inbound) or `dport` (outbound).
3. Group by peer IP and by process to find who dominates.
4. Look at CLOSE-WAIT (app bug) and TIME-WAIT (client-side port pressure) separately.
5. Watch the count over time before deciding it's a leak.

---

*Related: [netstat vs ss](/blog/netstat-vs-ss-command) if you're translating old netstat commands. [strace, lsof, and ss](/blog/strace-lsof-ss-debugging) for following a connection into the process.*
