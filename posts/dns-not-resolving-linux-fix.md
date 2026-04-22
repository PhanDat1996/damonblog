---
title: "DNS Not Resolving in Linux: Fix Guide"
date: "2026-04-22"
excerpt: "Fix DNS not resolving in Linux — diagnose with dig and nslookup, check resolv.conf and systemd-resolved, and fix DNS for containers, VMs, and production servers."
tags: ["linux", "networking", "troubleshooting", "debugging"]
featured: false
slug: "dns-not-resolving-linux-fix"
---

`Name or service not known`. `Could not resolve host`. DNS is either broken or misconfigured. Here's the systematic fix.

---

## TL;DR

```bash
# Test DNS
dig google.com
nslookup google.com

# Check config
cat /etc/resolv.conf
systemd-resolve --status | grep "DNS Servers"

# Quick fix: set public DNS
echo "nameserver 8.8.8.8" > /etc/resolv.conf

# Flush cache
systemd-resolve --flush-caches
```

---

## Diagnose First

```bash
# Does DNS resolve at all?
dig google.com
# ANSWER SECTION with an IP = working
# No answer, timeout = DNS broken

# Does a specific nameserver work?
dig @8.8.8.8 google.com     # test with Google DNS directly
dig @1.1.1.1 google.com     # test with Cloudflare

# Is it only internal DNS broken?
dig google.com          # works
dig internal.company    # fails → internal DNS server issue
```

---

## Check DNS Configuration

```bash
# Primary config file
cat /etc/resolv.conf
```

```
nameserver 127.0.0.53      # systemd-resolved stub
nameserver 8.8.8.8         # fallback
search example.com         # domain search suffix
```

If `resolv.conf` is empty or has wrong nameservers, DNS fails.

```bash
# With systemd-resolved (Ubuntu 18.04+, most modern distros)
systemd-resolve --status
# Shows per-interface DNS servers, search domains, DNSSEC status

# Which DNS server is actually being used?
systemd-resolve --status | grep -A5 "DNS Servers"

# Detailed query trace
dig +trace google.com
```

---

## Fix: systemd-resolved

Modern Ubuntu/Debian use `systemd-resolved`. The stub resolver listens on `127.0.0.53`.

```bash
# Check it's running
systemctl status systemd-resolved

# Restart it
systemctl restart systemd-resolved

# Flush cache
systemd-resolve --flush-caches

# Check stats (cache hits, failures)
systemd-resolve --statistics
```

If `resolv.conf` points to the wrong place:

```bash
ls -la /etc/resolv.conf
# Should be a symlink to:
# /run/systemd/resolve/stub-resolv.conf  (Ubuntu standard)

# Fix broken symlink
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
systemctl restart systemd-resolved
```

---

## Fix: Manual resolv.conf

On servers without systemd-resolved, or when you need a quick fix:

```bash
# Backup existing
cp /etc/resolv.conf /etc/resolv.conf.bak

# Set reliable DNS servers
cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
options timeout:2 attempts:3
EOF
```

**Warning:** On cloud servers, `/etc/resolv.conf` is often managed by cloud-init or NetworkManager and gets overwritten on reboot. Make it persistent:

```bash
# Ubuntu: prevent NetworkManager overwriting it
echo "[main]
dns=none" >> /etc/NetworkManager/NetworkManager.conf

systemctl restart NetworkManager
```

---

## Fix: Docker Containers

DNS failures in containers are common — the container inherits the host's DNS config but may not be able to reach it.

```bash
# Test DNS inside container
docker exec mycontainer cat /etc/resolv.conf
docker exec mycontainer nslookup google.com

# Fix: set DNS in docker run
docker run --dns 8.8.8.8 myimage

# Fix: set DNS in daemon.json (applies to all containers)
cat > /etc/docker/daemon.json << EOF
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
EOF
systemctl restart docker
```

In `docker-compose.yml`:

```yaml
services:
  app:
    dns:
      - 8.8.8.8
      - 1.1.1.1
```

---

## Fix: RHEL / CentOS with NetworkManager

```bash
# Check current DNS settings
nmcli device show | grep DNS

# Set DNS for a connection
nmcli connection modify eth0 ipv4.dns "8.8.8.8 8.8.4.4"
nmcli connection up eth0

# Restart NetworkManager
systemctl restart NetworkManager
```

---

## Real Examples

### Deployed to new server, nothing resolves

```bash
cat /etc/resolv.conf
# nameserver 192.168.1.1  ← points to local router that doesn't exist on this network

# Fix
echo "nameserver 8.8.8.8" > /etc/resolv.conf
dig google.com    # now works
```

### Internal hostnames don't resolve

```bash
dig app.internal
# NXDOMAIN

cat /etc/resolv.conf
# No search domain!

# Add internal search domain
echo "search internal.company.com" >> /etc/resolv.conf
dig app    # now searches app.internal.company.com
```

### DNS works for some domains, not others

```bash
dig google.com     # works
dig internal.corp  # fails

# Check if internal DNS server is correct
dig @<internal-dns-server> internal.corp   # works from internal server
dig @8.8.8.8 internal.corp                # fails (expected — internal only)

# Fix: configure split DNS
# /etc/systemd/resolved.conf.d/internal.conf
[Resolve]
DNS=<internal-dns-server>
Domains=~corp
```

---

## Common Mistakes

**Editing `/etc/resolv.conf` when it's managed by another service.** It gets overwritten on restart. Fix the DNS in NetworkManager or systemd-resolved config instead.

**Not testing with a specific nameserver.** `dig @8.8.8.8 hostname` tells you if the issue is your DNS server vs the record not existing.

**Forgetting to flush DNS cache.** After fixing DNS config, stale cache entries may persist:
```bash
systemd-resolve --flush-caches
```

---

## Conclusion

Start with `dig google.com`. If it works, DNS is fine — check your specific hostname. If it fails, check `/etc/resolv.conf` for the nameserver, test with `dig @8.8.8.8`, and fix the config for your DNS manager (systemd-resolved, NetworkManager, or manual). For Docker, always set explicit DNS in `daemon.json`.

---

*Related: [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — DNS is one layer of the connectivity troubleshooting stack. [Restart Network Service Linux](/blog/restart-network-service-linux-guide) — sometimes a network restart applies the DNS config fix.*
