---
title: "SSH Connection Refused on Linux: Causes and Fixes"
date: "2026-04-22"
updated: "2026-10-28"
excerpt: "ssh: connect to host port 22: Connection refused? Check sshd, the real listening port, socket activation, SELinux, firewall and fail2ban, in that order."
tags: ["linux", "security", "networking", "troubleshooting"]
featured: false
category: "linux"
---

```
ssh: connect to host 10.0.1.50 port 22: Connection refused
```

"Refused" is specific. Your packet reached the host and something sent back a rejection: either nothing is listening on that port, or a firewall rule is rejecting you. That rules out a lot (DNS, routing, the host being down) and leaves a short list.

If you got `Connection timed out` instead, that's a different problem: packets are being dropped, usually by a firewall or security group. The [general connection troubleshooting guide](/blog/cannot-connect-to-server-linux-troubleshooting) covers that path.

---

## Which SSH error do you have?

| Error | Meaning |
|---|---|
| `Connection refused` | Nothing listening on that port, or a REJECT rule (often fail2ban) |
| `Connection timed out` | SYN dropped: firewall DROP, security group, routing, host down |
| `No route to host` | ICMP host-unreachable, often firewalld's default reject |
| `kex_exchange_identification: Connection closed by remote host` | TCP connected, then sshd dropped you: `MaxStartups` throttling, a `/etc/hosts.deny` style block, or sshd itself failing |
| `Permission denied (publickey)` | Network is fine; authentication failed |

Confirm from the client:

```bash
nc -zv -w 3 10.0.1.50 22
ssh -v user@10.0.1.50       # shows which port and address it actually tries
```

`ssh -v` matters if you have a `~/.ssh/config` entry: the first lines show the `Port` and `HostName` really being used.

---

## Step 1: is sshd running?

You'll need another way in: the cloud provider's serial console, IPMI/iLO, or a hypervisor console.

The unit name differs by distro: `ssh` on Debian/Ubuntu, `sshd` on RHEL, Rocky, Alma and Fedora.

```bash
systemctl status ssh        # Debian/Ubuntu
systemctl status sshd       # RHEL family
```

If it's not running, find out why before starting it:

```bash
sudo sshd -t                            # config syntax check; no output = OK
journalctl -u ssh -n 50 --no-pager      # or -u sshd on RHEL
```

Common start failures:

| Log message | Fix |
|---|---|
| `/etc/ssh/sshd_config line N: Bad configuration option` | Fix the line; `sshd -t` points to it |
| `sshd: no hostkeys available -- exiting` | `sudo ssh-keygen -A` generates the missing host keys |
| `Missing privilege separation directory: /run/sshd` | You started `sshd` by hand; start it through systemd, which creates the directory |
| `Bind to port 2222 on 0.0.0.0 failed: Permission denied` | SELinux, see Step 3 |
| `Bind to port 22 on 0.0.0.0 failed: Address already in use` | Another sshd, or a socket unit, already holds it |

Then:

```bash
sudo systemctl enable --now ssh     # or sshd
```

---

## Step 2: which port and address is it really listening on?

```bash
sudo ss -tlnp | grep -E 'sshd|systemd'
sudo sshd -T | grep -E '^(port|listenaddress) '
```

`sshd -T` prints the **effective** configuration after all `Include` files are merged, so it's more reliable than grepping `sshd_config`. Check:

- **Port** is not 22: connect with `ssh -p 2222 user@host`, or put `Port 2222` under the host in `~/.ssh/config`.
- **ListenAddress** is a specific IP: sshd only accepts connections on that address. Connecting to any other IP of the server gets refused.

### Ubuntu: ssh.socket owns the port

On Ubuntu 22.10 and later, SSH is socket-activated by default. `ss` shows port 22 owned by `systemd` (`pid=1`), not `sshd`, and sshd starts per connection. After changing `Port` or `ListenAddress`:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket
sudo ss -tlnp | grep systemd     # confirm the new port
```

If the new port doesn't appear, your release expects the port in the socket unit itself: `sudo systemctl edit ssh.socket`. The usual symptom of getting this wrong is "I changed the port, restarted ssh, and it's still on 22", or the new port refuses connections.

---

## Step 3: SELinux on a non-standard port (RHEL family)

On RHEL, Rocky and Alma with SELinux enforcing, sshd may only bind to ports labeled `ssh_port_t`. Change `Port` to 2222 without updating the label and sshd fails to bind, so clients get refused:

```bash
sudo semanage port -l | grep ssh_port_t
# ssh_port_t                     tcp      22
sudo semanage port -a -t ssh_port_t -p tcp 2222
sudo systemctl restart sshd
```

Don't disable SELinux to make this go away. (`semanage` is in the `policycoreutils-python-utils` package.)

---

## Step 4: firewall and fail2ban

If sshd listens on the right port and you're still refused, something is rejecting the packet.

```bash
sudo firewall-cmd --list-all            # RHEL family: is "ssh" (or your port) listed?
sudo ufw status verbose                 # Ubuntu
sudo nft list ruleset | grep -n -i reject
```

Allow it with the tool that manages the host:

```bash
sudo firewall-cmd --permanent --add-service=ssh && sudo firewall-cmd --reload
sudo firewall-cmd --permanent --add-port=2222/tcp && sudo firewall-cmd --reload   # custom port
sudo ufw allow 22/tcp
```

If only **your** IP is refused while others get in, suspect fail2ban. Its default ban action is a REJECT that shows up on the client as "Connection refused":

```bash
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip 203.0.113.25
```

A dropped SYN from a cloud security group shows up as a timeout, not a refusal, so it's unlikely to be the cause here. TCP wrappers (`/etc/hosts.deny`) were dropped from upstream OpenSSH years ago, though some distributions kept them for a while. A match there closes the connection after the TCP handshake, so it shows up as `kex_exchange_identification`, not as refused.

---

## Change SSH config without locking yourself out

Most refused-after-a-change incidents follow from editing `sshd_config` over the only open session. Safer routine:

1. Keep your current session open the whole time.
2. Validate: `sudo sshd -t`.
3. Check the effective result: `sudo sshd -T | grep -E '^(port|listenaddress|passwordauthentication|allowusers|allowgroups) '`.
4. Allow the new port in the firewall (and SELinux) **before** switching to it.
5. Apply: `sudo systemctl reload ssh` (or `sshd`; on Ubuntu with socket activation, see Step 2).
6. Open a **second** terminal and log in. Only close the first one when that works.

Restarting sshd doesn't drop existing sessions: each one runs in its own process that survives the restart. The real risk is a broken config that keeps the daemon from coming back, so that *new* logins fail. That's why steps 2 and 6 matter.

On Ubuntu cloud images, a drop-in like `/etc/ssh/sshd_config.d/50-cloud-init.conf` can set `PasswordAuthentication`. Because the `Include` line comes first in `sshd_config` and sshd uses the first value it reads, the drop-in wins over your edit further down. `sshd -T` shows which one is in effect.

---

## Quick checklist

1. `nc -zv -w 3 host 22`: refused or timed out?
2. On the console: `systemctl status ssh`/`sshd`, `sshd -t`, logs.
3. `sshd -T` and `ss -tlnp` for the real port and address (and `ssh.socket` on Ubuntu).
4. SELinux label for a custom port on RHEL.
5. Firewall rules, then fail2ban for your IP.

---

*Related: [Check Open Ports on Linux](/blog/check-open-ports-linux) to read the `ss` output. [CIS RHEL Level 1 Hardening](/blog/cis-rhel-level1-hardening) for SSH hardening settings that can lock you out if applied carelessly.*
