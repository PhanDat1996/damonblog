---
title: "Linux Firewall: Check Status, Read Rules and Block IPs"
date: "2026-04-22"
updated: "2026-11-02"
excerpt: "Find which firewall is active (ufw, firewalld, nftables), read its real rules, prove it blocks your port, then block IPs with iptables and ipset safely."
tags: ["linux", "security", "networking", "infrastructure", "troubleshooting"]
featured: false
category: "security"
---

A connection to port 8080 times out and someone says "it's probably the firewall." Or an address is hammering your SSH port and you want it gone now. Either way, answer two questions first: **which** firewall is actually active on this box, and **is it really the one handling the traffic?**

That is harder than it used to be. On current distributions `iptables -L` can show an empty ruleset while firewalld is dropping packets, because firewalld writes nftables rules that `iptables` doesn't display. Blocking an IP is one line. The parts that go wrong are where the rule lands in the chain, whether it survives a reboot, and whether `iptables` is even the right tool on this machine.

---

## Quick answer

```bash
# Check which firewall is active and read its rules
systemctl is-active firewalld ufw nftables 2>/dev/null   # which manager is running
ufw status verbose                                         # Ubuntu / Debian with ufw
firewall-cmd --state && firewall-cmd --list-all            # RHEL, Rocky, Alma, Fedora
nft list ruleset                                           # everything the kernel enforces

# Block with plain iptables (no firewalld/ufw active)
iptables -I INPUT -s 203.0.113.45 -j DROP                       # block one IP
iptables -I INPUT -s 203.0.113.0/24 -j DROP                     # block a subnet
iptables -I INPUT -s 203.0.113.45 -p tcp --dport 22 -j DROP     # block one port only
iptables -L INPUT -n -v --line-numbers                          # verify, with hit counters
iptables-save > /etc/iptables/rules.v4                          # persist (Debian/Ubuntu)
```

`nft list ruleset` is the ground truth on any modern kernel. Whatever wrote the rules (firewalld, ufw via iptables-nft, Docker, Kubernetes), the rules show up there.

On RHEL/Rocky/Alma with firewalld running, or Ubuntu with ufw active, block with that tool instead (see below). Mixing raw `iptables` rules with a firewall manager leads to rules that vanish or never match.

> **Before you add any DROP rule on a remote server:** make sure the address isn't yours, your VPN egress, or your bastion, and know how you'd get to a console if it is.

---

## Check firewall status

### Which firewall is this box using?

| Distribution | Default manager | Backend |
|---|---|---|
| RHEL / Rocky / Alma 8 and 9 | firewalld (enabled) | nftables |
| Fedora | firewalld | nftables |
| Ubuntu 22.04 / 24.04 | ufw (installed, **inactive** by default) | iptables-nft |
| Debian 11 / 12 | none enabled by default | nftables available |
| Cloud VMs (any distro) | plus security groups / NSGs **outside** the VM | n/a |

```bash
systemctl is-active firewalld ufw 2>/dev/null
iptables -V
# iptables v1.8.7 (nf_tables)    <- rules live in nftables
# iptables v1.8.4 (legacy)       <- old x_tables backend
```

- firewalld active → use `firewall-cmd`.
- ufw active → use `ufw`.
- Neither → plain `iptables` is fine. `(nf_tables)` just means the rules are stored in nftables behind the scenes. The commands work the same.

With `(nf_tables)`, `iptables -L` only shows rules created through the iptables interface. firewalld's own tables are only visible with `nft list ruleset`.

### ufw (Ubuntu, Debian)

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

### firewalld (RHEL family, Fedora)

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

### iptables and nftables directly

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

### Test with a targeted, temporary rule

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

## Block a single IP or a subnet with iptables

```bash
iptables -I INPUT -s 203.0.113.45 -j DROP
iptables -I INPUT -s 198.51.100.0/24 -j DROP
```

`-I INPUT` inserts at position 1. Order matters because iptables stops at the first matching rule with a final target like ACCEPT or DROP. Use `-A` (append) and your DROP lands after an existing `ACCEPT tcp dpt:22` and never matches for SSH.

Verify, and check it's actually catching traffic:

```bash
iptables -L INPUT -n -v --line-numbers
```

```
Chain INPUT (policy ACCEPT 0 packets, 0 bytes)
num   pkts bytes target  prot opt in  out  source            destination
1       38  2280 DROP    all  --  *   *    198.51.100.0/24   0.0.0.0/0
2      214 12840 DROP    all  --  *   *    203.0.113.45      0.0.0.0/0
3     9921  873K ACCEPT  tcp  --  *   *    0.0.0.0/0         0.0.0.0/0     tcp dpt:22
```

A rising `pkts` counter on your DROP rule confirms it works.

### DROP or REJECT?

| Target | What the sender sees | Use when |
|---|---|---|
| `DROP` | Nothing. The connection hangs until it times out | Blocking hostile scanners and brute-force sources |
| `REJECT` | An immediate error (ICMP port unreachable by default, or `--reject-with tcp-reset`) | Blocking internal clients, so they fail fast instead of hanging |

DROP doesn't make you invisible. A scanner can still tell something is filtering. It just costs them time.

---

## Block one IP from one port

```bash
# SSH only
iptables -I INPUT -s 203.0.113.45 -p tcp --dport 22 -j DROP

# Web ports only
iptables -I INPUT -s 203.0.113.45 -p tcp -m multiport --dports 80,443 -j DROP
```

---

## Block outbound traffic to an IP

```bash
iptables -I OUTPUT -d 192.0.2.66 -j DROP
```

You can pass a hostname (`-d bad.example.com`), but iptables resolves it **once**, when the rule is added, and stores the IPs. If the host changes IPs, the rule doesn't follow. For domains, block at DNS or in a proxy instead.

---

## Remove a block

```bash
iptables -L INPUT -n --line-numbers     # find the number
iptables -D INPUT 2                     # delete rule 2

# or delete by repeating the exact rule spec
iptables -D INPUT -s 203.0.113.45 -j DROP
```

> **Warning:** `iptables -F INPUT` flushes every rule in the chain. If the chain policy is `DROP`, flushing removes your SSH ACCEPT rule too and cuts you off immediately. Delete individual rules instead, or set `iptables -P INPUT ACCEPT` before any flush.

---

## Make the rules survive a reboot

Rules added with `iptables` live in the kernel only. A reboot clears them.

**Debian / Ubuntu (no ufw):**

```bash
apt install iptables-persistent
iptables-save  > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6
```

`netfilter-persistent` loads these files at boot. Run `netfilter-persistent save` after future changes.

**RHEL family without firewalld:** install `iptables-services`, then `service iptables save` writes `/etc/sysconfig/iptables`. Only do this if you have deliberately disabled firewalld. Running both gives you two rule managers fighting over the same packets.

---

## Block an IP when firewalld or ufw is running

**firewalld:**

```bash
# Drop all traffic from an address (permanent + live)
firewall-cmd --permanent --zone=drop --add-source=203.0.113.45
firewall-cmd --reload

# Or a rich rule in the zone your interface uses
firewall-cmd --permanent --zone=public \
  --add-rich-rule='rule family="ipv4" source address="203.0.113.45" drop'
firewall-cmd --reload
```

Adding a source to the `drop` zone sends every packet from that source through the drop zone, regardless of interface.

**ufw:**

```bash
ufw insert 1 deny from 203.0.113.45
ufw status numbered
```

`insert 1` matters for the same reason `-I` does: ufw evaluates rules in order, and a plain `ufw deny` is appended after your existing `allow` rules.

---

## ipset: block thousands of addresses with one rule

Every iptables rule is checked in sequence. Ten thousand individual DROP rules means up to ten thousand comparisons per packet, and slow rule reloads. `ipset` stores the addresses in a hash that the kernel looks up in one step, and iptables references the whole set with a single rule.

```bash
apt install ipset          # or: dnf install ipset

ipset create blocklist hash:net
ipset add blocklist 203.0.113.45
ipset add blocklist 198.51.100.0/24

iptables -I INPUT -m set --match-set blocklist src -j DROP

ipset list blocklist | head
ipset test blocklist 203.0.113.45
```

`hash:net` accepts both single IPs and CIDR ranges. `hash:ip` is for single addresses only.

Adding or removing addresses later doesn't touch iptables at all:

```bash
ipset add blocklist 192.0.2.10
ipset del blocklist 192.0.2.10
```

**Loading a large list.** Calling `ipset add` in a loop for thousands of lines is slow. Build a restore file and load it in one go:

```bash
ipset create blocklist-new hash:net -exist
sed 's/^/add blocklist-new /' blocklist.txt | ipset restore -exist
ipset swap blocklist-new blocklist       # atomic replace
ipset destroy blocklist-new
```

`swap` replaces the live set atomically, so there is no gap where nothing is blocked.

**Persistence:** the set must exist **before** the iptables rule that references it is restored, or the restore fails. On Debian/Ubuntu install `ipset-persistent`, which hooks into `netfilter-persistent` in the right order. Elsewhere, restore with `ipset restore < /etc/ipset.conf` in a unit that runs before your iptables restore.

---

## Examples

### Block the top SSH brute-force sources

```bash
# Ubuntu/Debian: the unit is "ssh"; on RHEL it's "sshd"
journalctl -u ssh --since "1 hour ago" \
  | grep -oP 'Failed password for .* from \K[0-9.]+' \
  | sort | uniq -c | sort -rn | head
#    842 203.0.113.45
#    311 198.51.100.23
```

Block the worst offenders. For this job long-term, a tool like fail2ban that adds and expires bans automatically beats manual rules.

### Rate-limit new SSH connections instead of blocking

```bash
iptables -I INPUT 1 -p tcp --dport 22 -m conntrack --ctstate NEW \
  -m recent --set --name SSH
iptables -I INPUT 2 -p tcp --dport 22 -m conntrack --ctstate NEW \
  -m recent --update --seconds 60 --hitcount 4 --name SSH -j DROP
```

The first rule records each new connection's source. The second drops the source once it has opened four or more new connections within 60 seconds. The explicit positions `1` and `2` keep them in the right order. Two plain `-I` calls would put the second rule above the first.

> Test this from a second session. Automation that opens many short SSH connections (Ansible, rsync loops) can trip the limit.

### Block IPv6 too

```bash
ip6tables -I INPUT -s 2001:db8:1234::/48 -j DROP
ip6tables-save > /etc/iptables/rules.v6
```

If the server has a public IPv6 address and you only block IPv4, an attacker with IPv6 is unaffected.

---

## Common mistakes

**Trusting `iptables -L` on a firewalld host.** It can look empty while firewalld drops traffic. Use `firewall-cmd` or `nft list ruleset`.

**Raw iptables on a firewalld host.** The rules work until something reloads firewalld or the host reboots, and they're invisible to anyone checking with `firewall-cmd`.

**`--permanent` without `--reload`.** Permanent rules are written to config but not applied until `firewall-cmd --reload`.

**`-A` instead of `-I`.** The rule ends up after an ACCEPT and never matches. Check the counters.

**Forgetting to save.** Everything is gone after a reboot. Save right after you've confirmed the rule works.

**Forgetting IPv6.** `iptables` and `ip6tables` are separate. If clients connect over IPv6, check and block in that ruleset too. ufw shows `(v6)` lines when IPv6 is enabled.

**Forgetting the cloud firewall.** Security groups, NSGs and VPC firewall rules filter before packets reach the VM. `tcpdump` showing no SYNs is the tell.

**Expecting ufw to protect Docker ports.** Published container ports (`-p 8080:80`) are DNAT'd and go through the FORWARD path, not INPUT, so ufw's normal rules don't apply to them. Bind to `127.0.0.1:8080:80` or filter in the `DOCKER-USER` chain.

**Blocking yourself.** Check `who` / `echo $SSH_CLIENT` for your own source IP before adding broad subnet blocks.

**Huge rule lists.** Use ipset once you're past a few dozen addresses.

---

## Quick reference

```bash
systemctl is-active firewalld ufw nftables              # which manager is running
nft list ruleset                                        # every rule the kernel enforces
iptables -I INPUT -s IP -j DROP                         # block IP
iptables -I INPUT -s NET/24 -j DROP                     # block subnet
iptables -I INPUT -s IP -p tcp --dport 22 -j DROP       # block IP on one port
iptables -L INPUT -n -v --line-numbers                  # list with counters
iptables -D INPUT N                                     # delete rule N
iptables-save > /etc/iptables/rules.v4                  # persist (Debian/Ubuntu)
ipset add blocklist IP                                  # add to an ipset blocklist
```

---

## FAQ

**How do I check if the firewall is enabled on Ubuntu?**
Run `ufw status`. `Status: inactive` is the default on a fresh Ubuntu install. Also run `nft list ruleset` to see rules from other sources, such as Docker.

**How do I check firewall status on RHEL 9?**
`systemctl status firewalld` and `firewall-cmd --state` tell you whether it's running. `firewall-cmd --get-active-zones` and `firewall-cmd --list-all --zone=<zone>` show the rules that apply to each interface.

**Why is iptables -L empty when firewalld is running?**
firewalld on RHEL 8+ uses the nftables backend and creates its own `inet firewalld` table, which `iptables` doesn't display. `nft list ruleset` shows it.

---

*Related: [nftables migration guide](/blog/nftables-migration-guide) if you're moving off iptables syntax entirely. [SSH connection refused fix](/blog/ssh-connection-refused-linux-fix) if a rule went wrong and SSH stopped answering. [Cannot connect to server on Linux](/blog/cannot-connect-to-server-linux-troubleshooting) for the full connectivity checklist. For web-layer blocking and throttling, see [NGINX rate limiting](/blog/nginx-rate-limiting-config).*
