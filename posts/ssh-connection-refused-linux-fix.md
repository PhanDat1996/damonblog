---
title: "SSH Connection Refused Linux: Fix Guide"
date: "2026-04-22"
excerpt: "Fix SSH connection refused on Linux — diagnose why SSH won't connect, check sshd service and firewall, recover from lockout, and harden SSH without breaking access."
tags: ["linux", "security", "networking", "troubleshooting"]
featured: false
slug: "ssh-connection-refused-linux-fix"
---

`ssh: connect to host 10.0.1.50 port 22: Connection refused`. Either sshd isn't running, the port is blocked, or SSH is on a non-standard port. Here's the diagnostic path.

---

## TL;DR

```bash
# From the client — what error?
ssh -v user@host    # verbose, shows exactly where it fails

# On the server (if you have console access)
systemctl status sshd
ss -tlnp | grep ssh
firewall-cmd --list-all    # RHEL
ufw status                 # Ubuntu
```

---

## Diagnose the Error

### "Connection refused" (port 22)
Something is actively rejecting the connection. sshd isn't listening on port 22.

```bash
# On the server:
systemctl status sshd
ss -tlnp | grep :22
```

### "Connection timed out"
Packets are being dropped. Firewall is blocking port 22.

```bash
# On the server:
ufw status              # Ubuntu
firewall-cmd --list-all # RHEL
iptables -L INPUT -n | grep 22
```

### "Connection refused" (non-22 port)
SSH is configured on a different port.

```bash
grep Port /etc/ssh/sshd_config
# Port 2222
ssh -p 2222 user@host
```

---

## Fix: sshd Not Running

```bash
# Start sshd
systemctl start sshd

# Enable at boot
systemctl enable sshd

# Check why it failed to start
journalctl -u sshd -n 30 --no-pager
```

Common reasons sshd won't start:
- Config syntax error → `sshd -t` to test
- Port already in use → `ss -tlnp | grep :22`
- Missing host keys → `ssh-keygen -A`

```bash
# Test config syntax before restarting
sshd -t
# No output = valid config

# Regenerate missing host keys
ssh-keygen -A
systemctl start sshd
```

---

## Fix: Firewall Blocking SSH

```bash
# Ubuntu (ufw)
ufw allow ssh       # allows port 22
ufw allow 22/tcp    # same thing
ufw status

# RHEL / Rocky / AlmaLinux (firewalld)
firewall-cmd --permanent --add-service=ssh
firewall-cmd --reload
firewall-cmd --list-services   # confirm ssh is listed

# Raw iptables (if no firewall manager)
iptables -I INPUT -p tcp --dport 22 -j ACCEPT
```

---

## Fix: SSH on Non-Standard Port

```bash
grep -E "^Port|^#Port" /etc/ssh/sshd_config
# Port 2222

# Connect with custom port
ssh -p 2222 user@host

# Set in ~/.ssh/config for convenience
echo "Host myserver
    HostName 10.0.1.50
    Port 2222
    User damon" >> ~/.ssh/config

ssh myserver   # now works without -p flag
```

---

## Recover From Lockout

Locked yourself out after changing sshd_config? You need console access (cloud provider serial console, IPMI, physical access).

```bash
# From console: check what broke
sshd -t            # test config syntax
systemctl status sshd
journalctl -u sshd -n 20 --no-pager

# Common lockout causes and fixes:

# 1. AllowGroups/AllowUsers — your user not included
grep -E "AllowUsers|AllowGroups|DenyUsers" /etc/ssh/sshd_config
usermod -aG sshusers yourusername   # add yourself to allowed group

# 2. PasswordAuthentication no — but no key set
# Temporarily re-enable password auth to add your key
sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd
# Add your public key, then disable password auth again

# 3. Wrong Port — forgot which port it was changed to
grep Port /etc/ssh/sshd_config

# After any fix:
sshd -t            # validate before reloading
systemctl reload sshd   # reload, not restart (keeps existing sessions)
```

---

## Real Examples

### Cloud server: SSH worked, now connection refused

```bash
# The sshd process likely crashed or wasn't started
# From cloud console:
systemctl status sshd
# inactive (dead) — it crashed

journalctl -u sshd | tail -20
# sshd[1234]: fatal: PAM: pam_start failed for user damon

# Fix: check PAM config
ls /etc/pam.d/sshd
# Missing or corrupted — restore from backup or reinstall

apt install --reinstall openssh-server  # Ubuntu
dnf reinstall openssh-server            # RHEL
```

### SSH works locally, not from specific IP

```bash
# Check fail2ban — your IP may be banned
fail2ban-client status sshd
fail2ban-client set sshd unbanip 1.2.3.4

# Check TCP wrappers (older systems)
cat /etc/hosts.deny | grep ssh
cat /etc/hosts.allow | grep ssh
```

### Key auth failing

```bash
ssh -v user@host 2>&1 | grep -E "Offering|Accepted|denied"
# "Permission denied (publickey)" — key rejected

# On server: check authorized_keys
cat ~/.ssh/authorized_keys     # is your key there?
ls -la ~/.ssh/                 # permissions must be 700
ls -la ~/.ssh/authorized_keys  # must be 600

chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

---

## Common Mistakes

**Changing Port and forgetting to update the firewall.** New port is unreachable because the firewall still only allows port 22.

**Using `systemctl restart sshd` while troubleshooting remotely.** Restart drops all existing sessions. Use `reload` — it applies config changes without dropping connections.

**Removing password auth before confirming key auth works.** Always test key auth in a second terminal before closing the session that has password auth.

---

## Conclusion

`Connection refused` = sshd not running or wrong port. `Connection timed out` = firewall blocking. Start with `systemctl status sshd` and `ss -tlnp | grep ssh` on the server. For lockouts, you need console access — test config with `sshd -t` before reloading.

---

*Related: [CIS RHEL Level 1 Hardening](/blog/cis-rhel-level1-hardening) — SSH hardening including AllowGroups lockout prevention. [Cannot Connect to Server Linux](/blog/cannot-connect-to-server-linux-troubleshooting) — broader connectivity troubleshooting beyond SSH.*
