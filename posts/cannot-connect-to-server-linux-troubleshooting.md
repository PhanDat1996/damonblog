---
title: "Cannot Connect to Server on Linux: Troubleshoot Layer by Layer"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Refused, timed out or no route to host? Check interface, route, traceroute, TCP port and app in order with ip, ping, mtr, nc and curl."
tags: ["linux", "networking", "troubleshooting", "debugging", "infrastructure"]
featured: false
category: "linux"
---

The service is "up" according to everyone you ask, and the client still can't connect. Someone in the incident channel writes "I can ping it, so the network's fine." Five minutes later someone else writes "ping fails, the server must be down." Both conclusions can be wrong.

Before you restart anything, look closely at the exact error. `Connection refused` and `Connection timed out` sound similar but point at completely different parts of the path, and treating one like the other wastes the first hour of most outages. Then work up the layers: interface, route, path, TCP port, application.

```bash
nc -zv -w 3 10.0.1.50 8080                                     # does the TCP port open?
curl -sv --connect-timeout 3 http://10.0.1.50:8080/health      # does the app answer?
ip -br addr                                                    # is my interface up, with the right IP?
ip route get 10.0.1.50                                         # which interface and gateway?
mtr -n -rwc 100 10.0.1.50                                      # where along the path is loss?
```

---

## Start with the exact error

Reproduce it from the client with a short timeout. Always set one: without it, a filtered port makes Linux retry the SYN until `net.ipv4.tcp_syn_retries` runs out. With the default of 6, that's about **two minutes** before you get an answer.

| Error | What happened on the wire | Look at |
|---|---|---|
| succeeded / Connected | SYN, SYN-ACK, ACK completed | Port is fine; the problem is higher up (TLS, auth, app) |
| `Name or service not known` / `Could not resolve host` | DNS failed; no packet was sent to the server | DNS and the local route |
| `Network is unreachable` | Your own host has no route to that network | DNS and the local route |
| `Connection refused` | The server host (or a firewall REJECT with port-unreachable) answered with RST/ICMP | Connection refused: is it listening? |
| `Connection timed out` / hangs | No answer at all; packets are silently dropped somewhere | Connection timed out: find where packets disappear |
| `No route to host` | ICMP host-unreachable: firewalld's default reject (`icmp-host-prohibited`), or ARP failing on the local subnet | Host firewall, local interface |
| `Connection reset by peer` right after the TLS `Client hello` | Something on the path read the hostname and reset the flow; see [proving SNI blocking](/blog/tls-connection-reset-sni-blocking) | — |

"Refused" is good news in a way: you reached *something* that answered. "Timed out" means packets disappear in between.

---

## ping vs curl vs telnet: which test answers your question

ping, telnet and curl test different things.

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

### The order to run them in

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

**Ping works, service doesn't.** The host is up, but the database isn't listening, or listens on `127.0.0.1` only, or the firewall allows ICMP and blocks 5432. `nc` and `ss` on the server settle it.

**Ping fails, service works.** ICMP is filtered somewhere on the path. `curl` or `nc` succeeds and the service is fine. Nothing to fix.

---

## Check the network interface

If the client (or server) itself dropped off the network, or is reachable but slow, rule out the interface before chasing firewalls and DNS. Interface names differ per machine (`eth0`, `ens5`, `enp1s0`…). Substitute yours.

```bash
ip -br link
```

```
lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>
ens5             UP             0a:1b:2c:3d:4e:5f <BROADCAST,MULTICAST,UP,LOWER_UP>
ens6             DOWN           0a:1b:2c:3d:4e:60 <BROADCAST,MULTICAST>
docker0          DOWN           02:42:8c:1a:00:01 <NO-CARRIER,BROADCAST,MULTICAST,UP>
```

```bash
ip -br addr
```

```
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens5             UP             10.0.1.10/24 fe80::81b:2cff:fe3d:4e5f/64
ens6             DOWN
docker0          DOWN           172.17.0.1/16
```

`-br` (brief) is the fastest way to see everything at once. Use the full output when you need details.

### UP, LOWER_UP, NO-CARRIER: what the flags mean

| Field | Meaning |
|---|---|
| `UP` (in `<...>`) | **Administratively** enabled: someone or something ran `ip link set ... up` |
| `LOWER_UP` | The physical/virtual link layer has a carrier: cable plugged in, switch port up |
| `NO-CARRIER` | Enabled, but no link. Cable, switch port, or the other end of a virtual link |
| `state UP/DOWN` | The kernel's operational state, combining both of the above |
| `state UNKNOWN` | The driver doesn't report link state. Normal for `lo`, tun/tap devices and some virtual NICs |

So `<...,UP,NO-CARRIER> state DOWN` means "configured up, but there's no link": a physical or switch problem, not a config one. `<BROADCAST,MULTICAST> state DOWN` with no `UP` means nobody brought it up: a config or network-manager problem.

`docker0` showing `NO-CARRIER` when no containers are running is normal; a bridge has no carrier until something is attached.

### IP addresses

```bash
ip addr show ens5
```

```
2: ens5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 9001 qdisc mq state UP group default qlen 1000
    link/ether 0a:1b:2c:3d:4e:5f brd ff:ff:ff:ff:ff:ff
    inet 10.0.1.10/24 metric 100 brd 10.0.1.255 scope global dynamic ens5
       valid_lft 3412sec preferred_lft 3412sec
    inet6 fe80::81b:2cff:fe3d:4e5f/64 scope link
       valid_lft forever preferred_lft forever
```

- `inet` / `inet6`: address and prefix length.
- `scope global`: usable for routing. `scope link`: link-local only (the `fe80::` address every IPv6 interface gets).
- `dynamic` with a `valid_lft` countdown: assigned by DHCP. If `valid_lft` gets close to 0 and the lease doesn't renew, the address will disappear.

Just the address, for scripts: `ip -4 -o addr show ens5 | awk '{print $4}'`.

### Error and drop counters

```bash
ip -s link show ens5
```

```
    RX:    bytes  packets errors dropped  missed   mcast
    8251739102 12873310      0     214       0       0
    TX:    bytes  packets errors dropped carrier collsns
    2918374650  9182733      0       0       0       0
```

These are totals since the interface came up, so a non-zero value on its own means little. What matters is whether they **grow**: `watch -d -n 2 'ip -s link show ens5'`.

| Counter rising | Likely cause |
|---|---|
| RX `errors` | Bad cable or optic, CRC errors, duplex mismatch |
| RX `dropped` | The kernel discarded packets, e.g. a full backlog under load. Depending on kernel and driver, frames nobody handles (unknown protocol or VLAN) can also land here, which is harmless |
| RX `missed` | The NIC ran out of buffer before the kernel could take packets: CPU or IRQ saturation |
| TX `carrier` | Link flapping |

### ethtool: speed, duplex, link

`sudo ethtool eno1` shows `Speed`, `Duplex`, `Auto-negotiation` and `Link detected`.

- **Speed lower than expected** (100Mb/s on a gigabit port) usually means a damaged cable or a bad patch panel port, with autonegotiation falling back.
- **Duplex: Half** on modern hardware is almost always a negotiation problem, and it causes errors and collisions under load.
- **Link detected: no** confirms what `NO-CARRIER` already said.

On VMs and cloud instances, ethtool is less informative. Many virtual NICs report `Speed: Unknown!` or a nominal value, and the real bandwidth limit comes from the instance type.

### MTU

```bash
ip link show ens5 | grep -o 'mtu [0-9]*'
```

A mismatch, such as 9001 on the host but 1500 somewhere on the path or 1450 inside a VPN/overlay, causes a recognizable failure: small requests work, large transfers or TLS handshakes stall. `tracepath` finds the path MTU (see the traceroute section below). `ip link set ens5 mtu 1500` changes it immediately but not persistently, and setting an MTU the network doesn't support breaks connectivity. Change it in your network configuration (netplan, NetworkManager), not ad hoc.

### ifconfig?

`ifconfig` (from `net-tools`) still works where it's installed, but it isn't on most minimal images, and it shows only one IPv4 address per interface, so addresses added with `ip addr add` don't appear without a label. When `ifconfig` and `ip` disagree, `ip` is right. Equivalents: `ifconfig` → `ip addr`, `ifconfig -a` → `ip link`, `ifconfig eth0 up` → `ip link set eth0 up`.

**Warning:** `ip link set <iface> down` on the interface your SSH session uses cuts you off, and taking a link down removes the routes through it. When it comes back up, the default route and other static routes return only if your network manager re-applies them. To re-apply configuration properly, use the network manager; see Restart networking below.

---

## DNS and the local route

```bash
getent hosts api.internal.example.com     # what the system resolver returns
ip route get 10.0.1.50                    # which interface and gateway the client will use
# 10.0.1.50 via 10.0.1.1 dev ens5 src 10.0.1.10 uid 0
```

`getent` uses the same resolution path as most applications (`/etc/hosts`, then DNS per `/etc/nsswitch.conf`), which `dig` doesn't. If the name resolves to an unexpected IP, or not at all, fix that first; see [DNS not resolving](/blog/dns-not-resolving-linux-fix).

`ip route get` should show a sensible `dev` and `via`. It also accounts for policy routing and more specific routes, so it's the real answer to "which interface is my default". `Network is unreachable` here means the client has no matching route, typically a missing default gateway or a VPN that isn't up.

---

## Is the host reachable? ping

```bash
ping -c 4 -W 2 10.0.1.20
```

```
64 bytes from 10.0.1.20: icmp_seq=1 ttl=64 time=0.412 ms
...
4 packets transmitted, 4 received, 0% packet loss, time 3062ms
rtt min/avg/max/mdev = 0.388/0.399/0.412/0.009 ms
```

`-c` sets the count (Linux ping runs forever without it), `-W` the per-reply timeout in seconds.

A reply means routing works in both directions for ICMP, and gives you latency and jitter (`mdev`). For **packet loss**, run longer: `ping -c 100 -i 0.2 host`. It says nothing about whether any port is open, or whether a firewall allows your TCP traffic: ICMP and TCP are filtered separately.

**No reply is inconclusive**: host down, routing broken, or ICMP filtered. Many cloud security groups and Windows hosts drop ICMP by default. Don't call a host down on ping alone; the port test is what counts.

---

## traceroute and mtr: where packets stop

When a connection times out, or works but is slow, traceroute shows each router hop. The tricky part is reading it: most `* * *` lines and most scary latency spikes in the middle of a trace are harmless.

Install with `sudo apt install traceroute mtr-tiny` (Debian/Ubuntu) or `sudo dnf install traceroute mtr` (RHEL family). `tracepath` (from `iputils`) is often already installed and needs no root.

### How traceroute works

```
probe TTL=1 ──► router 1 decrements to 0, drops it, sends back ICMP "time exceeded"  → hop 1
probe TTL=2 ──► router 1 ──► router 2 drops it, sends ICMP back                     → hop 2
probe TTL=3 ──► ...                                                                    → hop 3
...until the destination itself answers
```

Each line is the router that discarded a probe, and the three times are three probes. Two consequences:

- A hop's reply is generated by that router's **CPU** (control plane), which is often rate-limited and low priority. Your real traffic is forwarded in hardware and never waits for that CPU.
- You see only the **forward** path. The replies, and your real return traffic, may come back a different way.

### Read the output

```bash
traceroute -n api.example.com
```

```
traceroute to api.example.com (203.0.113.80), 30 hops max, 60 byte packets
 1  10.0.1.1       0.412 ms  0.388 ms  0.371 ms
 2  100.64.0.1     1.902 ms  1.877 ms  1.861 ms
 3  * * *
 4  198.51.100.9   8.214 ms  8.301 ms  8.190 ms
 5  198.51.100.33  41.880 ms  9.102 ms  9.015 ms
 6  203.0.113.80   9.488 ms  9.402 ms  9.431 ms
```

Use `-n` to skip reverse DNS lookups; it's much faster and avoids misleading names.

| What you see | What it usually means |
|---|---|
| `* * *` on a middle hop, later hops answer | That router doesn't send ICMP time-exceeded, or rate-limits it. Not a problem |
| `* * *` from some hop **to the end** | Probes, or their replies, are dropped from there on. Could be a firewall, or just a destination that doesn't answer this probe type |
| One slow probe on one hop (`41.880 ms` above) | Control-plane delay on that router. Ignore it if later hops are fast |
| Latency jumps at a hop and **stays** high after it | Real: a long-distance link or a congested segment starts there |
| `!H`, `!N`, `!P` | Host, network, or protocol unreachable reported by a router |
| `!X` | Communication administratively prohibited: a firewall said no |

The rule: **a problem at hop N only matters if it carries through to every hop after N, including the destination.**

### Use the probe type your traffic uses

Linux `traceroute` sends UDP probes to high ports by default. Firewalls treat those very differently from your real HTTPS or database traffic. Tracing with TCP SYNs to the real port follows the path your application uses:

```bash
sudo traceroute -n -T -p 443 api.example.com     # TCP SYN (needs root)
sudo traceroute -n -I api.example.com            # ICMP echo, like Windows tracert
traceroute -6 -n api.example.com                 # force IPv6
```

- UDP trace stops at hop 8, TCP trace to 443 reaches the destination: UDP/ICMP is filtered, the path for your service is fine.
- Both stop at the same hop: something there, or right after it, is dropping traffic to that destination.
- TCP trace reaches the destination but your app still fails: the network path is fine; test the TCP connection and check what's listening.

### mtr: loss over time, not three samples

Three probes per hop aren't enough to see intermittent loss. `mtr` keeps probing and keeps statistics:

```bash
mtr -n -rwc 100 api.example.com                  # report: 100 cycles, wide output
sudo mtr -n -T -P 443 -rwc 100 api.example.com   # TCP to port 443
```

```
HOST: web01                Loss%   Snt   Last   Avg  Best  Wrst StDev
  1.|-- 10.0.1.1            0.0%   100    0.4   0.4   0.3   0.9   0.1
  2.|-- 100.64.0.1          0.0%   100    1.9   2.0   1.8   4.1   0.3
  3.|-- ???                100.0   100    0.0   0.0   0.0   0.0   0.0
  4.|-- 198.51.100.9       38.0%   100    8.3   8.4   8.1  12.6   0.6
  5.|-- 198.51.100.33       0.0%   100    9.1   9.6   8.9  44.2   3.8
  6.|-- 203.0.113.80        0.0%   100    9.4   9.5   9.3  10.8   0.2
```

Hop 4 shows 38% loss, yet hops 5 and 6 show none. If hop 4 were really dropping 38% of packets, everything behind it would lose at least as much. So hop 4 is rate-limiting ICMP replies. **Look at the loss on the final hop first.** If the destination shows 0%, there's no path loss. Real loss starts at some hop and every hop after it, including the destination, shows similar or higher loss.

Run mtr from both ends if you can. Because the return path can differ, loss that only appears in one direction is common and only visible this way.

### tracepath: no root, and it finds MTU problems

`tracepath -n api.example.com` prints a `pmtu` value that shows where the path MTU drops, for example to 1420 at hop 2, typical for a VPN or tunnel. That explains the classic symptom of SSH logging in fine but hanging on large output, or TLS handshakes stalling: small packets pass, full-size ones don't, and the ICMP "fragmentation needed" messages are being filtered.

---

## Test a TCP connection: nc, curl, /dev/tcp

The app logs say it can't reach the database. Answer one question from the machine that's failing: can it open a TCP connection to that host and port at all?

| Tool | Command | When |
|---|---|---|
| `nc` | `nc -zv -w 3 HOST PORT` | Default choice |
| bash | `timeout 3 bash -c '</dev/tcp/HOST/PORT'` | No nc installed, but bash is |
| `curl` | `curl -sv --connect-timeout 3 telnet://HOST:PORT` | Containers that only have curl |
| `telnet` | `telnet HOST PORT` | Interactive, e.g. typing SMTP or Redis commands |
| `openssl` | `openssl s_client -connect HOST:443` | You also need to check TLS |

### nc

```bash
nc -zv -w 3 10.0.1.20 5432
```

`-z` connects, then closes without sending data; `-v` prints the result; `-w 3` gives up after 3 seconds. On Debian/Ubuntu, `nc` is usually the OpenBSD version:

```
Connection to 10.0.1.20 5432 port [tcp/postgresql] succeeded!
nc: connect to 10.0.1.20 port 5432 (tcp) failed: Connection refused
nc: connect to 10.0.1.20 port 5432 (tcp) timed out: Operation now in progress
```

On RHEL, Rocky and Fedora, `nc` is Nmap's `ncat`, which prints things like `Ncat: Connected to 10.0.1.20:5432.` and `Ncat: Connection refused.` Older ncat builds don't support `-z`; use `nc -w 3 HOST PORT </dev/null` instead.

**UDP is different.** `nc -zvu -w 3 10.0.1.53 53` "succeeds" almost always. UDP has no handshake, so `nc` can only report failure if an ICMP port-unreachable comes back. Silence is not proof the port is open. To test a UDP service, talk its protocol: `dig @10.0.1.53 example.com` for DNS, `chronyc` or `ntpdate -q` for NTP.

### bash /dev/tcp (no extra packages)

```bash
timeout 3 bash -c '</dev/tcp/10.0.1.20/5432' && echo open || echo "closed or filtered"
```

`/dev/tcp/HOST/PORT` isn't a real file. It's a bash feature that opens a TCP connection when you redirect to it. It only works in **bash**: Alpine's `sh` (BusyBox ash) and Debian's `dash` don't have it, so always invoke it through `bash -c`. Useful inside containers where nothing else is installed:

```bash
docker exec myapp bash -c 'timeout 3 bash -c "</dev/tcp/db/5432" && echo open'
```

### curl

For an HTTP service, test the service, not just the port:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 3 --max-time 10 https://api.example.com/health
```

A `200` here means DNS, routing, the TCP port, TLS (certificate valid for that name, trusted chain) and the application all worked. When it fails, curl's error says which layer broke:

| curl error | Layer |
|---|---|
| `(6) Could not resolve host` | DNS |
| `(7) Failed to connect ... Connection refused` | TCP: nothing listening |
| `(28) Connection timed out` | TCP: filtered or unreachable |
| `(60) SSL certificate problem` | TLS: expired, self-signed, wrong chain |
| `(35)` / handshake errors | TLS: protocol or cipher mismatch |
| HTTP `502`/`503`/`504` | Reached a proxy; the app behind it failed |

For any other TCP port, `curl`'s telnet scheme works as a raw connect test:

```bash
curl -sv --connect-timeout 3 --max-time 5 telnet://10.0.1.20:5432 </dev/null
# *   Trying 10.0.1.20:5432...
# * Connected to 10.0.1.20 (10.0.1.20) port 5432
```

`Connected to` is the line that matters. The command may then wait until `--max-time` because nothing is sent; that's expected.

Find the slow phase:

```bash
curl -o /dev/null -sS -w 'dns:     %{time_namelookup}\nconnect: %{time_connect}\ntls:     %{time_appconnect}\nttfb:    %{time_starttransfer}\ntotal:   %{time_total}\n' https://api.example.com/
```

The values are cumulative from the start of the request, so subtract consecutive lines: `ttfb - tls` is time spent waiting for the server to start responding.

Testing one backend behind a load balancer, or a vhost before DNS points to it:

```bash
curl -sv --resolve api.example.com:443:10.0.1.31 https://api.example.com/health
```

`--resolve` is better than an IP plus a `Host:` header for HTTPS, because it also sends the right SNI and validates the certificate against the real name. Watch for redirects: an `http://` URL often returns `301` to HTTPS. Add `-L` to follow it, or test the `https://` URL directly.

### telnet

```bash
telnet 10.0.1.20 5432
# Trying 10.0.1.20...
# Connected to 10.0.1.20.
# Escape character is '^]'.
```

`Connected` means the three-way handshake completed: something is listening and the path allows TCP to that port. It doesn't mean the service is healthy. A hung application whose kernel still accepts connections into the backlog will look fine here.

Exit with `Ctrl+]`, then `quit`. telnet is rarely installed by default anymore and has no timeout option. Where it still earns its place: talking a text protocol by hand. Connect to port 25 and type `EHLO test`, or to Redis on 6379 and type `PING`. You see the server's real reply.

### TLS ports

A successful TCP connect on 443 says nothing about the certificate. Check both at once:

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

`-servername` sends SNI. Without it, a server hosting several sites may hand you the wrong certificate.

### Test from the right place

`curl http://10.0.1.50:8080` or `nc -zv localhost 8080` run **on** the server goes over the loopback interface. It skips the cloud firewall and usually most of the host firewall too, and works even when the app is bound to `127.0.0.1`. It tells you the app works, not that remote clients can reach it. Test from the client host, or as close to it as you can get.

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

## Connection refused: is it listening, and where?

Log in to the server:

```bash
sudo ss -tlnp 'sport = :8080'
systemctl status myapp
```

Three possible outcomes:

**Nothing listening.** The service isn't running, crashed at start, or listens on a different port. Check `journalctl -u myapp -n 50` and the app's config. If it failed with `address already in use`, see [port already in use](/blog/check-open-ports-linux).

**Listening on `127.0.0.1:8080`.** The most common cause of "it works on the server but not from outside". Loopback-only listeners reject every remote client. Change the bind address in the app config (`0.0.0.0`, `::`, or the server's specific IP) and restart. Many frameworks default to localhost: Flask's dev server, Rails in development, and anything started with `--host localhost`.

**Listening on `0.0.0.0` or the right IP.** Then the refusal comes from something else:

- a host firewall with a REJECT rule. Many iptables setups reject with `icmp-port-unreachable`, which the client reports as "refused";
- fail2ban, which by default bans with exactly such a REJECT rule;
- the client reaching a different host than you think (DNS, stale `/etc/hosts`, a load balancer whose backend is down).

The [open ports guide](/blog/check-open-ports-linux) explains how to read the Local Address column in detail.

---

## Connection timed out: find where packets disappear

A timeout means no answer came back at all. Find out whether the SYN even reaches the server. On the server:

```bash
sudo tcpdump -ni any 'tcp port 8080 and tcp[tcpflags] & tcp-syn != 0'
```

Then connect from the client.

| What tcpdump shows | Meaning |
|---|---|
| Nothing | Packets are dropped **before** the server: cloud security group / NACL, network firewall, wrong route, or wrong IP |
| SYN arrives, no SYN-ACK goes out | Dropped **on** the server: host firewall (DROP), or an accept queue that's overflowing |
| SYN arrives, SYN-ACK goes out, client still times out | The reply is lost on the way back: asymmetric routing, or a firewall on the return path |

tcpdump sees incoming packets before the host firewall does, so a SYN that shows up in the capture can still be dropped by nftables/iptables afterwards. If nothing arrives, a TCP-mode traceroute or mtr from the client shows where along the path it stops.

### Check the host firewall

```bash
sudo nft list ruleset | less               # nftables (default backend on current distros)
sudo iptables -S INPUT                     # iptables / iptables-nft view
sudo firewall-cmd --list-all               # RHEL family (firewalld)
sudo ufw status verbose                    # Ubuntu (ufw)
```

Open the port with the tool that manages the host, so the rule survives a reboot:

```bash
sudo firewall-cmd --permanent --add-port=8080/tcp && sudo firewall-cmd --reload   # firewalld
sudo ufw allow 8080/tcp                                                          # ufw
```

Avoid ad-hoc `iptables -I` rules on a host that runs firewalld or ufw. They aren't persistent and the manager can overwrite them on the next reload. More in [check firewall status](/blog/iptables-block-ip-example).

### Check the cloud layer

AWS security groups and NACLs, Azure NSGs and GCP firewall rules sit outside the VM. `nft list ruleset` can be empty and traffic still never arrives. If tcpdump on the server sees nothing, check these next.

---

## Intermittent timeouts under load

The service works when quiet and drops connections at peak. Check the accept queue:

```bash
ss -tln 'sport = :8080'
# State   Recv-Q  Send-Q  Local Address:Port ...
# LISTEN  129     128     0.0.0.0:8080
nstat -az TcpExtListenOverflows TcpExtListenDrops
```

On a listener, `Send-Q` is the backlog limit and `Recv-Q` is how many connections are waiting to be accepted. When Recv-Q reaches Send-Q and the overflow counters keep rising, the kernel is dropping new SYNs. Clients see timeouts, not refusals.

The effective backlog is the **smaller** of the application's `listen()` backlog and `net.core.somaxconn`. Raising only the sysctl changes nothing if the app asks for 128:

```bash
echo 'net.core.somaxconn = 4096' | sudo tee /etc/sysctl.d/90-backlog.conf
sudo sysctl --system
# then raise the app's backlog too (e.g. NGINX: listen 8080 backlog=4096;) and restart it
```

Usually the real fix is that the app accepts too slowly (blocked workers, CPU saturation). The backlog only absorbs bursts.

If the failures are on the *client* side, on outgoing connections, with `Cannot assign requested address`, that's ephemeral port exhaustion: see [TIME_WAIT explained](/blog/linux-time-wait-explained).

---

## Restart networking: the right command per distro

You edited the network config, ran a restart command, and nothing changed. Or worse, the SSH session froze. Linux doesn't have one "network service". Depending on the distro there are four different things that might own your interfaces, and a restart command for the wrong one either does nothing or fails with `Unit not found`.

### What manages your network?

```bash
systemctl is-active NetworkManager systemd-networkd networking network 2>/dev/null
ls /etc/netplan/ 2>/dev/null
```

The first command prints one line per unit, in order; look for `active`.

| What you find | Typical systems | Apply changes with |
|---|---|---|
| `/etc/netplan/*.yaml` exists | Ubuntu 18.04+ | `netplan try` / `netplan apply` (renders to networkd or NetworkManager) |
| `NetworkManager` active | RHEL/Rocky/Alma 8+, Fedora, desktops | `nmcli` |
| `systemd-networkd` active, no netplan | Minimal/cloud images, Arch, some appliances | `networkctl` |
| `networking` active | Debian with `/etc/network/interfaces` (ifupdown) | `ifdown`/`ifup` |
| `network` active | RHEL/CentOS 7 and older | `systemctl restart network` |

Edit the config in the place that manager reads, and apply it with that manager's command. Editing one and restarting another is the most common reason "the restart didn't work".

### Before you touch a remote server

- Have **out-of-band access** ready: cloud serial console, IPMI/iLO, hypervisor console.
- Prefer commands that **re-apply** a configuration over taking an interface down and up.
- If you must do a down/up over SSH, run it as **one** command line so the "up" half still runs after your session drops, ideally with `nohup` or in `tmux`/`screen`.
- On Ubuntu, use `netplan try`, which rolls back automatically.

### Ubuntu with netplan

```bash
sudo netplan generate          # syntax check: renders config, no changes applied
sudo netplan try               # apply, auto-revert after 120 s unless you confirm
sudo netplan apply             # apply for real
```

If your SSH session died because the change broke connectivity, you can't press Enter, so `netplan try` reverts. Some changes, notably to bridges and bonds, may not revert cleanly, so read its warnings. Netplan writes configuration for either systemd-networkd (Ubuntu Server default) or NetworkManager (Ubuntu Desktop default), depending on `renderer:` in the YAML. Don't also edit the generated files under `/run`; they're overwritten.

### NetworkManager (RHEL family, Fedora, desktops)

```bash
nmcli connection show                         # profile names and devices
sudo nmcli connection reload                  # only needed if you edited files by hand
sudo nmcli connection up "System eth0"        # re-activate the profile with the new settings
```

`nmcli connection up` on an already-active profile re-applies it in one step, so you don't need a separate `down`. That's safer over SSH than `down && up`. For a change made with `nmcli connection modify`, `nmcli device reapply eth0` applies many settings (addresses, routes, DNS) to the live device without deactivating it.

Example: set a static IP, then apply:

```bash
sudo nmcli connection modify "System eth0" \
  ipv4.method manual \
  ipv4.addresses 10.0.1.10/24 \
  ipv4.gateway 10.0.1.1 \
  ipv4.dns "10.0.0.2 10.0.0.3"
sudo nmcli connection up "System eth0"
```

**Why `systemctl restart NetworkManager` often doesn't help:** NetworkManager is designed to keep existing connections running when the daemon restarts. Restarting it is useful when the daemon itself is misbehaving, not for applying a changed profile.

On RHEL 9 and later, new profiles are stored as keyfiles in `/etc/NetworkManager/system-connections/`. Older `ifcfg-*` files in `/etc/sysconfig/network-scripts/` are still read on RHEL 9 but are deprecated. `nmcli -f NAME,DEVICE,FILENAME connection show` tells you which file backs each profile.

### systemd-networkd without netplan

```bash
sudo networkctl reload                 # re-read .network/.netdev files
sudo networkctl reconfigure ens5       # re-apply to one interface
networkctl status ens5
```

These subcommands exist on recent systemd versions. On older ones, `sudo systemctl restart systemd-networkd` is the fallback; it briefly reconfigures every interface it manages.

### Debian with ifupdown

Configuration lives in `/etc/network/interfaces` and `/etc/network/interfaces.d/`.

```bash
sudo ifdown eth1 && sudo ifup eth1
```

For the interface you're connected through, run both in one command line from `tmux`/`screen`, or from the console. `sudo systemctl restart networking` re-runs every `auto` interface and is the most likely to drop your session. On Debian systems that also run NetworkManager, NetworkManager leaves interfaces listed in `/etc/network/interfaces` alone by default.

### RHEL/CentOS 7 legacy network service

`sudo systemctl restart network` is the initscripts service reading `/etc/sysconfig/network-scripts/ifcfg-*`. On RHEL 8 it's deprecated and not installed by default, and on RHEL 9 it's gone, so the same command returns `Unit network.service not found`. Use `nmcli` there.

### Renewing a DHCP lease

`dhclient` isn't used by default on current RHEL or Ubuntu Server, so `dhclient -r` either doesn't exist or fights the real manager. Use the manager:

```bash
sudo nmcli device reapply eth0     # NetworkManager
sudo networkctl renew ens5         # systemd-networkd (recent systemd)
```

`dhclient -r` on the interface you're connected through releases your address and drops your SSH session.

### Verify it actually applied

```bash
ip -br addr                      # expected address on the expected interface?
ip route                         # default route present and correct?
resolvectl status | grep -A2 'DNS Servers'   # on systemd-resolved systems; otherwise cat /etc/resolv.conf
ping -c 3 "$(ip route | awk '/^default/ {print $3; exit}')"   # can you reach the gateway?
```

### When the apply fails

```bash
journalctl -u NetworkManager -n 50 --no-pager      # or -u systemd-networkd, -u networking
sudo netplan --debug generate                      # netplan YAML errors
dmesg | grep -iE 'link (is )?(up|down)|eth|ens|enp' | tail -20   # driver and link messages
```

Common causes: YAML indentation in netplan (tabs aren't allowed), a profile bound to the wrong interface name after hardware changes, and two managers both configured for the same interface.

If you've lost the network entirely and have console access, bring back temporary connectivity by hand, then fix the configuration properly:

```bash
sudo ip addr add 10.0.1.10/24 dev ens5
sudo ip link set ens5 up
sudo ip route add default via 10.0.1.1
```

These changes are lost on the next reboot or apply.

Never run `nmcli networking off` over SSH: it disables networking on every interface, including yours.

---

## Common mistakes

**Reporting a `* * *` hop as the problem.** Only stars that continue to the end mean anything.

**Blaming the hop with the highest latency.** If the hops after it are faster, that router just answers ICMP slowly.

**Tracing with UDP when the app uses TCP 443.** Different probes, different firewall treatment, different conclusions. Use `-T -p`.

**Forgetting the return path.** A clean forward trace doesn't prove the reverse direction is clean.

---

## FAQ

**Can ping test a specific port?**
No. ICMP has no ports. Use `nc -zv host port`, or `curl` for HTTP.

**Why does telnet hang instead of failing?**
The SYN is being dropped silently (a firewall DROP rule or security group), so the client keeps retrying until the kernel gives up, about two minutes by default. `nc -w 3` returns in three seconds instead.

**Is telnet still safe to use for testing?**
The telnet *client* is fine for connection tests. The risk is the telnet *server* (port 23), which sends everything in clear text and shouldn't be running.

---

## Quick checklist

1. Reproduce with `nc -zv -w 3` (or `curl` for HTTP) and read the exact error.
2. Client: `ip -br addr` for the interface, `getent hosts` and `ip route get` for DNS and route.
3. Refused: on the server, `ss -tlnp`, check the bind address, REJECT rules and fail2ban.
4. Timed out: `tcpdump` on the server to see whether SYNs arrive, then the host firewall, then the cloud firewall; `mtr -T` to see where the path breaks.
5. Only under load: accept queue overflows.
6. Changed network config: apply it with the manager that owns the interface, and verify with `ip -br addr` and `ip route`.

---

*Related: [Check Open Ports on Linux](/blog/check-open-ports-linux) for reading `ss` output on the server. [SSH Connection Refused](/blog/ssh-connection-refused-linux-fix) for the SSH-specific version of this problem. It also covers the netstat to ss translations. [systemctl troubleshooting](/blog/systemctl-service-not-starting-fix) for general systemd restart problems.*
