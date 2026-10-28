---
title: "nftables Migration Guide: Move Off iptables Safely"
date: "2024-06-18"
updated: "2026-10-28"
excerpt: "Translate an iptables ruleset to native nftables, test it with an automatic rollback, and avoid the gotchas with Docker, firewalld and flush ruleset."
tags: ["firewall", "linux", "security", "networking"]
featured: false
category: "security"
---

Run `iptables -V` on a current Debian, Ubuntu or RHEL box and you'll probably see `(nf_tables)`. You're already on nftables. The kernel side moved years ago (Debian 10, RHEL 8, and Ubuntu from 21.10 default to the nftables backend). What's left is your **ruleset**: hand-written `iptables` commands, saved with `iptables-save`, loaded by `netfilter-persistent` or `iptables.service`.

Moving that ruleset to native `nft` syntax gets you one file for IPv4 and IPv6, sets instead of rule-per-IP lists, and atomic reloads. It's also an easy way to lock yourself out of a remote server. This guide covers the translation, a safe cutover, and the behavior differences that catch people.

> **If firewalld manages your firewall** (RHEL, Rocky, Alma, Fedora defaults), you don't need this. firewalld already uses the nftables backend. Keep managing it with `firewall-cmd`.

---

## Where are you now?

```bash
iptables -V                       # (nf_tables) or (legacy)
nft list ruleset | head -40       # what's actually loaded
systemctl is-enabled netfilter-persistent iptables nftables firewalld 2>/dev/null
```

The last command tells you which service loads rules at boot. Only one of them should be doing it when you're done.

---

## Step 1: Back up and translate

```bash
iptables-save  > /root/iptables.rules
ip6tables-save > /root/ip6tables.rules

iptables-restore-translate  -f /root/iptables.rules  > /root/ruleset-v4.nft
ip6tables-restore-translate -f /root/ip6tables.rules > /root/ruleset-v6.nft
```

The translator gives you a faithful 1:1 copy: separate `ip` and `ip6` tables, one rule per iptables rule. Read through the output for anything it couldn't translate and left commented out. Treat the result as a reference, not the final file. The point of migrating is to restructure it.

For single rules, `iptables-translate` shows the equivalent:

```bash
iptables-translate -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT
# nft 'add rule ip filter INPUT tcp dport 22 ct state new counter accept'
```

---

## Step 2: Write a clean ruleset

A typical web server in iptables:

```bash
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -p tcp -m multiport --dports 22,80,443 -j ACCEPT
iptables -P INPUT DROP
# ...and the same again with ip6tables
```

The nftables version, covering IPv4 and IPv6 in one `inet` table:

```
#!/usr/sbin/nft -f

# Replace only our own table. Leaves Docker/libvirt/k8s tables alone.
table inet filter
delete table inet filter

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        ct state established,related accept
        ct state invalid drop
        iif "lo" accept

        # ICMP and ICMPv6. IPv6 breaks without neighbor discovery.
        meta l4proto { icmp, ipv6-icmp } accept

        tcp dport { 22, 80, 443 } accept

        limit rate 5/second log prefix "nft-input-drop: "
        counter
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

Notes on the choices:

- **`table inet filter` / `delete table inet filter` at the top** replaces just this table on every load. The `table` line first ensures it exists, so the `delete` never fails. Many examples use `flush ruleset` instead. That also wipes the tables Docker, Kubernetes, libvirt or firewalld created, and container networking breaks until those services restart.
- **ICMPv6 must be allowed.** IPv6 uses it for neighbor discovery, the equivalent of ARP. Drop it and IPv6 stops working in confusing ways.
- **`meta l4proto`** rather than `ip6 nexthdr icmpv6`. `nexthdr` only looks at the first header and misses ICMPv6 packets that carry extension headers.
- **The log rule is rate-limited** so a port scan can't flood your journal.
- **`forward` policy drop** is right for a plain server. On a **Docker or Kubernetes host** it blocks container traffic, because containers are routed through the forward hook. Either leave out the forward chain or explicitly accept the container bridges.

Check the syntax without loading it:

```bash
nft -c -f /etc/nftables.conf
```

---

## Step 3: Cut over with an automatic rollback

> **Warning:** loading a default-drop ruleset over SSH is the classic lockout. Schedule the rollback **before** you load the new rules, and keep your current SSH session open.

```bash
# 1. Schedule a rollback in 5 minutes (needs atd running)
echo 'nft delete table inet filter; iptables-restore < /root/iptables.rules; ip6tables-restore < /root/ip6tables.rules' \
  | at now + 5 minutes

# 2. Load the new ruleset, then retire the old iptables INPUT rules
#    (new rules first, so there is no unfiltered gap)
nft -f /etc/nftables.conf
iptables  -P INPUT ACCEPT && iptables  -F INPUT
ip6tables -P INPUT ACCEPT && ip6tables -F INPUT

# 3. From a NEW terminal: ssh in, test the web ports.
# 4. Everything works? Cancel the rollback:
atq
atrm <job-number>
```

No `at`? `nohup sh -c 'sleep 300; nft delete table inet filter; iptables-restore < /root/iptables.rules' &` does the same. Kill it once you've confirmed access.

Step 2 only clears the old INPUT chain; Docker's own chains are left alone. If Docker is running, restart it after the cutover anyway so its rules are recreated cleanly next to your new table.

---

## Step 4: Switch the boot-time loader

Only one service should load firewall rules at boot.

**Debian / Ubuntu:**

```bash
systemctl disable --now netfilter-persistent   # stops loading /etc/iptables/rules.v4
systemctl enable nftables                      # loads /etc/nftables.conf
```

**RHEL family (with firewalld deliberately replaced):**

```bash
systemctl disable --now firewalld
systemctl disable --now iptables 2>/dev/null   # only if iptables-services is installed
# RHEL's nftables.service loads /etc/sysconfig/nftables.conf,
# which can include files from /etc/nftables/
systemctl enable --now nftables
```

Reboot once in a maintenance window to prove the ruleset comes back on its own.

---

## Behavior that changes when you leave iptables

### `accept` is not final across tables

In iptables you mostly lived in one `filter` table. In nftables, every **base chain** (a chain with a `hook` line) on the same hook sees the packet, in priority order. A `drop` anywhere is final. An `accept` only ends evaluation in **that** chain, and the packet continues to the next base chain on the hook.

```
packet → [priority -10 chain: accept] → [priority 0 chain: drop] → dropped
```

That's why an ACCEPT added with `iptables` doesn't override firewalld's drop, and why a second "allow" table you add won't open a port that your main table drops. Put allow rules in the chain that has the drop policy.

### Runtime changes are not saved

`nft add rule` or `nft add element` changes only the running ruleset. The next `nft -f /etc/nftables.conf` or reboot reverts it. Put permanent changes in the file. To dump the live state into a file:

```bash
nft list ruleset > /root/live-ruleset.nft
```

### Deleting rules uses handles

```bash
nft -a list chain inet filter input      # -a shows "# handle N"
nft delete rule inet filter input handle 12
```

---

## Sets: the reason to migrate

Allow SSH only from admin IPs:

```
table inet filter {
    set admin_v4 {
        type ipv4_addr
        flags interval
        elements = { 203.0.113.10, 198.51.100.0/24 }
    }

    chain input {
        type filter hook input priority filter; policy drop;

        ct state established,related accept
        iif "lo" accept
        meta l4proto { icmp, ipv6-icmp } accept

        ip saddr @admin_v4 tcp dport 22 accept
        tcp dport { 80, 443 } accept
    }
}
```

`flags interval` lets the set hold CIDR ranges as well as single addresses. Change membership at runtime:

```bash
nft add element inet filter admin_v4 { 192.0.2.25 }
nft delete element inet filter admin_v4 { 203.0.113.10 }
nft list set inet filter admin_v4
```

Mirror any change you want to keep into `/etc/nftables.conf`. The `delete table` line at the top of the file means a reload restores exactly what the file says.

---

## Per-IP rate limiting for SSH

A plain `limit rate 5/minute` is **global**: five new SSH connections per minute from everyone combined. One attacker would use up the allowance for your admins. For a per-source limit, use a dynamic set that keeps a limiter per IP:

```
table inet filter {
    set ssh_meter_v4 {
        type ipv4_addr
        flags dynamic, timeout
        timeout 5m
    }

    chain input {
        type filter hook input priority filter; policy drop;

        ct state established,related accept
        iif "lo" accept

        tcp dport 22 ct state new update @ssh_meter_v4 { ip saddr limit rate over 5/minute } counter drop
        tcp dport 22 accept
    }
}
```

Each source IP gets its own entry, expiring after 5 minutes of inactivity. This is IPv4 only. Add an `ipv6_addr` set with `ip6 saddr` for IPv6. Dynamic sets with per-element limits need a reasonably recent kernel and nft. If `nft -c` rejects the syntax, your nftables is too old for this form.

---

## iptables → nft cheat sheet

| iptables | nftables |
|---|---|
| `iptables -L -n -v` | `nft list ruleset` |
| `iptables -A INPUT -p tcp --dport 22 -j ACCEPT` | `nft add rule inet filter input tcp dport 22 accept` |
| `iptables -I INPUT -s 1.2.3.4 -j DROP` | `nft insert rule inet filter input ip saddr 1.2.3.4 drop` |
| `-m conntrack --ctstate ESTABLISHED,RELATED` | `ct state established,related` |
| `-m multiport --dports 80,443` | `tcp dport { 80, 443 }` |
| `-j LOG --log-prefix "x: "` | `log prefix "x: "` |
| `iptables -D INPUT 3` | `nft delete rule inet filter input handle N` |
| `iptables-save` | `nft list ruleset` |
| `iptables-restore < file` | `nft -f file` (atomic) |
| ipset + `-m set --match-set` | native `set` + `@setname` |

---

## Debugging

```bash
nft list ruleset                    # everything loaded, with counters where you added them
nft monitor                         # live stream of ruleset CHANGES (not packets)
```

To see which rules a packet actually hits, enable tracing for just that traffic:

```bash
nft add table inet trace_dbg
nft add chain inet trace_dbg pre '{ type filter hook prerouting priority -350; }'
nft add rule inet trace_dbg pre tcp dport 8080 meta nftrace set 1

nft monitor trace                   # shows every chain/rule the packet traverses

nft delete table inet trace_dbg     # clean up afterwards
```

---

## Migration checklist

1. `iptables-save` / `ip6tables-save` to files you can restore from.
2. Translate with `iptables-restore-translate`, then rewrite as one `inet` table with sets.
3. Allow loopback, established, ICMPv6. Think about the forward chain on container hosts.
4. Use `delete table` rather than `flush ruleset` if anything else creates nftables rules.
5. `nft -c -f` to validate. Schedule a rollback before loading.
6. Test from a new session, cancel the rollback, switch the boot service, then reboot once to prove it.

---

*Related: [Check firewall status on Linux](/blog/check-firewall-status-linux) to see what's loaded before and after. [iptables block IP examples](/blog/iptables-block-ip-example) if you're staying on iptables for now. [Linux security hardening guide](/blog/linux-security-hardening-guide) for where the host firewall fits in a broader baseline.*
