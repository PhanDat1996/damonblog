---
title: "iptables Block IP: Single IPs, Ranges, Ports and ipset"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Block an IP, a subnet or a whole list with iptables and ipset, make it survive a reboot, and avoid the rule ordering and firewalld mistakes that bite."
tags: ["linux", "security", "networking", "infrastructure"]
featured: false
category: "security"
---

An address is hammering your SSH port, or a scanner is crawling your web server, and you want it gone now. The command is one line. The parts that go wrong are where the rule lands in the chain, whether it survives a reboot, and whether `iptables` is even the right tool on this machine.

---

## TL;DR

```bash
iptables -I INPUT -s 203.0.113.45 -j DROP                       # block one IP
iptables -I INPUT -s 203.0.113.0/24 -j DROP                     # block a subnet
iptables -I INPUT -s 203.0.113.45 -p tcp --dport 22 -j DROP     # block one port only
iptables -L INPUT -n -v --line-numbers                          # verify, with hit counters

iptables-save > /etc/iptables/rules.v4                          # persist (Debian/Ubuntu)
```

On RHEL/Rocky/Alma with firewalld running, or Ubuntu with ufw active, use that tool instead (see below). Mixing raw `iptables` rules with a firewall manager leads to rules that vanish or never match.

> **Before you add any DROP rule on a remote server:** make sure the address isn't yours, your VPN egress, or your bastion, and know how you'd get to a console if it is.

---

## Check which firewall you're actually using

```bash
systemctl is-active firewalld ufw 2>/dev/null
iptables -V
# iptables v1.8.7 (nf_tables)
```

- firewalld active → use `firewall-cmd` (below).
- ufw active → use `ufw` (below).
- Neither → plain `iptables` is fine. `(nf_tables)` just means the rules are stored in nftables behind the scenes. The commands work the same.

More detail in [how to check firewall status on Linux](/blog/check-firewall-status-linux).

---

## Block a single IP or a subnet

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

## If firewalld or ufw is running

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

**`-A` instead of `-I`.** The rule ends up after an ACCEPT and never matches. Check the counters.

**Forgetting to save.** Everything is gone after a reboot. Save right after you've confirmed the rule works.

**Raw iptables on a firewalld host.** The rules work until something reloads firewalld or the host reboots, and they're invisible to anyone checking with `firewall-cmd`.

**Blocking yourself.** Check `who` / `echo $SSH_CLIENT` for your own source IP before adding broad subnet blocks.

**Huge rule lists.** Use ipset once you're past a few dozen addresses.

---

## Quick reference

```bash
iptables -I INPUT -s IP -j DROP                         # block IP
iptables -I INPUT -s NET/24 -j DROP                     # block subnet
iptables -I INPUT -s IP -p tcp --dport 22 -j DROP       # block IP on one port
iptables -L INPUT -n -v --line-numbers                  # list with counters
iptables -D INPUT N                                     # delete rule N
iptables-save > /etc/iptables/rules.v4                  # persist (Debian/Ubuntu)
ipset add blocklist IP                                  # add to an ipset blocklist
```

---

*Related: [nftables migration guide](/blog/nftables-migration-guide) if you're moving off iptables syntax entirely. [SSH connection refused fix](/blog/ssh-connection-refused-linux-fix) if a rule went wrong and SSH stopped answering. For web-layer blocking and throttling, see [NGINX rate limiting](/blog/nginx-rate-limiting-config).*
