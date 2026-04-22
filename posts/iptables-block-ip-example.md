---
title: "iptables Block IP: Practical Examples for Linux"
date: "2026-04-22"
excerpt: "Block IPs with iptables — block single IP, IP range, port-specific rules, make rules persistent, and use ipset for large block lists. Real production examples."
tags: ["linux", "security", "networking", "infrastructure"]
featured: false
slug: "iptables-block-ip-example"
---

Blocking a specific IP or range is one of the most common iptables tasks — stopping a brute-force attack, blocking a scanner, or restricting access to a service. Here's exactly how to do it.

---

## TL;DR

```bash
# Block a single IP
iptables -I INPUT -s 1.2.3.4 -j DROP

# Block an IP range
iptables -I INPUT -s 1.2.3.0/24 -j DROP

# Block IP on specific port only
iptables -I INPUT -s 1.2.3.4 -p tcp --dport 22 -j DROP

# Make rules persistent
iptables-save > /etc/iptables/rules.v4
```

---

## Block a Single IP

```bash
# Drop all traffic from IP
iptables -I INPUT -s 1.2.3.4 -j DROP

# Verify
iptables -L INPUT -n | grep 1.2.3.4
# DROP  all  --  1.2.3.4  0.0.0.0/0
```

`-I INPUT` inserts at the top of the INPUT chain (position 1), before any other rules. This matters — rules are evaluated in order.

**DROP vs REJECT:**

```bash
# DROP: silently discard — attacker gets no response (better)
iptables -I INPUT -s 1.2.3.4 -j DROP

# REJECT: send "connection refused" back — faster failure for legitimate mistakes
iptables -I INPUT -s 1.2.3.4 -j REJECT
```

For blocking attackers: use DROP. They get no feedback.

---

## Block an IP Range (CIDR)

```bash
# Block /24 subnet (256 IPs)
iptables -I INPUT -s 1.2.3.0/24 -j DROP

# Block /16 subnet (65536 IPs)
iptables -I INPUT -s 1.2.0.0/16 -j DROP

# Block specific range (not aligned to CIDR — use ipset for this)
```

---

## Block by Port

```bash
# Block IP from accessing SSH only
iptables -I INPUT -s 1.2.3.4 -p tcp --dport 22 -j DROP

# Block IP from accessing web ports
iptables -I INPUT -s 1.2.3.4 -p tcp -m multiport --dports 80,443 -j DROP

# Block all traffic FROM this server TO an IP (outbound)
iptables -I OUTPUT -d 1.2.3.4 -j DROP
```

---

## Block Outbound to an IP

```bash
# Prevent this server from connecting out to a malicious host
iptables -I OUTPUT -d 1.2.3.4 -j DROP
iptables -I OUTPUT -d malicious-domain.com -j DROP
```

---

## View and Manage Rules

```bash
# List with line numbers
iptables -L INPUT -n --line-numbers

# Output:
# Chain INPUT (policy ACCEPT)
# num  target  prot  opt  source          destination
# 1    DROP    all   --   1.2.3.4         0.0.0.0/0
# 2    DROP    all   --   1.2.3.0/24      0.0.0.0/0
# 3    ACCEPT  tcp   --   0.0.0.0/0       0.0.0.0/0   dpt:22

# Delete by line number
iptables -D INPUT 1

# Delete by matching the rule
iptables -D INPUT -s 1.2.3.4 -j DROP

# Flush all INPUT rules (careful!)
iptables -F INPUT
```

---

## Make Rules Persistent

iptables rules are lost on reboot by default:

### Ubuntu/Debian

```bash
apt install iptables-persistent

# Save current rules
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6

# Rules are automatically loaded on boot
```

### RHEL/CentOS

```bash
# Save
service iptables save
# or
iptables-save > /etc/sysconfig/iptables
```

### Manual restore on boot (any system)

```bash
# Add to /etc/rc.local or a systemd service
iptables-restore < /etc/iptables/rules.v4
```

---

## ipset: Block Large Lists Efficiently

Blocking thousands of IPs with individual iptables rules is slow — every packet checks every rule. `ipset` creates a hash table the kernel can search in O(1):

```bash
# Install
apt install ipset

# Create an IP set
ipset create blocklist hash:ip

# Add IPs to the set
ipset add blocklist 1.2.3.4
ipset add blocklist 5.6.7.8
ipset add blocklist 9.10.11.12

# Add a network range
ipset add blocklist 1.2.3.0/24

# One iptables rule matches all IPs in the set
iptables -I INPUT -m set --match-set blocklist src -j DROP

# List set contents
ipset list blocklist

# Save and restore
ipset save > /etc/ipset.conf
ipset restore < /etc/ipset.conf
```

---

## Real Examples

### Block a brute-force attacker immediately

```bash
# See who's hammering SSH
sudo lastb -i | awk '{print $3}' | sort | uniq -c | sort -rn | head

# Block the top offender
iptables -I INPUT -s 185.224.12.34 -j DROP
iptables-save > /etc/iptables/rules.v4
```

### Rate-limit SSH instead of blocking entirely

Better than blocking: allow SSH but limit connection rate:

```bash
# Allow 3 new SSH connections per minute per IP
iptables -I INPUT -p tcp --dport 22 -m state --state NEW \
  -m recent --set --name SSH

iptables -I INPUT -p tcp --dport 22 -m state --state NEW \
  -m recent --update --seconds 60 --hitcount 4 --name SSH \
  -j DROP
```

### Block a country (with ipset + IP list)

```bash
# Download country IP list (example: CN block list)
wget -q https://www.ipdeny.com/ipblocks/data/countries/cn.zone

# Create ipset for country
ipset create cn_block hash:net

# Add all ranges from the list
while read ip; do
  ipset add cn_block "$ip" 2>/dev/null
done < cn.zone

# One iptables rule blocks the whole country
iptables -I INPUT -m set --match-set cn_block src -j DROP
```

---

## Common Mistakes

**Mistake 1: Not testing before making rules permanent**
Wrong rules can lock you out. Test first, then save.

**Mistake 2: Using `-A` instead of `-I` for block rules**
`-A` appends to the end. If there's an ACCEPT rule above it, the DROP is never reached. Use `-I` to insert at the top.

**Mistake 3: Not blocking IPv6**
If you block an IP in iptables but not ip6tables, the attacker can use IPv6:

```bash
ip6tables -I INPUT -s 2001:db8::1/48 -j DROP
```

**Mistake 4: Blocking your own IP**
Always have an out-of-band access path (console, cloud control panel) before adding DROP rules.

---

## Quick Reference

```bash
# Block single IP
iptables -I INPUT -s 1.2.3.4 -j DROP

# Block range
iptables -I INPUT -s 1.2.3.0/24 -j DROP

# Block on specific port
iptables -I INPUT -s 1.2.3.4 -p tcp --dport 22 -j DROP

# List rules with numbers
iptables -L INPUT -n --line-numbers

# Delete by number
iptables -D INPUT 1

# Save
iptables-save > /etc/iptables/rules.v4
```

---

## Conclusion

`iptables -I INPUT -s <ip> -j DROP` blocks a single IP. Use `-I` (insert) not `-A` (append) so the rule appears before any ACCEPT rules. Save with `iptables-save` immediately after testing. For blocking hundreds of IPs, use `ipset` — one iptables rule + a hash set is orders of magnitude faster than hundreds of individual rules.

---

*Related: [How to Check Firewall Status Linux](/blog/check-firewall-status-linux-guide) — verify rules are applied correctly. [SSH Connection Refused Linux Fix](/blog/ssh-connection-refused-linux-fix) — if you accidentally block yourself.*
