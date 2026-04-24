---
title: "How to Check Network Interface in Linux: ip, ifconfig, ethtool"
date: "2026-04-22"
excerpt: "Check network interfaces in Linux with ip link, ip addr, and ethtool — see IP addresses, interface state, link speed, and diagnose interface-level network problems."
tags: ["linux", "networking", "troubleshooting", "infrastructure"]
featured: false
slug: "check-network-interface-linux-guide"
category: "linux"
---

Network is down. Or you need to know the IP, the interface name, link speed, or whether an interface is actually up. Here's every command you need.

---

## TL;DR

```bash
ip link show              # all interfaces + state (UP/DOWN)
ip addr show              # interfaces + IP addresses
ip addr show eth0         # specific interface
ethtool eth0              # link speed, duplex, autoneg
```

---

## ip link: Interface State

```bash
ip link show
```

```
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP
    link/ether 52:54:00:ab:cd:ef brd ff:ff:ff:ff:ff:ff
3: eth1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN
    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff
```

Key flags in `<...>`:
- `UP` — interface is administratively up
- `LOWER_UP` — physical link is connected (cable plugged in)
- `NO-CARRIER` — cable is disconnected or link is down

`state UP` vs `state DOWN`:
- `UP` — interface is enabled and has a link
- `DOWN` — disabled or no physical link
- `UNKNOWN` — loopback (always shows UNKNOWN, this is normal)

---

## ip addr: IP Addresses

```bash
# All interfaces with IPs
ip addr show

# Specific interface
ip addr show eth0
```

```
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP
    link/ether 52:54:00:ab:cd:ef brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.100/24 brd 192.168.1.255 scope global dynamic eth0
       valid_lft 84721sec preferred_lft 84721sec
    inet6 fe80::5054:ff:feab:cdef/64 scope link
       valid_lft forever preferred_lft forever
```

- `inet` — IPv4 address and prefix
- `inet6` — IPv6 address
- `scope global` — routable address
- `scope link` — link-local only (not routable)
- `dynamic` — assigned by DHCP

```bash
# Just the IP, no other info
ip addr show eth0 | grep "inet " | awk '{print $2}'
# 192.168.1.100/24
```

---

## ifconfig: Legacy Alternative

```bash
# Install if needed
apt install net-tools

ifconfig                  # all interfaces
ifconfig eth0             # specific interface
```

`ip` is the modern replacement. Use it instead — `ifconfig` is deprecated.

---

## ethtool: Physical Link Details

```bash
ethtool eth0
```

```
Settings for eth0:
    Supported link modes: 10baseT/Half 10baseT/Full 100baseT/Half 100baseT/Full 1000baseT/Full
    Advertised link modes: 10baseT/Half 10baseT/Full 100baseT/Half 100baseT/Full 1000baseT/Full
    Speed: 1000Mb/s
    Duplex: Full
    Auto-negotiation: on
    Link detected: yes
```

Key fields:
- `Speed` — current link speed
- `Duplex` — Full (normal) or Half (old/problem)
- `Auto-negotiation` — should be `on` for most NICs
- `Link detected: yes/no` — physical cable connected?

```bash
# Check statistics (errors, drops)
ethtool -S eth0 | grep -E "rx_errors|tx_errors|rx_dropped|tx_dropped"
```

---

## Bring Interface Up or Down

```bash
# Bring interface up
ip link set eth0 up

# Bring interface down
ip link set eth0 down

# Bounce interface (down + up)
ip link set eth0 down && ip link set eth0 up
```

**Note:** On systems managed by NetworkManager, use `nmcli` instead to avoid config conflicts:

```bash
nmcli device connect eth0
nmcli device disconnect eth0
```

---

## Real Examples

### Find all interfaces and their IPs

```bash
ip -br addr show
```

```
lo      UNKNOWN  127.0.0.1/8 ::1/128
eth0    UP       192.168.1.100/24 fe80::1/64
eth1    DOWN
```

`-br` (brief) gives a compact, readable summary.

### Find the default network interface

```bash
ip route | grep default
# default via 192.168.1.1 dev eth0 proto dhcp

# Interface for outbound traffic
ip route get 8.8.8.8 | grep dev
# ... dev eth0 ...
```

### Check for interface errors

```bash
ip -s link show eth0
```

```
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    link/ether 52:54:00:ab:cd:ef
    RX:  bytes  packets  errors  dropped  missed  mcast
    1234567890  9876543       0        0       0      0
    TX:  bytes  packets  errors  dropped  carrier collsns
     987654321  8765432       0        0       0       0
```

Non-zero `errors` or `dropped` = interface-level problems (bad cable, speed mismatch, NIC issues).

### Find interface by IP

```bash
ip addr show | grep "192.168.1.100"
# inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
```

### Check MTU

```bash
ip link show eth0 | grep mtu
# mtu 1500

# Change MTU
ip link set eth0 mtu 9000   # jumbo frames
```

---

## Network Interface Naming

Modern Linux uses predictable names instead of `eth0`:

| Name pattern | Meaning |
|---|---|
| `eth0` | Old kernel naming (still used in VMs) |
| `ens3`, `ens33` | PCI slot naming (most cloud VMs) |
| `enp1s0` | PCI bus naming |
| `eno1` | Embedded NIC (on-board) |
| `wlan0`, `wlp3s0` | Wireless interfaces |
| `lo` | Loopback |

```bash
# List all interface names quickly
ls /sys/class/net/
# or
ip link show | grep "^[0-9]" | awk '{print $2}' | tr -d ':'
```

---

## Common Mistakes

**Mistake 1: Interface shows UP but no link**
`state UP` means administratively enabled. `LOWER_UP` means physical link is connected. An interface can be UP without LOWER_UP (cable disconnected):

```bash
ip link show eth0
# <BROADCAST,MULTICAST,UP,NO-CARRIER>   ← admin up, but no cable
# <BROADCAST,MULTICAST,UP,LOWER_UP>     ← up with working link
```

**Mistake 2: Using ifconfig on interfaces that ip doesn't show**
If `ip addr show` shows an interface but `ifconfig` doesn't, you have old `net-tools`. `ip` is correct.

**Mistake 3: Not checking errors with `-s`**
High packet errors or drops indicate hardware or cable problems, not software issues.

---

## Quick Reference

```bash
ip link show              # all interfaces + state
ip -br addr show          # brief: name + state + IPs
ip addr show eth0         # specific interface
ip -s link show eth0      # with statistics
ethtool eth0              # speed, duplex, link detected
ip route show             # routing table
ip link set eth0 up/down  # enable/disable

# Legacy (ifconfig)
ifconfig                  # all interfaces
ifconfig eth0             # specific interface
```

---

## Conclusion

`ip link show` for interface state. `ip addr show` for IP addresses. `ip -br addr show` for a clean one-liner overview. `ethtool eth0` when you suspect a physical link problem. For interface errors (dropped packets, RX errors), add `-s` to ip link. `ip` completely replaces `ifconfig` — use it.

---

*Related: [Restart Network Service Linux](/blog/restart-network-service-linux-guide) — apply interface configuration changes. [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — interface check is step 1 in connectivity debugging.*
