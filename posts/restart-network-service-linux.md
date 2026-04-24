---
title: "How to Restart Network Service in Linux (All Distros)"
date: "2026-04-22"
excerpt: "Restart network service in Linux using systemctl, nmcli, and ip commands — covering Ubuntu, RHEL, Debian, and CentOS with real examples and what to do when restart fails."
tags: ["linux", "networking", "infrastructure", "troubleshooting"]
featured: false
slug: "restart-network-service-linux-guide"
category: "linux"
---

Network is flaky, an IP change didn't apply, or a config edit needs to take effect. The right command depends on your distro and network manager. Here's every way to do it.

---

## TL;DR

```bash
# Modern Ubuntu (22.04+) / Debian with NetworkManager
sudo systemctl restart NetworkManager

# Ubuntu with netplan (cloud/server)
sudo netplan apply

# RHEL / CentOS / Rocky / AlmaLinux
sudo systemctl restart NetworkManager
# or (older RHEL 6/7 style)
sudo systemctl restart network

# Restart a single interface without full service restart
sudo ip link set eth0 down && sudo ip link set eth0 up
```

---

## Ubuntu / Debian

### NetworkManager (most desktop/server installs)

```bash
sudo systemctl restart NetworkManager
sudo systemctl status NetworkManager
```

### netplan (Ubuntu 18.04+ server, cloud images)

```bash
# Edit config
sudo nano /etc/netplan/00-installer-config.yaml

# Apply changes (no full restart needed)
sudo netplan apply

# Debug mode — shows what would change
sudo netplan --debug apply
```

### Legacy networking (older Debian, Ubuntu < 18.04)

```bash
sudo systemctl restart networking
# or
sudo service networking restart
```

---

## RHEL / CentOS / Rocky / AlmaLinux

### NetworkManager (RHEL 7+, all current versions)

```bash
sudo systemctl restart NetworkManager
sudo systemctl status NetworkManager
```

### Restart a specific connection profile

```bash
# List connection profiles
nmcli connection show

# Restart a specific connection
nmcli connection down "eth0"
nmcli connection up "eth0"

# Or by UUID
nmcli connection down <uuid>
nmcli connection up <uuid>
```

### Legacy network service (RHEL 6, CentOS 6)

```bash
sudo service network restart
# or
sudo /etc/init.d/network restart
```

---

## Restart a Single Interface (All Distros)

This restarts one interface without touching the rest — useful when you only changed one NIC's config:

```bash
# Bring interface down and up
sudo ip link set eth0 down
sudo ip link set eth0 up

# Renew DHCP lease
sudo dhclient -r eth0    # release
sudo dhclient eth0       # renew

# With nmcli (NetworkManager)
nmcli device disconnect eth0
nmcli device connect eth0
```

---

## Real Examples

### IP address change didn't apply after editing config

```bash
# Ubuntu / Netplan
sudo netplan apply
ip addr show eth0    # verify new IP

# RHEL / nmcli
nmcli connection reload
nmcli connection down eth0 && nmcli connection up eth0
ip addr show eth0
```

### Connectivity lost after config edit — recover without reboot

```bash
# Check what broke
ip addr show
ip route show
systemctl status NetworkManager

# Rollback: restart NetworkManager (it re-reads config)
sudo systemctl restart NetworkManager

# If that fails, manually assign IP to recover
sudo ip addr add 192.168.1.100/24 dev eth0
sudo ip route add default via 192.168.1.1
```

### Apply static IP configuration (RHEL / nmcli)

```bash
# Set static IP via nmcli
nmcli connection modify eth0 ipv4.method manual \
  ipv4.addresses "192.168.1.100/24" \
  ipv4.gateway "192.168.1.1" \
  ipv4.dns "8.8.8.8 8.8.4.4"

# Apply
nmcli connection down eth0 && nmcli connection up eth0
```

### Check if restart actually applied

```bash
ip addr show
ip route show
cat /etc/resolv.conf    # DNS servers applied?
ping -c 3 8.8.8.8      # connectivity test
```

---

## What to Do When Network Restart Fails

```bash
# Step 1: Check NetworkManager status
systemctl status NetworkManager
journalctl -u NetworkManager -n 50 --no-pager

# Step 2: Check for config syntax errors (netplan)
sudo netplan --debug generate

# Step 3: Check interface state
ip link show
# Look for "state DOWN" or "state UNKNOWN"

# Step 4: Check dmesg for driver errors
dmesg | grep -iE "eth0|ens|eno|network" | tail -20

# Step 5: Force reload interface config
nmcli connection reload
nmcli connection show    # list all connections
```

### Common error: "Failed to start Network Manager"

```bash
# Check what's blocking it
journalctl -u NetworkManager -n 30 --no-pager | grep -i "error\|fail"

# Common cause: conflicting /etc/network/interfaces and NetworkManager
# Fix: either disable one or configure NetworkManager to ignore interfaces file
echo -e "[main]\nplugins=ifupdown,keyfile\n\n[ifupdown]\nmanaged=false" \
  | sudo tee /etc/NetworkManager/NetworkManager.conf
sudo systemctl restart NetworkManager
```

---

## Common Mistakes

**Mistake 1: Using `service network restart` on modern systems**
On RHEL 7+, the `network` service is deprecated in favor of `NetworkManager`. `systemctl restart network` may silently fail or do nothing.

**Mistake 2: Editing `/etc/network/interfaces` on Ubuntu with NetworkManager**
If NetworkManager is running, it manages interfaces and ignores `/etc/network/interfaces` by default. Edit via `nmcli` or netplan instead.

**Mistake 3: `netplan apply` vs `netplan try`**
`netplan apply` applies immediately — if you break connectivity, you lose access.
`netplan try` applies for 120 seconds and rolls back automatically if you don't confirm. Use `try` on remote servers.

```bash
sudo netplan try    # safe for remote servers
# (connects you get 2 min to confirm)
ACCEPT=true sudo netplan try
```

**Mistake 4: Not checking DNS after restart**
IP and routing can be fine but DNS broken:

```bash
cat /etc/resolv.conf
nslookup google.com
systemd-resolve --status | grep "DNS Servers"
```

---

## Pro Tips

```bash
# Bounce all connections managed by NetworkManager
nmcli networking off && nmcli networking on

# Check which NetworkManager version / plugins are active
NetworkManager --version
nmcli general status

# Watch network events in real time
journalctl -fu NetworkManager

# Test connectivity before committing a change
ping -c 3 8.8.8.8 && echo "connectivity OK" || echo "BROKEN"

# Find which config file NetworkManager is using for an interface
nmcli -f NAME,DEVICE,FILENAME connection show
```

---

## Conclusion

On modern Linux (Ubuntu 20.04+, RHEL 8+): `systemctl restart NetworkManager` handles most cases. For single-interface changes: `nmcli connection down/up`. For netplan configs on Ubuntu server: `netplan try` before `netplan apply` on remote machines. Always verify with `ip addr show` and a ping after restarting.

---

*Related: [Check Open Ports in Linux: ss vs netstat](/blog/check-open-ports-linux-ss-netstat-guide) — verify services are reachable after network restart. [systemctl Restart Service Not Working: Fix Guide](/blog/systemctl-restart-service-not-working-fix) — same diagnostic approach for when NetworkManager itself won't restart.*
