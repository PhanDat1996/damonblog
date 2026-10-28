---
title: "CIS RHEL Level 1 Hardening: What Breaks and How to Avoid It"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Harden RHEL 8/9 to CIS Level 1 with OpenSCAP without locking out SSH, breaking PAM via authselect, or freezing the box on a full audit log."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: false
category: "security"
---

The typical failure looks like this. A CIS role runs across a batch of RHEL servers overnight. In the morning, SSH answers `Permission denied` for the deploy user, the monitoring server can't scrape node_exporter, and someone is on the cloud serial console undoing changes one by one. Every setting was a legitimate CIS recommendation. None of them had been checked against how those servers are actually used.

RHEL makes CIS easier than most distributions: the scanner and the content ship in the base repos. It also has a few mechanisms of its own (authselect, crypto policies, SELinux, firewalld zones) that generic Linux hardening guides get wrong. This guide covers both.

> **Benchmark versions matter.** CIS publishes separate benchmarks for RHEL 8, 9 and 10, and revises them. Recommendation numbers and Level 1/Level 2 assignments change between versions, so this guide describes controls by what they do. Confirm specifics against the benchmark version you're assessed on.

---

## TL;DR

```bash
dnf install openscap-scanner scap-security-guide

# Audit only, no changes (use ssg-rhel8-ds.xml on RHEL 8, and so on)
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --results /root/cis-results.xml --report /root/cis-report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

Then, before remediating: verify SSH group membership and key logins, route PAM changes through `authselect`, inventory inbound traffic before tightening firewalld, and decide what the audit subsystem should do when its disk fills.

---

## Audit with OpenSCAP

`scap-security-guide` contains the CIS profiles (`cis_server_l1`, `cis_server_l2`, plus workstation variants) as SCAP data streams. List what your version ships:

```bash
oscap info /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml | grep -i cis
```

The `--report` HTML is readable and shows the failing rule, the expected value and the remediation script for each item. The `--results` XML is what compliance tooling consumes.

### Tailor before you remediate

Some controls won't fit your environment (IP forwarding on a container host, for example). Create a tailoring file that deselects them, with SCAP Workbench or the `autotailor` utility from newer OpenSCAP releases, and use it for both scanning and remediation so reports match reality.

### Remediation options

```bash
# Apply directly (test system first!)
oscap xccdf eval --remediate \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --results /root/cis-remediate.xml \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

Better for review: generate the remediation as an Ansible playbook or Bash script, read it, then run it through your normal change process. The package also ships ready-made playbooks:

```bash
ls /usr/share/scap-security-guide/ansible/ | grep cis

oscap xccdf generate fix --fix-type ansible \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --output cis-l1.yml /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

The community [Ansible Lockdown](https://github.com/ansible-lockdown) project also maintains RHEL CIS roles. Whichever you use, run it with `--check --diff` against a test host first.

---

## SSH

> **Lockout warning.** Keep your current session open, confirm console access, and test each change from a new session before closing the old one.

On RHEL 9 and later, `sshd_config` includes `/etc/ssh/sshd_config.d/*.conf` at the top, and for most options the **first** value read wins. Red Hat's own `50-redhat.conf` and cloud-init drop-ins live there. Put your settings in a file that sorts first:

```bash
# /etc/ssh/sshd_config.d/00-cis.conf   (RHEL 9+; on RHEL 8 edit sshd_config)
PermitRootLogin no
PasswordAuthentication no
PermitEmptyPasswords no
KbdInteractiveAuthentication no
HostbasedAuthentication no
IgnoreRhosts yes
PermitUserEnvironment no

AllowGroups sshusers

MaxAuthTries 4
MaxStartups 10:30:60
MaxSessions 10
LoginGraceTime 60
ClientAliveInterval 300
ClientAliveCountMax 3

X11Forwarding no
LogLevel VERBOSE
Banner /etc/issue.net
```

```bash
groupadd -f sshusers
usermod -aG sshusers alice
usermod -aG sshusers ansible          # automation users too
sshd -t && sshd -T | grep -Ei 'permitroot|passwordauth|allowgroups'
systemctl reload sshd
```

RHEL-specific points:

- **Don't paste a `Ciphers`/`MACs`/`KexAlgorithms` list from an old guide.** On RHEL, SSH algorithms come from the system-wide **crypto policy**. Check it with `update-crypto-policies --show`. The benchmark expects the policy not to be `LEGACY`, and recent versions add sub-policy restrictions (for example on SHA-1 or CBC ciphers for SSH). Those are applied as policy modules, not as lines in `sshd_config`.
- **`ClientAliveCountMax 0`** disables the idle disconnect on OpenSSH 8.2 and later, the opposite of what many guides intend. Use a value above 0.
- **Kerberos/GSSAPI:** if hosts are joined to IdM/FreeIPA or AD for SSO, setting `GSSAPIAuthentication no` breaks Kerberos SSH logins. Check before copying it from a template.
- **Automation:** Ansible inventories using `ansible_password` stop working when password auth goes. Move them to keys first.

---

## PAM and passwords: use authselect

On RHEL 8 and later, `/etc/pam.d/system-auth` and `password-auth` are generated by **authselect**. Hand edits are overwritten the next time a profile is applied, and a mistake in the stack can block every login, including `sudo` and root on the console.

> **Lockout warning:** keep a root shell open while changing PAM. Test `sudo -v`, `su -` and a new SSH login before closing it.

```bash
authselect current                       # which profile and features are active
authselect enable-feature with-faillock  # account lockout
authselect apply-changes
```

Lockout and quality settings go in their own config files, not as module arguments:

```ini
# /etc/security/faillock.conf
deny = 5
unlock_time = 900
```

```ini
# /etc/security/pwquality.conf.d/50-cis.conf
minlen = 14
minclass = 4
maxrepeat = 3
maxsequence = 3
dictcheck = 1
```

If you need PAM changes authselect's features don't cover, create a custom profile (`authselect create-profile cis -b sssd`) and select that, rather than editing the generated files.

Check and clear lockouts:

```bash
faillock --user deploy
faillock --user deploy --reset
```

A looping deploy script that fails `sudo` repeatedly will lock its own account. Make sure at least two accounts can administer every server.

### Password aging

The benchmark asks for a maximum password age (365 days or less in recent versions), a minimum age of at least one day, and an expiry warning. In `/etc/login.defs`:

```
PASS_MAX_DAYS   365
PASS_MIN_DAYS   1
PASS_WARN_AGE   7
```

`login.defs` only applies to accounts created **after** the change. Existing users need `chage --maxdays 365 --mindays 1 --warndays 7 <user>`.

Before enforcing aging, find accounts that actually have a password hash:

```bash
awk -F: '$2 ~ /^\$/ {print $1}' /etc/shadow
```

Locked (`!`, `!!`) and no-password (`*`) entries are excluded. Service accounts on that list should move to keys or tokens with the password locked (`passwd -l svc_app`). Exempting them from expiry (`chage -M -1 svc_app`) is an exception you'll need to document.

---

## SELinux

In the RHEL 8 and 9 benchmarks, Level 1 requires that SELinux is **not disabled**, and Level 2 requires **enforcing** mode. Run enforcing anyway unless you have a specific reason not to.

```bash
getenforce
sestatus
ausearch -m AVC -ts recent      # denials, if an app broke
```

If an application breaks after hardening, check for AVC denials before blaming a CIS control. Fix denials with the right file contexts or booleans (`semanage fcontext`, `restorecon`, `setsebool -P`), not by switching SELinux off.

---

## auditd

`auditd` is installed and enabled on a default RHEL install. The benchmark adds rules and tightens `auditd.conf`. A representative subset, in `/etc/audit/rules.d/50-cis.rules`:

```bash
-w /etc/passwd   -p wa -k identity
-w /etc/group    -p wa -k identity
-w /etc/shadow   -p wa -k identity
-w /etc/gshadow  -p wa -k identity
-w /etc/sudoers   -p wa -k scope
-w /etc/sudoers.d -p wa -k scope

-w /var/log/lastlog  -p wa -k logins
-w /var/run/faillock -p wa -k logins

-a always,exit -F arch=b64 -C euid!=uid -F auid!=unset -S execve -k user_emulation
-a always,exit -F arch=b32 -C euid!=uid -F auid!=unset -S execve -k user_emulation

-a always,exit -F arch=b64 -S init_module,finit_module,delete_module -F auid>=1000 -F auid!=unset -k kernel_modules
-a always,exit -F path=/usr/bin/kmod -F perm=x -F auid>=1000 -F auid!=unset -k kernel_modules
```

The full profile adds rules for time and network configuration changes, permission changes, mounts, deletions, privileged commands and more. The OpenSCAP remediation generates them. Load and check:

```bash
augenrules --load
auditctl -l | head
ausearch -k identity --start today
```

The benchmark also wants auditing enabled from boot, so processes started before `auditd` are covered:

```bash
grubby --update-kernel ALL --args 'audit=1 audit_backlog_limit=8192'
```

### What actually happens when the audit disk fills

Two different settings get mixed up here:

- **`-f` in the rules (failure flag)** controls what the *kernel* does when the audit subsystem itself fails, for example when the backlog overflows: `0` silent, `1` log to syslog (the default), `2` panic. It is not the disk-full setting.
- **`auditd.conf` actions** control what the *daemon* does as disk space runs out: `space_left_action`, `admin_space_left_action`, `disk_full_action`, `disk_error_action`, `max_log_file_action`.

Stricter benchmark profiles set these to keep every log (`max_log_file_action = keep_logs`) and to halt or drop to single-user mode when the audit partition fills. That's deliberate: no auditing, no operation. On a busy server with a small `/var/log/audit`, it's also a scheduled outage. Before adopting it:

1. Run the rules for a few days and measure growth (`du -sh /var/log/audit`).
2. Give `/var/log/audit` its own partition, sized from that number.
3. Forward events off the host (rsyslog, or the audisp remote plugin), so local logs aren't the only copy.
4. Decide per server role whether halting on a full disk is acceptable, and record the decision.

Add `-e 2` (immutable rules) last, once the ruleset is proven. Changing rules after that needs a reboot.

---

## firewalld

The benchmark wants one active firewall manager (firewalld *or* nftables, not both) with a default-deny posture.

> **Lockout warning:** changing the default zone or removing the `ssh` service applies to new connections immediately. Work in runtime mode with an automatic rollback.

```bash
systemctl enable --now firewalld
firewall-cmd --get-active-zones
firewall-cmd --list-all

# Inventory first: what listens, and who connects?
ss -tlnp
ss -tn state established '( sport = :9100 or sport = :5432 )'

# Schedule a rollback (runtime changes vanish on reload)
echo 'firewall-cmd --reload' | at now + 10 minutes

# Make changes in RUNTIME mode only
firewall-cmd --zone=public --remove-service=cockpit
firewall-cmd --zone=public --add-rich-rule='rule family="ipv4" source address="10.10.1.0/24" service name="ssh" accept'
firewall-cmd --zone=public --remove-service=ssh

# From a NEW session: SSH still works? Monitoring still scrapes?
firewall-cmd --runtime-to-permanent
atrm <job-number>
```

Watch out for:

- **Interfaces assigned to a specific zone.** Changing the default zone does nothing for an interface NetworkManager has put in another zone. Always check `--get-active-zones`.
- **Monitoring and backup agents** that receive inbound connections: node_exporter (9100), Zabbix agent (10050), backup clients. Build allow rules for them before tightening.
- **Seeing what gets dropped:** `firewall-cmd --set-log-denied=unicast`, then `journalctl -k -f`. Set it back to `off` when done.

---

## Kernel modules and file permissions

Disabling unused filesystem modules (`cramfs`, `freevxfs`, `hfs`, `hfsplus`, `jffs2` and similar) is low risk:

```bash
# /etc/modprobe.d/cis-filesystems.conf
install cramfs /bin/false
blacklist cramfs
# ...repeat for each module in your benchmark version
```

Rarely used network protocols (`dccp`, `sctp`, `rds`, `tipc`) appear in the RHEL benchmarks too, and recent versions place several of them in Level 2. Check before disabling `sctp` on anything telecom-related.

SUID/SGID binaries and world-writable files are mostly **review** items. The benchmark asks you to audit them, not strip bits blindly:

```bash
find / -xdev -type f -perm -4000 -o -type f -perm -2000 2>/dev/null | sort
rpm -qf /usr/bin/some-binary        # which package owns it?
rpm -V $(rpm -qf /usr/bin/some-binary)   # has it been modified?

find / -xdev -type f -perm -0002 2>/dev/null
```

An unowned SUID binary, or one that fails `rpm -V`, is worth investigating. Removing SUID from packaged binaries such as `passwd` or `sudo` breaks them.

---

## Rollout plan

```
[ ] Baseline OpenSCAP scan (HTML + results XML)
[ ] Console access tested for every target; second admin account
[ ] Tailoring file: excluded rules with reasons
[ ] Low-risk: modules, services, sysctl, file permissions
[ ] auditd rules (no -e 2); event rate measured; forwarding configured
[ ] auditd.conf full-disk actions decided per role
[ ] SSH drop-in; groups populated; sshd -T verified; new-session test
[ ] authselect + faillock + pwquality; sudo/su/SSH tested before closing root shell
[ ] Password aging applied with chage for existing users; service accounts handled
[ ] firewalld changes in runtime mode with rollback, then runtime-to-permanent
[ ] Final scan; exceptions documented
```

At fleet scale, Red Hat Satellite and Red Hat Insights both offer OpenSCAP-based compliance scanning and reporting, so you don't run `oscap` host by host.

---

## Beyond the OS

CIS hardens the operating system. Check the services on top too: [NGINX CIS hardening checker](/tools/nginx-cis-hardening-checker), [NGINX CVE checker](/tools/nginx-cve-checker), and [PostgreSQL hardening checker](/tools/pg-hardening-checker).

---

## FAQ

**Does this apply to Rocky Linux and AlmaLinux?**
CIS publishes separate benchmarks for Rocky Linux and AlmaLinux. Most RHEL guidance carries over. For scanning, check `oscap info` on the data stream your distribution ships to see which CIS profiles it includes.

**Can I run oscap --remediate on production?**
Only after running the same remediation on a representative test system and reviewing the generated fixes. It applies every rule in the profile, including SSH, PAM and firewall changes.

**Does CIS Level 1 require SELinux enforcing?**
In the RHEL 8 and 9 benchmarks, Level 1 requires SELinux not to be disabled, and enforcing mode is a Level 2 recommendation. Enforcing is still the right default for production.

**Why did my sshd_config changes have no effect?**
A file in `/etc/ssh/sshd_config.d/` set the option first. Run `sshd -T` to see effective values, and put your settings in a drop-in that sorts before the others.

---

*Related: [Linux security hardening guide](/blog/linux-security-hardening-guide) for the cross-distro rollout order. [CIS Level 1 Ubuntu hardening](/blog/cis-level1-ubuntu-hardening) for Debian-family servers. [CIS Windows Server Level 1](/blog/cis-windows-server-level1-hardening) for mixed environments.*
