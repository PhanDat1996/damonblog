---
title: "Test a TCP Connection on Linux: nc, curl and /dev/tcp"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Check if a remote port is reachable with nc, curl, bash /dev/tcp or telnet, and learn what refused, timed out and no route to host each tell you."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

The app logs say it can't reach the database. Before you touch any config, answer one question from the machine that's failing: can it open a TCP connection to that host and port at all?

```bash
nc -zv -w 3 10.0.1.20 5432
```

The answer you get back (succeeded, refused, timed out, no route) tells you which layer to look at next. That's the part most guides skip.

---

## Pick a tool

| Tool | Command | When |
|---|---|---|
| `nc` | `nc -zv -w 3 HOST PORT` | Default choice |
| bash | `timeout 3 bash -c '</dev/tcp/HOST/PORT'` | No nc installed, but bash is |
| `curl` | `curl -sv --connect-timeout 3 telnet://HOST:PORT` | Containers that only have curl |
| `telnet` | `telnet HOST PORT` | Interactive, e.g. typing SMTP or Redis commands |
| `openssl` | `openssl s_client -connect HOST:443` | You also need to check TLS |

Always set a timeout. Without one, a filtered port makes Linux retry the SYN until `net.ipv4.tcp_syn_retries` runs out: with the default of 6, that's about **two minutes** before you get an answer.

---

## nc

```bash
nc -zv -w 3 10.0.1.20 5432
```

- `-z`: connect, then close without sending data
- `-v`: print the result
- `-w 3`: give up after 3 seconds

On Debian/Ubuntu, `nc` is usually the OpenBSD version:

```
Connection to 10.0.1.20 5432 port [tcp/postgresql] succeeded!
nc: connect to 10.0.1.20 port 5432 (tcp) failed: Connection refused
nc: connect to 10.0.1.20 port 5432 (tcp) timed out: Operation now in progress
```

On RHEL, Rocky and Fedora, `nc` is Nmap's `ncat`, which prints things like `Ncat: Connected to 10.0.1.20:5432.` and `Ncat: Connection refused.` Older ncat builds don't support `-z`; use `nc -w 3 HOST PORT </dev/null` instead.

Several ports:

```bash
for port in 22 80 443 5432; do
  nc -zv -w 2 10.0.1.20 "$port"
done 2>&1 | grep -E 'succeeded|Connected|refused|timed out|TIMEOUT'
```

### UDP is different

```bash
nc -zvu -w 3 10.0.1.53 53
```

This "succeeds" almost always. UDP has no handshake, so `nc` can only report failure if an ICMP port-unreachable comes back. Silence is not proof the port is open. To test a UDP service, talk its protocol: `dig @10.0.1.53 example.com` for DNS, `chronyc` or `ntpdate -q` for NTP.

---

## bash /dev/tcp (no extra packages)

```bash
timeout 3 bash -c '</dev/tcp/10.0.1.20/5432' && echo open || echo "closed or filtered"
```

`/dev/tcp/HOST/PORT` isn't a real file. It's a bash feature that opens a TCP connection when you redirect to it. It only works in **bash**: Alpine's `sh` (BusyBox ash) and Debian's `dash` don't have it, so always invoke it through `bash -c`.

Useful inside containers where nothing else is installed:

```bash
docker exec myapp bash -c 'timeout 3 bash -c "</dev/tcp/db/5432" && echo open'
```

---

## curl

For an HTTP service, test the service, not just the port:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 3 http://10.0.1.30:8080/health
```

For any other TCP port, `curl`'s telnet scheme works as a raw connect test:

```bash
curl -sv --connect-timeout 3 --max-time 5 telnet://10.0.1.20:5432 </dev/null
# *   Trying 10.0.1.20:5432...
# * Connected to 10.0.1.20 (10.0.1.20) port 5432
```

`Connected to` is the line that matters. The command may then wait until `--max-time` because nothing is sent; that's expected.

To see where time goes on a slow connection:

```bash
curl -o /dev/null -sS -w 'dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s total=%{time_total}s\n' https://api.example.com/
```

---

## telnet

```bash
telnet 10.0.1.20 5432
# Trying 10.0.1.20...
# Connected to 10.0.1.20.
# Escape character is '^]'.
```

Exit with `Ctrl+]`, then `quit`. telnet is rarely installed by default anymore and has no timeout option, so it's best for interactive protocol testing. [ping vs curl vs telnet](/blog/ping-vs-curl-vs-telnet) compares when each tool is the right one.

---

## TLS ports

A successful TCP connect on 443 says nothing about the certificate. Check both at once:

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

`-servername` sends SNI. Without it, a server hosting several sites may hand you the wrong certificate.

---

## What the result means

| Result | What happened on the wire | Look at |
|---|---|---|
| succeeded / Connected | SYN, SYN-ACK, ACK completed | Port is fine; the problem is higher up (TLS, auth, app) |
| `Connection refused` | Host answered with a TCP RST, or a firewall REJECT with port-unreachable | Is the service running? Bound to `127.0.0.1` only? fail2ban? |
| `timed out` | No answer at all | A firewall DROP rule, a cloud security group, routing, or the host is down |
| `No route to host` | An ICMP host-unreachable came back | firewalld's default reject (`icmp-host-prohibited`), or ARP failing on the local subnet |
| `Network is unreachable` | Your own host has no route | `ip route get <ip>` on the client |
| `Name or service not known` | DNS lookup failed before any TCP | [DNS troubleshooting](/blog/dns-not-resolving-linux-fix) |

"Refused" is good news in a way: you reached *something* that answered. On the server, [check what is listening](/blog/check-open-ports-linux) and on which address. "Timed out" means packets disappear in between, and the [connection troubleshooting walkthrough](/blog/cannot-connect-to-server-linux-troubleshooting) goes through that step by step.

---

## Test from the right place

`nc -zv localhost 8080` on the server proves the app is up. It doesn't prove a client can reach it: loopback skips the external firewall and works even when the app is bound to `127.0.0.1`. Test from the client host, or as close to it as you can get.

If the client has several addresses and you need a specific source IP (for an allow-list, say):

```bash
nc -zv -w 3 -s 10.0.2.15 10.0.1.20 5432
```

`-s` sets the source address. Which interface the packet leaves through is still decided by the routing table.

### Wait for a port in a script

```bash
for i in $(seq 1 30); do
  nc -z -w 1 localhost 8080 && { echo "up"; exit 0; }
  sleep 2
done
echo "port 8080 not up after 60s" >&2; exit 1
```

Always cap the loop. A `while ! nc ...` without a limit hangs a deploy forever.

---

*Related: [traceroute examples](/blog/traceroute-linux-examples) when a connection times out and you need to see where packets stop.*
