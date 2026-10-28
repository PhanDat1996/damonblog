---
title: "Restart Networking on Linux: The Right Command per Distro"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "Changed an IP or DNS setting and it didn't apply? Find which network manager your Linux uses, apply the change safely, and avoid locking yourself out."
tags: ["linux", "networking", "infrastructure", "troubleshooting"]
featured: false
noindex: true
category: "linux"
---

You edited the network config, ran the restart command from a blog post, and nothing changed. Or worse, the SSH session froze. The reason is almost always the same: Linux doesn't have one "network service". Depending on the distro there are four different things that might own your interfaces, and a restart command for the wrong one either does nothing or fails with `Unit not found`.

So step one is finding out what manages the network on this box.

---

## Step 1: what manages your network?

```bash
systemctl is-active NetworkManager systemd-networkd networking network 2>/dev/null
ls /etc/netplan/ 2>/dev/null
```

The first command prints one line per unit, in order; look for `active`. Then use this table:

| What you find | Typical systems | Apply changes with |
|---|---|---|
| `/etc/netplan/*.yaml` exists | Ubuntu 18.04+ | `netplan try` / `netplan apply` (renders to networkd or NetworkManager) |
| `NetworkManager` active | RHEL/Rocky/Alma 8+, Fedora, desktops | `nmcli` |
| `systemd-networkd` active, no netplan | Minimal/cloud images, Arch, some appliances | `networkctl` |
| `networking` active | Debian with `/etc/network/interfaces` (ifupdown) | `ifdown`/`ifup` |
| `network` active | RHEL/CentOS 7 and older | `systemctl restart network` |

Edit the config in the place that manager reads, and apply it with that manager's command. Editing one and restarting another is the most common reason "the restart didn't work".

---

## Before you touch a remote server

Network changes are the easiest way to lose a box.

- Have **out-of-band access** ready: cloud serial console, IPMI/iLO, hypervisor console.
- Prefer commands that **re-apply** a configuration over taking an interface down and up.
- If you must do a down/up over SSH, run it as **one** command line so the "up" half still runs after your session drops, ideally with `nohup` or in `tmux`/`screen`.
- On Ubuntu, use `netplan try`, which rolls back automatically.

---

## Ubuntu with netplan

```bash
sudo netplan generate          # syntax check: renders config, no changes applied
sudo netplan try               # apply, auto-revert after 120 s unless you confirm
sudo netplan apply             # apply for real
```

`netplan try` applies the config and waits for you to press Enter. If your SSH session died because the change broke connectivity, you can't press Enter, so it reverts. Use it for anything remote. Some changes, notably to bridges and bonds, may not revert cleanly, so read its warnings.

Netplan writes configuration for either systemd-networkd (Ubuntu Server default) or NetworkManager (Ubuntu Desktop default), depending on `renderer:` in the YAML. Don't also edit the generated files under `/run`; they're overwritten.

---

## NetworkManager (RHEL family, Fedora, desktops)

Apply a changed connection profile:

```bash
nmcli connection show                         # profile names and devices
sudo nmcli connection reload                  # only needed if you edited files by hand
sudo nmcli connection up "System eth0"        # re-activate the profile with the new settings
```

`nmcli connection up` on an already-active profile re-applies it in one step, so you don't need a separate `down`. That's safer over SSH than `down && up`.

For a change you made with `nmcli connection modify`, `nmcli device reapply eth0` applies many settings (addresses, routes, DNS) to the live device without deactivating it.

Example: set a static IP, then apply:

```bash
sudo nmcli connection modify "System eth0" \
  ipv4.method manual \
  ipv4.addresses 10.0.1.10/24 \
  ipv4.gateway 10.0.1.1 \
  ipv4.dns "10.0.0.2 10.0.0.3"
sudo nmcli connection up "System eth0"
```

**Why `systemctl restart NetworkManager` often doesn't help:** NetworkManager is designed to keep existing connections running when the daemon restarts. It picks up running interfaces as they are. Restarting it is useful when the daemon itself is misbehaving, not for applying a changed profile.

On RHEL 9 and later, new profiles are stored as keyfiles in `/etc/NetworkManager/system-connections/`. Older `ifcfg-*` files in `/etc/sysconfig/network-scripts/` are still read on RHEL 9 but are deprecated. `nmcli -f NAME,DEVICE,FILENAME connection show` tells you which file backs each profile.

---

## systemd-networkd without netplan

```bash
sudo networkctl reload                 # re-read .network/.netdev files
sudo networkctl reconfigure ens5       # re-apply to one interface
networkctl status ens5
```

These subcommands exist on recent systemd versions. On older ones, `sudo systemctl restart systemd-networkd` is the fallback; it briefly reconfigures every interface it manages.

---

## Debian with ifupdown

Configuration lives in `/etc/network/interfaces` and `/etc/network/interfaces.d/`.

```bash
sudo ifdown eth1 && sudo ifup eth1
```

For the interface you're connected through, run both in one command line (as above) from `tmux`/`screen`, or from the console. `sudo systemctl restart networking` re-runs every `auto` interface and is the most likely to drop your session.

On Debian systems that also run NetworkManager (desktops), NetworkManager leaves interfaces listed in `/etc/network/interfaces` alone by default. Whichever tool the interface is listed under is the one to use.

---

## RHEL/CentOS 7 legacy network service

```bash
sudo systemctl restart network
```

That's the initscripts service reading `/etc/sysconfig/network-scripts/ifcfg-*`. On RHEL 8 it's deprecated and not installed by default, and on RHEL 9 it's gone, so the same command returns `Unit network.service not found`. Use `nmcli` there.

---

## Renewing a DHCP lease

`dhclient` isn't used by default on current RHEL or Ubuntu Server, so `dhclient -r` either doesn't exist or fights the real manager. Use the manager:

```bash
sudo nmcli device reapply eth0     # NetworkManager
sudo networkctl renew ens5         # systemd-networkd (recent systemd)
```

`dhclient -r` on the interface you're connected through releases your address and drops your SSH session.

---

## Verify it actually applied

```bash
ip -br addr                      # expected address on the expected interface?
ip route                         # default route present and correct?
resolvectl status | grep -A2 'DNS Servers'   # on systemd-resolved systems; otherwise cat /etc/resolv.conf
ping -c 3 "$(ip route | awk '/^default/ {print $3; exit}')"   # can you reach the gateway?
```

If the address is right but names don't resolve, see [DNS not resolving](/blog/dns-not-resolving-linux-fix). If the link itself looks wrong (`NO-CARRIER`, no address at all), [check the network interface](/blog/check-network-interface-linux).

---

## When the apply fails

```bash
journalctl -u NetworkManager -n 50 --no-pager      # or -u systemd-networkd, -u networking
sudo netplan --debug generate                      # netplan YAML errors
dmesg | grep -iE 'link (is )?(up|down)|eth|ens|enp' | tail -20   # driver and link messages
```

Common causes: YAML indentation in netplan (tabs aren't allowed), a profile bound to the wrong interface name after hardware changes, and two managers both configured for the same interface.

If you've lost the network entirely and have console access, you can bring back temporary connectivity by hand, then fix the configuration properly:

```bash
sudo ip addr add 10.0.1.10/24 dev ens5
sudo ip link set ens5 up
sudo ip route add default via 10.0.1.1
```

These changes are lost on the next reboot or apply.

---

## Avoid these

- `nmcli networking off` over SSH: disables networking on every interface, including yours.
- Overwriting `/etc/NetworkManager/NetworkManager.conf` to "fix" a conflict: edit it, or add a file in `/etc/NetworkManager/conf.d/`.
- `systemctl restart network` on RHEL 8+, or `service networking restart` on a netplan Ubuntu. Wrong manager, no effect.

---

*Related: [Cannot Connect to Server](/blog/cannot-connect-to-server-linux-troubleshooting) when networking is up but a service still isn't reachable. [systemctl Restart Not Working](/blog/systemctl-restart-service-not-working) for general systemd restart problems.*
