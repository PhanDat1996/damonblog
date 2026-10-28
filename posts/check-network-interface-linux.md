---
title: "Check Network Interfaces on Linux: ip, ethtool, Errors"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Check interface state, IP addresses, link speed and error counters on Linux with ip and ethtool, and learn what UP, LOWER_UP and NO-CARRIER mean."
tags: ["linux", "networking", "troubleshooting", "infrastructure"]
featured: false
category: "linux"
---

A server dropped off the network, or it's reachable but slow, and you need to rule out the interface itself before chasing firewalls and DNS. Is the link up? Does it have the address you expect? Is the NIC quietly dropping packets?

```bash
ip -br link          # every interface and its state, one line each
ip -br addr          # same, with IP addresses
ip -s link show eth0 # error and drop counters
sudo ethtool eth0    # speed, duplex, link detected
```

Interface names differ per machine (`eth0`, `ens5`, `enp1s0`…). Substitute yours.

---

## Overview in two commands

```bash
ip -br link
```

```
lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>
ens5             UP             0a:1b:2c:3d:4e:5f <BROADCAST,MULTICAST,UP,LOWER_UP>
ens6             DOWN           0a:1b:2c:3d:4e:60 <BROADCAST,MULTICAST>
docker0          DOWN           02:42:8c:1a:00:01 <NO-CARRIER,BROADCAST,MULTICAST,UP>
```

```bash
ip -br addr
```

```
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens5             UP             10.0.1.10/24 fe80::81b:2cff:fe3d:4e5f/64
ens6             DOWN
docker0          DOWN           172.17.0.1/16
```

`-br` (brief) is the fastest way to see everything at once. Use the full output when you need details.

---

## UP, LOWER_UP, NO-CARRIER: what the flags mean

```bash
ip link show ens5
```

```
2: ens5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 9001 qdisc mq state UP mode DEFAULT group default qlen 1000
    link/ether 0a:1b:2c:3d:4e:5f brd ff:ff:ff:ff:ff:ff
```

There are two separate things here:

| Field | Meaning |
|---|---|
| `UP` (in `<...>`) | **Administratively** enabled: someone or something ran `ip link set ... up` |
| `LOWER_UP` | The physical/virtual link layer has a carrier: cable plugged in, switch port up |
| `NO-CARRIER` | Enabled, but no link. Cable, switch port, or the other end of a virtual link |
| `state UP/DOWN` | The kernel's operational state, combining both of the above |
| `state UNKNOWN` | The driver doesn't report link state. Normal for `lo`, tun/tap devices and some virtual NICs |

So `<...,UP,NO-CARRIER> state DOWN` means "configured up, but there's no link": a physical or switch problem, not a config one. `<BROADCAST,MULTICAST> state DOWN` with no `UP` means nobody brought it up: a config or network-manager problem.

`docker0` showing `NO-CARRIER` when no containers are running is normal; a bridge has no carrier until something is attached.

---

## IP addresses

```bash
ip addr show ens5
```

```
2: ens5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 9001 qdisc mq state UP group default qlen 1000
    link/ether 0a:1b:2c:3d:4e:5f brd ff:ff:ff:ff:ff:ff
    inet 10.0.1.10/24 metric 100 brd 10.0.1.255 scope global dynamic ens5
       valid_lft 3412sec preferred_lft 3412sec
    inet6 fe80::81b:2cff:fe3d:4e5f/64 scope link
       valid_lft forever preferred_lft forever
```

- `inet` / `inet6`: address and prefix length.
- `scope global`: usable for routing. `scope link`: link-local only (the `fe80::` address every IPv6 interface gets).
- `dynamic` with a `valid_lft` countdown: assigned by DHCP. If `valid_lft` gets close to 0 and the lease doesn't renew, the address will disappear.

Just the address, for scripts:

```bash
ip -4 -o addr show ens5 | awk '{print $4}'
# 10.0.1.10/24
```

Which interface does traffic to a given host actually use?

```bash
ip route get 10.0.2.15
# 10.0.2.15 via 10.0.1.1 dev ens5 src 10.0.1.10 uid 0
```

This is the answer to "which interface is my default", and it also accounts for policy routing and more specific routes.

---

## Error and drop counters

```bash
ip -s link show ens5
```

```
2: ens5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 9001 qdisc mq state UP mode DEFAULT group default qlen 1000
    link/ether 0a:1b:2c:3d:4e:5f brd ff:ff:ff:ff:ff:ff
    RX:    bytes  packets errors dropped  missed   mcast
    8251739102 12873310      0     214       0       0
    TX:    bytes  packets errors dropped carrier collsns
    2918374650  9182733      0       0       0       0
```

These are totals since the interface came up, so a non-zero value on its own means little. What matters is whether they **grow**:

```bash
watch -d -n 2 'ip -s link show ens5'
```

| Counter rising | Likely cause |
|---|---|
| RX `errors` | Bad cable or optic, CRC errors, duplex mismatch |
| RX `dropped` | The kernel discarded packets, e.g. a full backlog under load. Depending on kernel and driver, frames nobody handles (unknown protocol or VLAN) can also land here, which is harmless |
| RX `missed` | The NIC ran out of buffer before the kernel could take packets: CPU or IRQ saturation |
| TX `carrier` | Link flapping |

For the driver's own detailed counters:

```bash
sudo ethtool -S ens5 | grep -iE 'err|drop|miss|crc' | grep -v ': 0$'
```

Names vary by driver, so grep loosely and look only at non-zero values.

---

## ethtool: speed, duplex, link

```bash
sudo ethtool eno1
```

```
Settings for eno1:
        Supported link modes:   10baseT/Half 10baseT/Full
                                100baseT/Half 100baseT/Full
                                1000baseT/Full
        Speed: 1000Mb/s
        Duplex: Full
        Auto-negotiation: on
        Link detected: yes
```

Things to check on physical servers:

- **Speed lower than expected** (100Mb/s on a gigabit port) usually means a damaged cable or a bad patch panel port, with autonegotiation falling back.
- **Duplex: Half** on modern hardware is almost always a negotiation problem, and it causes errors and collisions under load.
- **Link detected: no** confirms what `NO-CARRIER` already said.

On VMs and cloud instances, ethtool is less informative. Many virtual NICs report `Speed: Unknown!` or a nominal value, and the real bandwidth limit comes from the instance type.

---

## MTU

```bash
ip link show ens5 | grep -o 'mtu [0-9]*'
```

A mismatch, such as 9001 on the host but 1500 somewhere on the path or 1450 inside a VPN/overlay, causes a recognizable failure: small requests work, large transfers or TLS handshakes stall. `tracepath` finds the path MTU; see [traceroute examples](/blog/traceroute-linux-examples).

`ip link set ens5 mtu 1500` changes it immediately but not persistently, and setting an MTU the network doesn't support breaks connectivity. Change it in your network configuration (netplan, NetworkManager), not ad hoc.

---

## Interface names

| Name | Meaning |
|---|---|
| `eno1` | Onboard NIC, index from firmware |
| `ens5` | Hot-plug slot index from firmware. Common on cloud VMs |
| `enp3s0` | PCI bus 3, slot 0 |
| `eth0` | Kernel's traditional naming. Still used where predictable naming is disabled, and inside containers |
| `wlp2s0` | Wireless on PCI bus 2 |
| `veth*`, `docker0`, `br-*` | Container plumbing |

```bash
ls /sys/class/net/
```

---

## Bringing an interface down or up

```bash
sudo ip link set ens6 up
```

**Warning:** `ip link set <iface> down` on the interface your SSH session uses cuts you off, and taking a link down removes the routes through it. When it comes back up, the default route and other static routes return only if your network manager re-applies them. Only bounce interfaces you aren't connected through, or do it from a console. To re-apply configuration properly, use the network manager instead; see [restart networking](/blog/restart-network-service-linux).

---

## ifconfig?

`ifconfig` (from `net-tools`) still works where it's installed, but it isn't on most minimal images, and it hides things: it shows only one IPv4 address per interface, so addresses added with `ip addr add` don't appear without a label. When `ifconfig` and `ip` disagree, `ip` is right.

| ifconfig | ip |
|---|---|
| `ifconfig` | `ip addr` |
| `ifconfig -a` | `ip link` |
| `ifconfig eth0 up` | `ip link set eth0 up` |
| `ifconfig eth0 mtu 1500` | `ip link set eth0 mtu 1500` |

---

*Related: [Cannot Connect to Server](/blog/cannot-connect-to-server-linux-troubleshooting) when the interface looks fine but connections still fail. [netstat vs ss](/blog/netstat-vs-ss-command) for the rest of the net-tools to iproute2 translations.*
