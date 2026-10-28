---
title: "Cannot Connect to Server on Linux: Diagnose by Error"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Connection refused, timed out or no route to host? Each error points to a different layer. Work through client, network and server checks in order."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
category: "linux"
---

The service is "up" according to everyone you ask, and the client still can't connect. Before you restart anything, look closely at the exact error. `Connection refused` and `Connection timed out` sound similar but point at completely different parts of the path, and treating one like the other wastes the first hour of most outages.

---

## Start with the exact error

Reproduce it from the client with a short timeout:

```bash
nc -zv -w 3 10.0.1.50 8080
# or for HTTP
curl -sv --connect-timeout 3 http://10.0.1.50:8080/health
```

| Error | What it means | Go to |
|---|---|---|
| `Name or service not known` / `Could not resolve host` | DNS failed; no packet was sent to the server | Step 1 |
| `Network is unreachable` | The client has no route to that network | Step 1 |
| `Connection refused` | The server host (or a firewall) actively rejected with RST/ICMP | Step 3 |
| `Connection timed out` / hangs | Packets are silently dropped somewhere | Step 4 |
| `No route to host` | ICMP host-unreachable: firewalld's default reject, or ARP failing | Step 4 |

---

## Step 1: DNS and the local route

```bash
getent hosts api.internal.example.com     # what the system resolver returns
ip route get 10.0.1.50                    # which interface and gateway the client will use
```

`getent` uses the same resolution path as most applications (`/etc/hosts`, then DNS per `/etc/nsswitch.conf`), which `dig` doesn't. If the name resolves to an unexpected IP, or not at all, fix that first; see [DNS not resolving](/blog/dns-not-resolving-linux-fix).

`ip route get` should show a sensible `dev` and `via`. `Network is unreachable` here means the client has no matching route, typically a missing default gateway or a VPN that isn't up. [Check network interfaces](/blog/check-network-interface-linux) if the interface itself looks wrong.

---

## Step 2: is the host reachable?

```bash
ping -c 3 -W 2 10.0.1.50
```

A reply means the host is up and routing works. **No reply is inconclusive**: ICMP is often filtered while TCP still works. Don't stop here either way; the port test in the first section is what counts. If you need to know where along the path packets stop, use [traceroute or mtr](/blog/traceroute-linux-examples), ideally in TCP mode to the real port.

---

## Step 3: on the server, is it listening, and where?

This is the `Connection refused` path. Log in to the server:

```bash
sudo ss -tlnp 'sport = :8080'
systemctl status myapp
```

Three possible outcomes:

**Nothing listening.** The service isn't running, crashed at start, or listens on a different port. Check `journalctl -u myapp -n 50` and the app's config. If it failed with `address already in use`, see [port already in use](/blog/port-already-in-use-linux-fix).

**Listening on `127.0.0.1:8080`.** The most common cause of "it works on the server but not from outside". Loopback-only listeners reject every remote client. Change the bind address in the app config (`0.0.0.0`, `::`, or the server's specific IP) and restart. Many frameworks default to localhost: Flask's dev server, Rails in development, and anything started with `--host localhost`.

**Listening on `0.0.0.0` or the right IP.** Then the refusal comes from something else:

- a host firewall with a REJECT rule. Many iptables setups reject with `icmp-port-unreachable`, which the client reports as "refused";
- fail2ban, which by default bans with exactly such a REJECT rule;
- the client reaching a different host than you think (DNS, stale `/etc/hosts`, a load balancer whose backend is down).

The [open ports guide](/blog/check-open-ports-linux) explains how to read the Local Address column in detail.

---

## Step 4: timeouts: find where packets disappear

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

tcpdump sees incoming packets before the host firewall does, so a SYN that shows up in the capture can still be dropped by nftables/iptables afterwards.

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

Avoid ad-hoc `iptables -I` rules on a host that runs firewalld or ufw. They aren't persistent and the manager can overwrite them on the next reload. More in [check firewall status](/blog/check-firewall-status-linux).

### Check the cloud layer

AWS security groups and NACLs, Azure NSGs and GCP firewall rules sit outside the VM. `nft list ruleset` can be empty and traffic still never arrives. If tcpdump on the server sees nothing, check these next.

### Testing from the server itself proves less than you think

`curl http://10.0.1.50:8080` run **on** 10.0.1.50 goes over the loopback interface. It skips the cloud firewall and usually most of the host firewall too. It tells you the app works, not that remote clients can reach it.

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

## Quick checklist

1. Reproduce with `nc -zv -w 3` and read the exact error.
2. Client: `getent hosts` and `ip route get`.
3. Refused: on the server, `ss -tlnp`, check the bind address, REJECT rules and fail2ban.
4. Timed out: `tcpdump` on the server to see whether SYNs arrive, then the host firewall, then the cloud firewall.
5. Only under load: accept queue overflows.

---

*Related: [Test a TCP Connection](/blog/test-tcp-connection-linux) for nc, curl and /dev/tcp in detail. [SSH Connection Refused](/blog/ssh-connection-refused-linux-fix) for the SSH-specific version of this problem.*
