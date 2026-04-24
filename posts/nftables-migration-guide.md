---
title: "Replacing iptables with nftables: A Practical Migration Guide"
date: "2024-06-18"
excerpt: "iptables is showing its age. nftables is the modern replacement — cleaner syntax, better performance, and already the default on most distros. Here's how to migrate."
tags: ["firewall", "linux", "security", "networking"]
featured: false
category: "security"
---

## Why nftables?

If you're still writing `iptables` rules in 2024, you're not wrong — but you're leaving improvements on the table. `nftables` has been the default on Debian/Ubuntu since 20.04 and RHEL since 8. Under the hood, `iptables` on modern systems is often already translated to `nftables` via compatibility shims.

The key improvements:
- **Single tool** — replaces `iptables`, `ip6tables`, `arptables`, `ebtables`
- **Atomic rule updates** — apply a whole ruleset at once, no partial states
- **Better syntax** — readable sets, maps, and dictionaries
- **Performance** — less overhead per rule with set-based matching

## Your iptables Ruleset → nftables

Here's a typical iptables firewall for a web server:

```bash
# Old iptables way
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -j DROP
```

The nftables equivalent in `/etc/nftables.conf`:

```
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        # Allow loopback
        iif "lo" accept

        # Allow established/related connections
        ct state established,related accept

        # ICMP
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        # SSH, HTTP, HTTPS
        tcp dport { 22, 80, 443 } accept

        # Log and drop everything else
        log prefix "nft-drop: " counter drop
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

Apply it:

```bash
nft -f /etc/nftables.conf
systemctl enable nftables
systemctl start nftables
```

## The Power of Sets

This is where nftables shines. Need to allow SSH from multiple IPs?

**iptables way:**
```bash
iptables -A INPUT -s 203.0.113.10 -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -s 203.0.113.11 -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -s 203.0.113.12 -p tcp --dport 22 -j ACCEPT
```

**nftables way:**
```
table inet filter {
    set allowed_ssh {
        type ipv4_addr
        elements = { 203.0.113.10, 203.0.113.11, 203.0.113.12 }
    }

    chain input {
        type filter hook input priority filter; policy drop;

        # Only allow SSH from approved IPs
        ip saddr @allowed_ssh tcp dport 22 accept
        tcp dport 22 drop  # drop all other SSH attempts

        tcp dport { 80, 443 } accept
        ct state established,related accept
    }
}
```

You can add/remove from sets at runtime without touching the ruleset:

```bash
# Add an IP without reloading rules
nft add element inet filter allowed_ssh { 203.0.113.20 }

# Remove an IP
nft delete element inet filter allowed_ssh { 203.0.113.10 }

# See current set contents
nft list set inet filter allowed_ssh
```

## Rate Limiting

Block brute force SSH attempts:

```
chain input {
    type filter hook input priority filter; policy drop;

    # Rate limit SSH: max 5 new connections per minute per IP
    tcp dport 22 ct state new \
        limit rate 5/minute \
        accept

    tcp dport 22 ct state new \
        log prefix "ssh-ratelimit: " \
        drop
}
```

## Port Knocking with Maps

A more advanced example — a "poor man's port knocking" using nftables maps:

```
table inet portknock {
    set knock_stage1 {
        type ipv4_addr
        timeout 10s
    }

    set knock_complete {
        type ipv4_addr
        timeout 60s
    }

    chain input {
        type filter hook input priority -10;

        # Stage 1: knock on port 7000
        tcp dport 7000 add @knock_stage1 { ip saddr }

        # Stage 2: after stage 1, knock on port 8000 to complete
        ip saddr @knock_stage1 tcp dport 8000 \
            add @knock_complete { ip saddr }

        # Open SSH only for completed knockers
        ip saddr @knock_complete tcp dport 22 accept
    }
}
```

## Useful Commands

```bash
# View entire ruleset
nft list ruleset

# View a specific table
nft list table inet filter

# View chains in a table
nft list chains inet

# Flush everything (careful!)
nft flush ruleset

# Test a config file without applying
nft -c -f /etc/nftables.conf

# Monitor rule hits in real time
nft monitor
```

## Migration Checklist

1. **Export current iptables rules:** `iptables-save > /tmp/iptables-backup.rules`
2. **Translate with iptables-translate:** `iptables-translate -A INPUT -p tcp --dport 22 -j ACCEPT`
3. **Write your nftables config** in `/etc/nftables.conf`
4. **Test the config:** `nft -c -f /etc/nftables.conf`
5. **Verify connectivity** from a second session before closing your current one
6. **Disable iptables service:** `systemctl disable iptables`
7. **Enable nftables:** `systemctl enable --now nftables`

The `iptables-translate` tool is your friend for the mechanical parts. The interesting work is restructuring your rules to take advantage of sets and maps — that's where you get clarity and performance wins.
