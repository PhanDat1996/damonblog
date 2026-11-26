---
title: "SSH Connection Refused on Linux: Causes and Fixes"
date: "2026-04-22"
updated: "2026-11-26"
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
| `ssh.socket: Failed with result 'service-start-limit-hit'` | sshd failed to start too often (often a config error) and took the socket down; fix the config, then `systemctl reset-failed` and start `ssh.socket` |

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

On Ubuntu 22.10 and later, SSH is socket-activated by default. Before anyone connects, `ss` shows the port owned only by `systemd` (`pid=1`). The first connection starts one `sshd` (the socket uses `Accept=no`), and from then on `ss` lists both `sshd` and `systemd` on the same socket. The port comes from `ssh.socket`, not from sshd, so after changing `Port` or `ListenAddress`:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket
sudo ss -tlnp | grep -E 'sshd|systemd'     # confirm the new port
```

On 24.04 the `daemon-reload` runs `sshd-socket-generator`, which reads `Port` and `ListenAddress` from `sshd_config` (drop-ins included) and writes `/run/systemd/generator/ssh.socket.d/addresses.conf`. In the lab below, `systemctl restart ssh` alone left the port on 22. If the new port still doesn't appear after the steps above, your release expects the port in the socket unit itself: `sudo systemctl edit ssh.socket`. The usual symptom of getting this wrong is "I changed the port, restarted ssh, and it's still on 22", or the new port refuses connections.

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

If only **your** IP is refused while others get in, suspect fail2ban. Its default ban action is a reject (on Ubuntu 24.04, an nftables `reject with icmp port-unreachable` rule) that shows up on the client as "Connection refused". The lab below shows it locking out a working key login from the same address:

```bash
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip 203.0.113.25
```

The ban only covers the port the jail is configured for (`port = ssh`, which is 22). After moving sshd to another port without updating the jail, a banned address still got in (lab below).

A dropped SYN from a cloud security group shows up as a timeout, not a refusal, so it's unlikely to be the cause here. TCP wrappers (`/etc/hosts.deny`) were dropped from upstream OpenSSH years ago, though some distributions kept them for a while. A match there closes the connection after the TCP handshake, so it shows up as `kex_exchange_identification`, not as refused.

---

## Lab: three ways to get "refused" on Ubuntu 24.04

> **Lab environment:** Ubuntu 24.04.5 LTS test box `lab01` (OpenSSH 9.6p1, systemd 255, fail2ban 1.0.2 with the Ubuntu defaults: nftables ban action, systemd backend) and a second Ubuntu 24.04 box `client` on the same subnet. `ssh.socket` enabled as on a fresh install. Captured 26 Nov 2026. Output is copied from the terminal without edits.

### fail2ban bans your own address

Five failed logins for a user that doesn't exist, then a normal key login from the same machine:

```
root@client:~# ssh -o BatchMode=yes damon@172.30.0.10 hostname
lab01
root@client:~# for i in 1 2 3 4 5; do ssh -o BatchMode=yes intruder@172.30.0.10 true 2>&1; done; sleep 3
intruder@172.30.0.10: Permission denied (publickey,password).
intruder@172.30.0.10: Permission denied (publickey,password).
intruder@172.30.0.10: Permission denied (publickey,password).
intruder@172.30.0.10: Permission denied (publickey,password).
intruder@172.30.0.10: Permission denied (publickey,password).
root@client:~# ssh -o BatchMode=yes damon@172.30.0.10 hostname
ssh: connect to host 172.30.0.10 port 22: Connection refused
root@client:~# nc -zv -w 3 172.30.0.10 22
nc: connect to 172.30.0.10 port 22 (tcp) failed: Connection refused
root@lab01:~# fail2ban-client status sshd | tail -4
`- Actions
   |- Currently banned:	1
   |- Total banned:	1
   `- Banned IP list:	172.30.0.20
root@lab01:~# nft list chain inet f2b-table f2b-chain | grep reject
		tcp dport 22 ip saddr @addr-set-sshd reject with icmp port-unreachable
root@lab01:~# fail2ban-client set sshd unbanip 172.30.0.20
1
root@client:~# ssh -o BatchMode=yes damon@172.30.0.10 hostname
lab01
```

![Terminal on client and lab01: five failed SSH logins, then the valid key login gets "Connection refused"; fail2ban-client shows 172.30.0.20 banned, nft shows the reject rule on port 22, and unbanip restores access](/images/lab-ssh-fail2ban-connection-refused.jpg)

The ban is per address, not per user: the valid key for `damon` was refused along with everything else from 172.30.0.20. Note the rule: `tcp dport 22`. With sshd moved to port 2222 and the jail left at its default, the same five failures produced a ban that didn't block anything:

```
root@lab01:~# fail2ban-client status sshd | grep 'Banned IP'
   `- Banned IP list:	172.30.0.20
root@client:~# ssh -o BatchMode=yes -p 2222 damon@172.30.0.10 hostname
lab01
```

If you change the port, set `port = 2222` in the `[sshd]` section of `/etc/fail2ban/jail.local` too.

### Changing the port: restart ssh is not enough

```
root@lab01:~# ss -tlnp | grep ':22 '
LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=1059,fd=3),("systemd",pid=1,fd=60))
LISTEN 0      4096            [::]:22            [::]:*    users:(("sshd",pid=1059,fd=4),("systemd",pid=1,fd=61))
root@lab01:~# echo 'Port 2222' > /etc/ssh/sshd_config.d/10-port.conf; sshd -t && echo config ok
config ok
root@lab01:~# systemctl restart ssh
root@lab01:~# ss -tlnp | grep -E ':(22|2222) '
LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=1478,fd=3),("systemd",pid=1,fd=60))
LISTEN 0      4096            [::]:22            [::]:*    users:(("sshd",pid=1478,fd=4),("systemd",pid=1,fd=61))
root@client:~# ssh -o BatchMode=yes -p 2222 damon@172.30.0.10 hostname
ssh: connect to host 172.30.0.10 port 2222: Connection refused
root@client:~# ssh -o BatchMode=yes -p 22 damon@172.30.0.10 hostname
lab01
root@lab01:~# systemctl daemon-reload; systemctl restart ssh.socket
root@lab01:~# ss -tlnp | grep -E ':(22|2222) '
LISTEN 0      4096         0.0.0.0:2222       0.0.0.0:*    users:(("sshd",pid=1529,fd=3),("systemd",pid=1,fd=39))
LISTEN 0      4096            [::]:2222          [::]:*    users:(("sshd",pid=1529,fd=4),("systemd",pid=1,fd=40))
root@client:~# ssh -o BatchMode=yes -p 2222 damon@172.30.0.10 hostname
lab01
root@client:~# ssh -o BatchMode=yes -p 22 damon@172.30.0.10 hostname
ssh: connect to host 172.30.0.10 port 22: Connection refused
root@lab01:~# systemctl cat ssh.socket | grep -A3 -i 'listenstream=$'
ListenStream=
ListenStream=0.0.0.0:2222
ListenStream=[::]:2222
```

`sshd -t` passed and `systemctl restart ssh` gave no error, but sshd got a new PID on the old port. Only `daemon-reload` plus `restart ssh.socket` moved it. The last command shows the drop-in the generator wrote.

### A typo in sshd_config: reset first, refused later

With socket activation, a broken config doesn't give "refused" straight away:

```
root@lab01:~# echo 'PermitRootLogn no' >> /etc/ssh/sshd_config.d/10-port.conf; sshd -t
/etc/ssh/sshd_config.d/10-port.conf: line 2: Bad configuration option: PermitRootLogn
/etc/ssh/sshd_config.d/10-port.conf: terminating, 1 bad configuration options
root@lab01:~# systemctl restart ssh
Job for ssh.service failed because the control process exited with error code.
See "systemctl status ssh.service" and "journalctl -xeu ssh.service" for details.
root@lab01:~# systemctl is-active ssh.socket ssh.service
active
activating
root@lab01:~# ss -tlnp | grep ':2222 '
LISTEN 0      4096         0.0.0.0:2222       0.0.0.0:*    users:(("systemd",pid=1,fd=39))
LISTEN 0      4096            [::]:2222          [::]:*    users:(("systemd",pid=1,fd=40))
root@client:~# ssh -o BatchMode=yes -p 2222 damon@172.30.0.10 hostname
kex_exchange_identification: read: Connection reset by peer
Connection reset by 172.30.0.10 port 2222
root@client:~# ssh -o BatchMode=yes -p 2222 damon@172.30.0.10 hostname
ssh: connect to host 172.30.0.10 port 2222: Connection refused
root@lab01:~# journalctl -u ssh -n 3 --no-pager -o cat
ssh.service: Start request repeated too quickly.
ssh.service: Failed with result 'exit-code'.
Failed to start ssh.service - OpenBSD Secure Shell server.
```

![Terminal on lab01 and client: sshd -t reports a bad configuration option, systemd still listens on 2222, the first ssh gets "kex_exchange_identification: read: Connection reset by peer", the second gets "Connection refused" after ssh.socket fails with service-start-limit-hit](/images/lab-ssh-socket-broken-config.jpg)

systemd kept the port open and tried to start sshd for each connection, so the first client was accepted and then reset. After repeated start failures the service hit its start limit, and `ssh.socket` went down with it:

```
root@lab01:~# systemctl is-active ssh.socket ssh.service
failed
failed
root@lab01:~# ss -tln | grep -c ':2222 '
0
root@lab01:~# journalctl -u ssh.socket -n 2 --no-pager -o cat
Listening on ssh.socket - OpenBSD Secure Shell server socket.
ssh.socket: Failed with result 'service-start-limit-hit'.
```

So on Ubuntu, one config mistake can show up to clients as `kex_exchange_identification` first and as "Connection refused" a few attempts later. Both point back to `sshd -t`. After fixing the file, `systemctl reset-failed` and `systemctl start ssh.socket` bring the port back.

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
