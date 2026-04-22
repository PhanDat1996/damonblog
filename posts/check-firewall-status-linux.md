---
title: "How to Check Firewall Status in Linux: iptables, firewalld, ufw"
date: "2026-04-22"
excerpt: "Check firewall status in Linux using iptables, firewalld, and ufw — see active rules, verify port access, and diagnose whether firewall is blocking traffic."
tags: ["linux", "security", "networking", "troubleshooting", "infrastructure"]
featured: false
slug: "check-firewall-status-linux-guide"
---

Is the firewall blocking that connection? Is it even running? Different distros use different tools. Here's how to check with all three.

---

## TL;DR

```bash
# RHEL / CentOS / Rocky (firewalld)
firewall-cmd --state
firewall-cmd --list-all

# Ubuntu (ufw)
ufw status verbose

# Any system (iptables directly)
iptables -L -n --line-numbers
iptables -L INPUT -n | grep <port>
```

---

## iptables: Universal (All Distributions)

iptables is the underlying kernel firewall. All higher-level tools (firewalld, ufw) write iptables rules. You can always check at this level regardless of which manager is in use.

```bash
# Show all rules
iptables -L -n --line-numbers

# INPUT chain only (incoming traffic)
iptables -L INPUT -n --line-numbers

# Check for a specific port
iptables -L INPUT -n | grep :8080
iptables -L INPUT -n | grep "22"
```

Output:

```
Chain INPUT (policy ACCEPT)
num  target   prot  opt  source      destination
1    ACCEPT   tcp   --   0.0.0.0/0   0.0.0.0/0    tcp dpt:22
2    ACCEPT   tcp   --   0.0.0.0/0   0.0.0.0/0    tcp dpt:80
3    ACCEPT   tcp   --   0.0.0.0/0   0.0.0.0/0    tcp dpt:443
4    DROP     all   --   0.0.0.0/0   0.0.0.0/0
```

`policy ACCEPT` + no rules = all traffic allowed.
`policy DROP` at end = default deny.

**IPv6:**

```bash
ip6tables -L INPUT -n --line-numbers
```

---

## firewalld (RHEL / CentOS / Rocky / Fedora)

```bash
# Is firewalld running?
firewall-cmd --state
systemctl status firewalld

# Active zone and rules
firewall-cmd --list-all

# All zones
firewall-cmd --list-all-zones

# Check specific port
firewall-cmd --query-port=8080/tcp
# yes = allowed, no = blocked

# Check specific service
firewall-cmd --query-service=http
```

Output of `--list-all`:

```
public (active)
  target: default
  interfaces: eth0
  sources:
  services: dhcpv6-client http https ssh
  ports: 8080/tcp
  protocols:
  rich rules:
```

---

## ufw (Ubuntu / Debian)

```bash
# Status and rules
ufw status verbose

# Numbered rules (easier to delete specific ones)
ufw status numbered
```

Output:

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
8080/tcp                   DENY IN     Anywhere
```

```bash
# Check if ufw is active
systemctl status ufw
ufw status | head -1
```

---

## Check If Firewall Is Causing Connection Issues

### The test: does removing the firewall fix it?

```bash
# Temporarily allow all traffic (for testing ONLY — restore after)
# iptables
iptables -I INPUT 1 -j ACCEPT

# firewalld
firewall-cmd --set-default-zone=trusted  # TEMPORARY TEST ONLY

# ufw
ufw disable  # TEMPORARY TEST ONLY
```

If the connection works after disabling: the firewall was blocking it. Re-enable and add the correct rule.

### Count rule hits (see which rules are matching)

```bash
# Show packet/byte counts for each rule
iptables -L INPUT -n -v

# Output:
# pkts bytes target  prot  ...
# 1234 89012 ACCEPT  tcp   ...  dpt:22
#    0     0 ACCEPT  tcp   ...  dpt:8080   ← zero hits = no traffic reaching this rule
#  567 34567 DROP    all   ...
```

Zero packets on an ACCEPT rule + traffic still getting dropped = earlier DROP rule is catching it.

---

## Real Examples

### Port is blocked — find the rule

```bash
# Connection refused/timeout to port 8080
# Check if iptables has a DROP for it
iptables -L INPUT -n -v | grep -E "8080|DROP|REJECT"

# If there's a DROP rule before any ACCEPT rule for 8080:
iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT
# (adds ACCEPT at position 1, before the DROP)
```

### firewalld: add a port permanently

```bash
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload
firewall-cmd --query-port=8080/tcp
# yes
```

### ufw: allow a specific IP to a port

```bash
ufw allow from 10.0.1.50 to any port 5432
ufw status | grep 5432
```

### Check if connection is being dropped vs rejected

```bash
# Test from client
nc -zv -w 3 server 8080
# Connection timed out → firewall DROP (silently discards)
# Connection refused → firewall REJECT (sends RST) or nothing listening
```

---

## Common Mistakes

**Mistake 1: Checking iptables but using firewalld**
On RHEL with firewalld running, iptables changes you make manually get overwritten when firewalld reloads. Make changes through firewall-cmd.

**Mistake 2: `--permanent` without `--reload`**
On firewalld, `--permanent` flags don't take effect until you `--reload`:

```bash
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload   # required
```

**Mistake 3: Assuming default policy means everything is blocked**
`iptables -L INPUT -n` showing `policy ACCEPT` means the default is to accept. You need explicit DROP rules to block anything.

**Mistake 4: Not checking IPv6 firewall**
If IPv6 is in use, `iptables` shows IPv4 rules. Check `ip6tables` separately:

```bash
ip6tables -L INPUT -n
```

---

## Quick Reference

```bash
# iptables (all distros)
iptables -L INPUT -n -v                  # rules with hit counts
iptables -L INPUT -n | grep <port>      # specific port

# firewalld (RHEL/CentOS)
firewall-cmd --state                     # running?
firewall-cmd --list-all                  # active rules
firewall-cmd --query-port=8080/tcp       # specific port allowed?
firewall-cmd --permanent --add-port=8080/tcp && firewall-cmd --reload

# ufw (Ubuntu)
ufw status verbose                       # all rules
ufw allow 8080/tcp                       # allow port
ufw deny 8080/tcp                        # deny port
ufw status numbered                      # numbered for easy deletion
```

---

## Conclusion

`iptables -L INPUT -n -v` works everywhere and shows actual packet counts — it tells you not just what rules exist but which ones are matching traffic. For firewalld, use `firewall-cmd --list-all`. For ufw, `ufw status verbose`. When debugging a blocked connection, add `-v` to iptables to see packet counts — a rule with zero hits means it's not being reached.

---

*Related: [iptables Block IP Example](/blog/iptables-block-ip-example) — add blocking rules. [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — firewall is step 4 in the connectivity workflow.*
