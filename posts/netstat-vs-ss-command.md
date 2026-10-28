---
title: "netstat vs ss: Differences and Command Equivalents"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Use ss on any modern Linux; netstat is from deprecated net-tools. Verdict, the real output differences, and a netstat-to-ss translation table."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

You paste `netstat -tlnp` from an old runbook and get `command not found`. Or a colleague's script parses `netstat` output and you're wondering whether to rewrite it. Here is the short answer and the details that actually matter when you switch.

## Verdict

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

If you just need to check what's listening, the [check open ports guide](/blog/check-open-ports-linux) walks through reading `ss` output. This page is about the differences between the two tools.

---

## Command translation

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

Note that `ss` only replaces the socket part of `netstat`. The routing, interface and statistics parts moved to `ip` and `nstat`, also in `iproute2`.

---

## Where the output differs

Same listeners, both tools:

```
$ sudo ss -tlnp
State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN  0       128           0.0.0.0:22         0.0.0.0:*      users:(("sshd",pid=812,fd=3))
LISTEN  0       511           0.0.0.0:80         0.0.0.0:*      users:(("nginx",pid=1190,fd=6))
LISTEN  0       244         127.0.0.1:5432       0.0.0.0:*      users:(("postgres",pid=1342,fd=5))

$ sudo netstat -tlnp
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      812/sshd
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      1190/nginx
tcp        0      0 127.0.0.1:5432          0.0.0.0:*               LISTEN      1342/postgres
```

Things that break scripts or trip people up:

- **Column order.** `ss` puts State first; `netstat` puts it sixth. Any `awk '{print $6}'` written for netstat needs rewriting.
- **State spelling.** netstat prints `TIME_WAIT`, `CLOSE_WAIT`. ss prints `TIME-WAIT`, `CLOSE-WAIT`, and its filter keywords are lowercase: `state time-wait`.
- **State column disappears.** When you filter with `ss state established`, `ss` drops the State column, so the peer address moves from column 5 to column 4.
- **Send-Q on listeners.** `ss` reports the accept backlog limit (128, 511); `netstat` shows 0. For a listener, `ss` is telling you something useful.
- **Process format.** `users:(("nginx",pid=1190,fd=6))` vs `1190/nginx`. If several processes share a socket (nginx master and workers), `ss` lists all of them in the same field.
- **Wildcard addresses.** For a dual-stack IPv6 socket, current `ss` prints `*:9100`; `netstat` prints `:::9100` with protocol `tcp6`.
- **Without root,** both hide processes you don't own: `ss` leaves the Process column empty, `netstat` prints `-`.

---

## What only ss does well

Filters run in the kernel query, not in a pipe:

```bash
ss -tn state established '( dport = :5432 )'      # outgoing connections to PostgreSQL
ss -tn state time-wait                            # sockets in TIME-WAIT
ss -tn state syn-sent                             # connection attempts stuck in handshake
ss -tn dst 10.0.1.50                              # anything talking to one host
ss -tn '( sport = :443 ) and ( dst 10.0.0.0/8 )'  # inbound HTTPS from the private range
```

Per-connection TCP internals, which `netstat` never had:

```bash
ss -ti dst 10.0.1.50
# ... cubic wscale:7,7 rto:204 rtt:3.1/1.2 mss:1448 cwnd:10 bytes_acked:52113 ...
```

`rtt`, `rto`, `cwnd` and retransmit counters per socket are often the fastest way to tell a slow network from a slow application. For working with live connections, see [how to check open connections](/blog/linux-check-open-connections).

---

## When neither is installed

Minimal container images frequently ship without `iproute2` *and* without `net-tools`. Options, best first:

```bash
# From the host, run ss inside the container's network namespace
PID=$(docker inspect -f '{{.State.Pid}}' mycontainer)
sudo nsenter -t "$PID" -n ss -tlnp

# Inside the container, read the kernel table directly (ports in hex, state 0A = LISTEN)
cat /proc/net/tcp /proc/net/tcp6
```

Installing packages into a running production container is a last resort; it won't survive a restart anyway.

To install either tool on a host:

```bash
sudo apt install iproute2 net-tools    # Debian/Ubuntu
sudo dnf install iproute net-tools     # RHEL/Rocky/Alma/Fedora (package is "iproute")
sudo apk add iproute2 net-tools        # Alpine
```

---

## FAQ

**Is netstat deprecated?**
The `net-tools` package (netstat, ifconfig, route, arp) has been considered deprecated on Linux for years in favor of `iproute2`. It still works where it's installed, but it isn't a default package on many distributions.

**Is ss output the same as netstat output?**
The information is largely the same; the layout isn't. Column order, state names and the meaning of Send-Q on listening sockets differ, so scripts that parse netstat by column need to be rewritten, not just renamed.

**What replaces netstat -s?**
`nstat -az` from `iproute2` prints the same kernel SNMP counters (retransmits, listen overflows, resets). `ss -s` is only a socket count summary.

---

*Related: [Check Open Ports on Linux](/blog/check-open-ports-linux) for reading `ss -tlnp` in practice. [Linux TIME_WAIT Explained](/blog/linux-time-wait-explained) for what the TIME-WAIT counts actually mean.*
