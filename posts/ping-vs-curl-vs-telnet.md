---
title: "ping vs curl vs telnet: Which Test Answers Your Question"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "ping proves ICMP works, telnet or nc proves a TCP port opens, curl proves the app answers. Which to run first, and the false results each one gives."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

Someone in the incident channel writes "I can ping it, so the network's fine." Five minutes later someone else writes "ping fails, the server must be down." Both conclusions can be wrong, because ping, telnet and curl test different things.

## Verdict

- **Is the web/API service working?** Use `curl`. It's the only one of the three that tests the application.
- **Is a non-HTTP port reachable** (database, Redis, SMTP)? Use `nc -zv` (or `telnet` if that's what's installed).
- **Is the host reachable at all, and how is the latency/packet loss?** Use `ping`, but treat a failure as "inconclusive", not "down".

| | ping | telnet / nc | curl |
|---|---|---|---|
| Protocol | ICMP echo | TCP connect | TCP + TLS + HTTP (and others) |
| Tests a specific port | No | Yes | Yes |
| Tests the application | No | No (only that something accepted the connection) | Yes: status code, headers, body |
| Tests TLS / certificate | No | No | Yes |
| Measures latency | Yes, per packet | No (wrap in `time`) | Yes, per phase |
| Commonly blocked | Often (ICMP filtered by firewalls, cloud defaults) | Only if the port is | Only if the port is |
| Installed by default | Almost always | telnet rarely; nc often | Almost always |

---

## ping: is the IP reachable?

```bash
ping -c 4 -W 2 10.0.1.20
```

```
PING 10.0.1.20 (10.0.1.20) 56(84) bytes of data.
64 bytes from 10.0.1.20: icmp_seq=1 ttl=64 time=0.412 ms
64 bytes from 10.0.1.20: icmp_seq=2 ttl=64 time=0.388 ms
64 bytes from 10.0.1.20: icmp_seq=3 ttl=64 time=0.401 ms
64 bytes from 10.0.1.20: icmp_seq=4 ttl=64 time=0.395 ms

--- 10.0.1.20 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3062ms
rtt min/avg/max/mdev = 0.388/0.399/0.412/0.009 ms
```

`-c` sets the count (Linux ping runs forever without it), `-W` the per-reply timeout in seconds.

What ping tells you:

- Routing works in both directions for ICMP.
- Latency and jitter (`mdev`), and **packet loss** over a longer run: `ping -c 100 -i 0.2 host`.

What it doesn't:

- Whether any port is open or any service is running.
- Whether a firewall allows your TCP traffic. ICMP and TCP are filtered separately.

A failed ping means one of: host down, routing broken, or **ICMP filtered**. Many cloud security groups and Windows hosts drop ICMP by default. Don't call a host down on ping alone.

---

## telnet (or nc): does the TCP port open?

```bash
telnet 10.0.1.20 5432
```

```
Trying 10.0.1.20...
Connected to 10.0.1.20.
Escape character is '^]'.
```

`Connected` means the three-way handshake completed: something is listening and the path allows TCP to that port. It doesn't mean the service is healthy. A hung application whose kernel still accepts connections into the backlog will look fine here.

`nc` does the same with a timeout and a clean exit, which makes it better for scripts:

```bash
nc -zv -w 3 10.0.1.20 5432
```

Where telnet still earns its place: talking a text protocol by hand. Connect to port 25 and type `EHLO test`, or to Redis on 6379 and type `PING`. You see the server's real reply.

How to read `refused` vs `timed out` vs `no route to host` is covered in [test a TCP connection](/blog/test-tcp-connection-linux).

---

## curl: does the application answer?

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 3 --max-time 10 https://api.example.com/health
```

A `200` here means DNS, routing, the TCP port, TLS (certificate valid for that name, trusted chain) and the application all worked. That's why curl is the first test for anything HTTP.

When it fails, curl's error says which layer broke:

| curl error | Layer |
|---|---|
| `(6) Could not resolve host` | DNS |
| `(7) Failed to connect ... Connection refused` | TCP: nothing listening |
| `(28) Connection timed out` | TCP: filtered or unreachable |
| `(60) SSL certificate problem` | TLS: expired, self-signed, wrong chain |
| `(35)` / handshake errors | TLS: protocol or cipher mismatch |
| HTTP `502`/`503`/`504` | Reached a proxy; the app behind it failed |

Find the slow phase:

```bash
curl -o /dev/null -sS -w 'dns:     %{time_namelookup}\nconnect: %{time_connect}\ntls:     %{time_appconnect}\nttfb:    %{time_starttransfer}\ntotal:   %{time_total}\n' https://api.example.com/
```

The values are cumulative from the start of the request, so subtract consecutive lines: `ttfb - tls` is time spent waiting for the server to start responding.

Testing one backend behind a load balancer, or a vhost before DNS points to it:

```bash
curl -sv --resolve api.example.com:443:10.0.1.31 https://api.example.com/health
```

`--resolve` is better than an IP plus a `Host:` header for HTTPS, because it also sends the right SNI and validates the certificate against the real name.

Watch for redirects: an `http://` URL often returns `301` to HTTPS. Add `-L` to follow it, or test the `https://` URL directly.

---

## The order to run them in

```
curl the service ──► works? done.
      │ fails
      ▼
read curl's error ──► DNS (6)?  ──► fix DNS
      │                TLS (60)? ──► fix cert
      ▼
nc -zv host port ──► refused?  ──► service down / wrong bind address
      │               timed out? ──► firewall / route
      ▼
ping host        ──► loss/latency on the path? ──► traceroute / mtr
```

Start at the top for HTTP services: one curl often tells you everything. Start at `nc` for databases and other TCP services. Use ping last, for path quality, not as a reachability verdict.

### Two classic misreads

**Ping works, service doesn't.** The host is up, but the database isn't listening, or listens on `127.0.0.1` only, or the firewall allows ICMP and blocks 5432. `nc` and `ss` on the server settle it.

**Ping fails, service works.** ICMP is filtered somewhere on the path. `curl` or `nc` succeeds and the service is fine. Nothing to fix.

When nothing works and you need a systematic pass, follow [cannot connect to server](/blog/cannot-connect-to-server-linux-troubleshooting). When ping shows loss and you want to know where, use [traceroute and mtr](/blog/traceroute-linux-examples).

---

## FAQ

**Can ping test a specific port?**
No. ICMP has no ports. Use `nc -zv host port`, or `curl` for HTTP.

**Why does telnet hang instead of failing?**
The SYN is being dropped silently (a firewall DROP rule or security group), so the client keeps retrying until the kernel gives up, about two minutes by default. `nc -w 3` returns in three seconds instead.

**Is telnet still safe to use for testing?**
The telnet *client* is fine for connection tests. The risk is the telnet *server* (port 23), which sends everything in clear text and shouldn't be running.
