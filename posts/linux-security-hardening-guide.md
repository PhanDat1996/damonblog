---
title: "Linux Security Hardening Guide: CIS Benchmarks for Production"
date: "2026-04-21"
excerpt: "Complete Linux security hardening guide using CIS benchmarks — Ubuntu, RHEL, and Windows Server. SSH hardening, auditd, filesystem restrictions, firewall configuration, and production pitfalls to avoid."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: true
slug: "linux-security-hardening-guide"
---

# Linux Security Hardening Guide: CIS Benchmarks for Production

## TL;DR

- **CIS Level 1** is the right baseline for production Linux servers — SOC 2, PCI-DSS, HIPAA all accept it
- **Audit first, change second** — run `lynis audit system` or `usg audit cis_level1_server` before touching anything
- The 5 controls that cause the most production incidents: `AllowGroups` (SSH lockout), `noexec` on `/tmp` (breaks Java), `ip_forward=0` (breaks Docker), `-e 2` auditd (irreversible), account lockout (service accounts)
- **Never apply CIS in one shot** — phase it: filesystem → services → network → SSH → PAM → audit
- Keep console/out-of-band access ready before touching SSH or PAM

---

## Introduction

Default Linux installs are tuned for compatibility, not security. SSH accepts password authentication. Audit logging is absent. Kernel parameters allow ICMP redirects. Unused filesystem modules are loaded.

The CIS (Center for Internet Security) Benchmark is the industry standard for closing these gaps. It is what SOC 2 auditors check, what compliance frameworks reference, and what security teams use as a baseline.

This guide covers hardening Ubuntu, RHEL, and Windows Server using CIS Level 1 — what the controls actually do, what breaks in production, and how to apply them safely.

---

## Which CIS Level?

| Level | Target | Operational Impact | Use When |
|---|---|---|---|
| **Level 1** | General production servers | Minimal | Most teams — SOC 2, PCI-DSS, HIPAA |
| **Level 2** | High-security / regulated | Significant | Required by regulation (FedRAMP, NIST 800-53 High) |

**Start with Level 1.** Get it stable. Add Level 2 controls selectively where your risk profile requires it.

---

## The 5 Controls That Break Production

Learn these before applying anything:

### 1. SSH AllowGroups — Lockout Risk

```bash
# sshd_config
AllowGroups sshusers wheel
```

If your account is not in `sshusers`, your next SSH login fails — even with valid keys.

```bash
# Check BEFORE adding AllowGroups
groups $(whoami)
usermod -aG sshusers $(whoami)  # add yourself first
```

### 2. noexec on /tmp — Breaks Java

```bash
# fstab
tmpfs /tmp tmpfs defaults,nosuid,nodev,noexec 0 0
```

JVM extracts native libraries to `/tmp`. With `noexec`, they extract but cannot execute.

Fix: `-Djava.io.tmpdir=/var/lib/myapp/tmp` in JVM startup args.

### 3. ip_forward=0 — Breaks Docker/Kubernetes

```bash
net.ipv4.ip_forward = 0
```

Docker, Podman, and Kubernetes all require IP forwarding. Exclude this on container hosts.

### 4. auditd -e 2 — Irreversible Until Reboot

```bash
# /etc/audit/rules.d/cis.rules
-e 2  # makes rules immutable
```

Once applied, audit rules cannot be changed without rebooting. Test your ruleset thoroughly with `auditctl -l` before adding `-e 2`.

### 5. Account Lockout — Service Account Outages

```
lockout threshold: 5 attempts
lockout duration: 15 minutes
```

Service accounts with hardcoded passwords retry on every failure, hit 5 attempts in minutes, and lock. Convert service accounts to gMSA (Windows) or key-based auth (Linux) before enabling lockout.

---

## Ubuntu CIS Level 1 Hardening

### Audit First

```bash
apt install ubuntu-security-guide -y
usg audit cis_level1_server  # read-only, no changes
```

### Phase 1: Filesystem

```bash
# Disable unused filesystem modules
cat > /etc/modprobe.d/cis-disable-filesystems.conf << EOF
install cramfs /bin/true
install freevxfs /bin/true
install jffs2 /bin/true
install hfs /bin/true
install hfsplus /bin/true
install squashfs /bin/true
install udf /bin/true
EOF

# /etc/fstab — add mount restrictions
# tmpfs /tmp tmpfs defaults,rw,nosuid,nodev,noexec,relatime 0 0
```

### Phase 2: Network sysctl

```bash
cat > /etc/sysctl.d/99-cis-hardening.conf << EOF
net.ipv4.ip_forward = 0              # skip on container hosts
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
EOF
sysctl -p /etc/sysctl.d/99-cis-hardening.conf
```

### Phase 3: SSH

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 4
ClientAliveInterval 300
ClientAliveCountMax 0
X11Forwarding no
AllowTcpForwarding no
LogLevel VERBOSE

# Validate before restart
sshd -t && systemctl reload sshd
```

### Phase 4: Audit

```bash
apt install auditd -y
systemctl enable --now auditd

# /etc/audit/rules.d/99-cis.rules
# -w /etc/passwd -p wa -k identity
# -w /etc/sudoers -p wa -k sudoers
# augenrules --load
```

### Verify

```bash
usg audit cis_level1_server --html-file /tmp/cis-report.html
```

> **Complete Ubuntu guide:** [CIS Level 1 Ubuntu Hardening: A Field-Tested Production Guide](/blog/cis-level1-ubuntu-hardening)

---

## RHEL CIS Level 1 Hardening

RHEL has native OpenSCAP integration — no third-party tool needed.

```bash
# Install and audit
dnf install openscap-scanner scap-security-guide -y

oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --report /tmp/cis-report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

Key RHEL-specific differences from Ubuntu:
- **SELinux must be in enforcing mode** — CIS Level 1 requires this
- **firewalld** instead of ufw
- **pam_faillock** instead of pam_tally2

```bash
# firewalld CIS configuration
systemctl enable --now firewalld
firewall-cmd --set-default-zone=drop --permanent
firewall-cmd --permanent --add-service=ssh
firewall-cmd --reload
```

> **Complete RHEL guide:** [CIS RHEL Level 1 Hardening: What Actually Breaks in Production](/blog/cis-rhel-level1-hardening)

---

## Windows Server CIS Level 1 Hardening

Windows hardening uses GPO (Group Policy) as the delivery mechanism.

Key controls and their production pitfalls:

| Control | What breaks | Fix |
|---|---|---|
| NTLMv2 only | Legacy ERP, NAS devices, printers | Audit NTLM usage for 4 weeks first |
| Account lockout (5 attempts) | Service accounts with hardcoded passwords | Convert to gMSA first |
| Verbose audit policy | Security log fills disk, DC halts | Set log to 2GB + configure WEF |
| Default deny inbound firewall | Monitoring agents, backup clients | Document inbound requirements first |

```cmd
:: Audit current state with CIS-CAT
.\CIS-CAT.bat -b benchmarks\CIS_Windows_Server_2022_Benchmark.xml -p "Level 1 - Member Server"

:: Apply via secedit
secedit /configure /db %windir%\security\local.sdb /cfg CIS_Level1_Template.inf
```

> **Complete Windows guide:** [CIS Windows Server Level 1 Hardening: What Actually Matters in Production](/blog/cis-windows-server-level1-hardening-production-guide)

---

## Tools for All Platforms

| Tool | Platform | Use |
|---|---|---|
| **Lynis** | Linux | Fast baseline audit, hardening score |
| **OpenSCAP** | Linux | Formal compliance scan, HTML report |
| **Ubuntu Security Guide (USG)** | Ubuntu 22.04+ | Official CIS automation by Canonical |
| **CIS-CAT Pro** | Linux + Windows | Official CIS assessment tool |
| **LGPO.exe** | Windows | Apply GPO to standalone servers |

```bash
# Lynis — fastest way to get a score
apt install lynis -y && lynis audit system

# OpenSCAP — formal compliance report
oscap xccdf eval --profile cis_server_l1 --report /tmp/report.html /path/to/content.xml
```

---

## Hardening Implementation Checklist

Apply in this order. Test between phases.

```
Phase 1 — Baseline
[ ] Run audit tool — record score
[ ] Document service accounts
[ ] Document inbound network requirements
[ ] Confirm out-of-band console access

Phase 2 — Low-risk controls
[ ] Disable unused filesystem modules
[ ] Disable unused services (verify with ss -tlnp)
[ ] Apply network sysctl (except ip_forward on container hosts)
[ ] Enable firewall logging (not enforcement yet)

Phase 3 — SSH hardening
[ ] Verify key auth works before disabling password auth
[ ] Check AllowGroups membership
[ ] Validate config: sshd -t
[ ] Apply with second session open

Phase 4 — PAM and account policies
[ ] Convert service accounts to key-based auth
[ ] Apply password complexity and aging
[ ] Enable account lockout with monitoring

Phase 5 — Audit logging
[ ] Size /var/log/audit partition (min 10GB)
[ ] Configure log forwarding (SIEM or syslog)
[ ] Apply audit rules
[ ] Verify with auditctl -l and ausearch

Phase 6 — Firewall enforcement
[ ] Apply allow rules per service role
[ ] Change default zone to drop/block
[ ] Monitor firewall logs

Phase 7 — Verify and document
[ ] Run post-hardening audit scan
[ ] Document all exceptions with justification
[ ] Store compliance report
```

---

## FAQ

**Is CIS Level 1 enough for compliance?**
For SOC 2, PCI-DSS, and HIPAA — yes, CIS Level 1 is accepted as evidence of a hardening baseline. It does not replace other controls (patching, access management, monitoring), but it satisfies the hardening requirement.

**How often should I re-audit?**
Monthly minimum. System updates, package installs, and configuration changes drift settings. Schedule automated scans (Lynis cron, OpenSCAP scheduled task) and alert on score drops.

**Can I apply CIS hardening to containers?**
Some controls apply — SSH config, audit rules, file permissions. Many do not — separate partitions are irrelevant in containers, `ip_forward=0` breaks container networking. Apply a container-specific baseline rather than the server benchmark directly.

**What if a control conflicts with my application?**
Document it as an exception with a business justification and a compensating control. Auditors expect exceptions — they just want them documented, not ignored.

---

*Related reading: [CIS Level 1 Ubuntu Hardening: A Field-Tested Production Guide](/blog/cis-level1-ubuntu-hardening) — Ubuntu-specific guide with production pitfalls. [CIS RHEL Level 1 Hardening](/blog/cis-rhel-level1-hardening) — RHEL/CentOS guide with OpenSCAP integration. [CIS Windows Server Level 1](/blog/cis-windows-server-level1-hardening-production-guide) — Windows GPO-based hardening.*
