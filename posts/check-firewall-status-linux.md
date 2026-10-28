---
title: "Check Firewall Status on Linux: ufw, firewalld, nftables"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Find which firewall is active on a Linux server, read its real rules, and prove whether it is the thing blocking your port before you change anything."
tags: ["linux", "security", "networking", "troubleshooting", "infrastructure"]
featured: false
noindex: true
category: "security"
---

A connection to port 8080 times out. Someone says "it's probably the firewall." Before you add a rule or, worse, disable the firewall, answer two questions: **which** firewall is actually active on this box, and **is it really the one dropping the traffic?**

The first question is harder than it used to be. On current distributions `iptables -L` can show an empty ruleset while firewalld is dropping packets, because firewalld writes nftables rules that `iptables` doesn't display.

---

## Quick answer

```bash
systemctl is-active firewalld ufw nftables 2>/dev/null   # which manager is running
ufw status verbose                                         # Ubuntu / Debian with ufw
firewall-cmd --state && firewall-cmd --list-all            # RHEL, Rocky, Alma, Fedora
nft list ruleset                                           # everything the kernel enforces
```

`nft list ruleset` is the ground truth on any modern kernel. Whatever wrote the rules (firewalld, ufw via iptables-nft, Docker, Kubernetes), the rules show up there.

---

## Which firewall is this box using?

| Distribution | Default manager | Backend |
|---|---|---|
| RHEL / Rocky / Alma 8 and 9 | firewalld (enabled) | nftables |
| Fedora | firewalld | nftables |
| Ubuntu 22.04 / 24.04 | ufw (installed, **inactive** by default) | iptables-nft |
| Debian 11 / 12 | none enabled by default | nftables available |
| Cloud VMs (any distro) | plus security groups / NSGs **outside** the VM | n/a |

Check what `iptables` really talks to:

```bash
iptables -V
# iptables v1.8.7 (nf_tables)    <- rules live in nftables
# iptables v1.8.4 (legacy)       <- old x_tables backend
```

With `(nf_tables)`, `iptables -L` only shows rules created through the iptables interface. firewalld's own tables are only visible with `nft list ruleset`.

---

## ufw (Ubuntu, Debian)

```bash
ufw status verbose
```

```
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere (v6)
443/tcp (v6)               ALLOW IN    Anywhere (v6)
```

`Status: inactive` means ufw is not filtering anything, but other rules (Docker, a hand-written nftables file) may still be loaded. `ufw status numbered` gives rule numbers for deleting.

---

## firewalld (RHEL family, Fedora)

```bash
firewall-cmd --state             # running / not running
firewall-cmd --get-active-zones  # which zone each interface/source is in
firewall-cmd --list-all          # the DEFAULT zone only
```

```
public (active)
  target: default
  icmp-block-inversion: no
  interfaces: eth0
  sources:
  services: cockpit dhcpv6-client ssh
  ports: 8080/tcp
  protocols:
  forward: yes
  masquerade: no
  forward-ports:
  source-ports:
  icmp-blocks:
  rich rules:
```

Two things trip people up:

1. **`--list-all` shows the default zone, not necessarily the zone your interface is in.** If `--get-active-zones` puts `eth1` in `internal`, check `firewall-cmd --list-all --zone=internal`.
2. **Runtime vs permanent.** Rules added without `--permanent` work now and vanish on the next reload or reboot. Compare:

```bash
firewall-cmd --list-all --zone=public
firewall-cmd --list-all --zone=public --permanent
```

A port present in the first and missing from the second will disappear at the next `firewall-cmd --reload`.

---

## iptables and nftables directly

```bash
iptables -L INPUT -n -v --line-numbers   # with packet/byte counters
iptables -S                              # rules as the commands that created them
ip6tables -L INPUT -n -v                 # IPv6 is a separate ruleset

nft list ruleset                         # all tables, all families
nft list table inet firewalld            # just firewalld's rules
```

Sample `iptables -L INPUT -n -v --line-numbers`:

```
Chain INPUT (policy DROP 1532 packets, 91920 bytes)
num   pkts bytes target  prot opt in   out  source      destination
1     187K   21M ACCEPT  all  --  *    *    0.0.0.0/0   0.0.0.0/0    ctstate RELATED,ESTABLISHED
2      412 24720 ACCEPT  all  --  lo   *    0.0.0.0/0   0.0.0.0/0
3      389 23340 ACCEPT  tcp  --  *    *    0.0.0.0/0   0.0.0.0/0    tcp dpt:22
4        0     0 ACCEPT  tcp  --  *    *    0.0.0.0/0   0.0.0.0/0    tcp dpt:8080
```

`policy DROP` means anything that matches no rule is dropped. The counter on the policy (1532 packets) is how much traffic fell through to it. Rule 4 has zero hits, so either no traffic for 8080 reached this host, or something earlier (another table, another tool) handled it first.

---

## Is the firewall really blocking my port?

Work through this in order. Each step rules out a layer.

**1. Is anything listening, and on which address?**

```bash
ss -tlnp | grep ':8080'
# LISTEN 0  511  127.0.0.1:8080  0.0.0.0:*  users:(("node",pid=2211,fd=19))
```

Bound to `127.0.0.1` means it only accepts local connections. No firewall rule will fix that. More in [check open ports on Linux](/blog/check-open-ports-linux).

**2. Read the client's error.**

```bash
nc -zv -w 3 server.example.com 8080
```

| Client sees | Usually means |
|---|---|
| `Connection timed out` | Packets are silently dropped: host firewall DROP, cloud security group, or network ACL |
| `Connection refused` | The host answered: nothing listening, or a REJECT rule with a TCP reset / port-unreachable |
| `No route to host` (and the route exists) | Often a REJECT with an ICMP "prohibited" message, firewalld's style |

**3. Do the packets even arrive?**

```bash
tcpdump -ni eth0 'tcp port 8080'
```

Run the client test again. No SYN packets at all means the traffic is dropped **before** the host (security group, upstream firewall, wrong IP). SYNs arriving with no reply means the host firewall or the service is the problem.

**4. Watch the counters or the drop log.**

Rerun the test and see which rule or policy counter increases:

```bash
watch -n1 'iptables -L INPUT -n -v | head -15'
nft list ruleset | grep -B2 -A2 counter
```

On firewalld, log denied packets temporarily:

```bash
firewall-cmd --set-log-denied=unicast
journalctl -k -f | grep -i 'REJECT\|DROP'
# ... test, then turn it off again:
firewall-cmd --set-log-denied=off
```

---

## Test with a targeted, temporary rule

Don't disable the firewall to test. On an internet-facing server that exposes every listening service at once. Open just the port, in a way that reverts on its own:

```bash
# firewalld: runtime-only, gone after the next reload/reboot
firewall-cmd --add-port=8080/tcp

# ufw: add, test, then remove
ufw allow 8080/tcp
ufw delete allow 8080/tcp
```

If that fixes it, make it permanent the proper way (`--permanent` plus `--reload`, or keep the ufw rule).

> **Why `iptables -I INPUT -j ACCEPT` doesn't help on firewalld systems:** with nftables, each table hooks into the packet path separately. An ACCEPT in the iptables table does not stop firewalld's own table from dropping the same packet. A packet has to survive every base chain on the hook. The [nftables migration guide](/blog/nftables-migration-guide) explains this in more detail.

---

## Common mistakes

**Trusting `iptables -L` on a firewalld host.** It can look empty while firewalld drops traffic. Use `firewall-cmd` or `nft list ruleset`.

**`--permanent` without `--reload`.** Permanent rules are written to config but not applied until `firewall-cmd --reload`.

**Forgetting IPv6.** `iptables` and `ip6tables` are separate. If clients connect over IPv6, check that ruleset too. ufw shows `(v6)` lines when IPv6 is enabled.

**Forgetting the cloud firewall.** Security groups, NSGs and VPC firewall rules filter before packets reach the VM. `tcpdump` showing no SYNs is the tell.

**Expecting ufw to protect Docker ports.** Published container ports (`-p 8080:80`) are DNAT'd and go through the FORWARD path, not INPUT, so ufw's normal rules don't apply to them. Bind to `127.0.0.1:8080:80` or filter in the `DOCKER-USER` chain.

---

## FAQ

**How do I check if the firewall is enabled on Ubuntu?**
Run `ufw status`. `Status: inactive` is the default on a fresh Ubuntu install. Also run `nft list ruleset` to see rules from other sources, such as Docker.

**How do I check firewall status on RHEL 9?**
`systemctl status firewalld` and `firewall-cmd --state` tell you whether it's running. `firewall-cmd --get-active-zones` and `firewall-cmd --list-all --zone=<zone>` show the rules that apply to each interface.

**Why is iptables -L empty when firewalld is running?**
firewalld on RHEL 8+ uses the nftables backend and creates its own `inet firewalld` table, which `iptables` doesn't display. `nft list ruleset` shows it.

---

*Related: [iptables block IP examples](/blog/iptables-block-ip-example) for adding deny rules safely. [Cannot connect to server on Linux](/blog/cannot-connect-to-server-linux-troubleshooting) for the full connectivity checklist.*
