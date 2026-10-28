---
title: "Linux Security Hardening Guide: Apply CIS Without Lockouts"
date: "2026-04-21"
updated: "2026-10-28"
excerpt: "Harden Linux servers to CIS Level 1 without an outage: audit first, know which controls lock you out or break Docker, and roll changes out in a safe order."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: true
category: "security"
---

An auditor, a customer questionnaire or your own security team asks for "CIS-hardened servers." The fastest way to turn that into an incident is to run a hardening role across the fleet on Friday afternoon. The individual settings are mostly sensible. The outages come from a handful of controls that interact with *your* environment: who can SSH in, what runs from `/tmp`, whether the host routes container traffic.

This guide is the overview: how to choose a baseline, which controls cause outages, and the order to roll them out. The distribution-specific details are in the [Ubuntu](/blog/cis-level1-ubuntu-hardening) and [RHEL](/blog/cis-rhel-level1-hardening) guides.

---

## TL;DR

- **Baseline:** CIS Benchmark Level 1 for your exact distribution and version. Level 2 only where you have a reason.
- **Audit before you change anything.** `usg` on Ubuntu, `oscap` on RHEL. Both report without modifying the system.
- **The controls that cause outages:** SSH group restrictions, firewall default-deny, PAM lockout and password expiry, `noexec` on `/tmp`, `ip_forward=0` on container hosts, and auditd settings that halt or freeze the box.
- **Roll out in phases**, with console access and a rollback ready before you touch SSH, PAM or the firewall.

---

## Which baseline?

The CIS Benchmarks are PDFs from the Center for Internet Security (free to download after registration), published per OS **and version** (Ubuntu 22.04 and 24.04 have separate benchmarks). Each recommendation is tagged with a profile:

| Profile | Intent | Typical use |
|---|---|---|
| **Level 1 – Server** | Practical hardening with limited impact on function | Default target for production servers |
| **Level 2 – Server** | Defense in depth. Expect things to break | Specific high-risk systems, or when a contract requires it |

Benchmarks are revised regularly, and recommendation numbers and even profile assignments change between versions. When someone quotes "control 5.2.4," ask which benchmark version they mean.

**Compliance:** PCI DSS asks for configuration standards consistent with industry-accepted hardening standards and lists CIS among example sources. SOC 2 and HIPAA don't name a benchmark, but a documented baseline plus scan evidence is a common way to show hardening. CIS Level 1 is a baseline, not a full compliance answer. Patching, access management and monitoring are separate requirements.

---

## Audit first

Nothing in this section changes the system.

```bash
# Ubuntu 20.04+ (needs Ubuntu Pro, free for a few machines)
pro enable usg
apt install usg
usg audit cis_level1_server

# RHEL 8/9 and rebuilds
dnf install openscap-scanner scap-security-guide
oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --report /root/cis-before.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml

# Any distro: general hardening review (not a CIS scanner)
apt install lynis    # or dnf install lynis (EPEL)
lynis audit system
```

Read the failures and sort them into three piles: **safe to apply**, **needs testing against our workload**, and **won't apply (documented exception)**. The rest of this guide is mostly about the middle pile.

---

## The controls that cause outages

| Control | What breaks | Do this first |
|---|---|---|
| SSH `AllowGroups` / `AllowUsers` | Everyone not in the list, including you and your automation user | Add every SSH user to the group, check with `id` |
| SSH `PasswordAuthentication no` | Anyone without a working key | Test key login in a new session |
| Firewall default-deny inbound | Monitoring scrapes, backup agents, anything that listens | Inventory listeners and who connects to them |
| PAM `faillock` | A looping script locks the only admin/deploy account | Keep a second admin account, know `faillock --reset` |
| Password expiry | Service accounts with passwords expire on schedule | Convert to keys/tokens or lock their passwords |
| `noexec` on `/tmp` | Java/Python libraries that unpack native code into `/tmp`, some installers | Point the app's temp dir elsewhere |
| `net.ipv4.ip_forward = 0` | Docker, Podman, Kubernetes networking | Exclude on container hosts |
| `accept_ra = 0` | IPv6 addresses and routes learned via SLAAC | Only apply where IPv6 is static or unused |
| Disabling `squashfs` / `udf` | Snaps on Ubuntu, provisioning media on some clouds (Azure uses UDF) | Check your benchmark version and platform |
| auditd `-e 2` | Rules can't change without a reboot | Validate rules before locking |
| auditd disk-full actions (`halt`, `single`) | The server halts or drops to single-user mode when the audit partition fills | Size the partition, forward logs, decide per role |

> **Lockout warning:** SSH restrictions, PAM changes and firewall default-deny can each cut off remote access. Before any of them: confirm console access (cloud serial console, IPMI, hypervisor), keep an existing root session open, and test from a *new* session before you close the old one.

---

## A safe rollout order

Apply in this order and test between phases. Each phase gets riskier.

```
Phase 1 – Prepare
  [ ] Baseline scan saved (HTML + results file)
  [ ] Console / out-of-band access tested
  [ ] Inventory: listening ports (ss -tlnp), who connects, service accounts, automation users

Phase 2 – Low risk
  [ ] Disable unused filesystem and protocol kernel modules
  [ ] Remove/disable unused services
  [ ] Network sysctls (minus ip_forward on container hosts)
  [ ] File permissions on passwd/shadow/cron, world-writable cleanup

Phase 3 – auditd and logging
  [ ] auditd installed, rules loaded WITHOUT -e 2
  [ ] Audit log partition sized from measured event rate
  [ ] Log forwarding to your SIEM/syslog server

Phase 4 – SSH (lockout risk)
  [ ] Keys verified, groups populated, sshd -t passes
  [ ] Second session open; new-session test before closing

Phase 5 – PAM and accounts (lockout risk)
  [ ] Service accounts converted or exempted
  [ ] faillock and pwquality via authselect / pam-auth-update, not hand edits

Phase 6 – Firewall default-deny (lockout risk)
  [ ] Allow rules for every required inbound flow
  [ ] Applied with an automatic rollback scheduled

Phase 7 – Lock and verify
  [ ] auditd -e 2 if you want it
  [ ] Post-hardening scan; exceptions documented with a reason and compensating control
```

---

## Safety nets worth knowing

**Check the effective SSH config, not the file.** Modern OpenSSH reads drop-ins from `/etc/ssh/sshd_config.d/`, and for most options the **first** value it reads wins. Cloud images often ship a drop-in that sets `PasswordAuthentication yes`, which silently overrides your main file.

```bash
sshd -t                                     # syntax check
sshd -T | grep -Ei 'passwordauth|permitroot|allowgroups|maxauthtries'
```

**Firewall changes with a dead-man switch.** Schedule a revert, apply, test, then cancel:

```bash
# firewalld: runtime changes vanish on reload, so schedule a reload
echo 'firewall-cmd --reload' | at now + 5 minutes   # needs atd running
firewall-cmd --zone=public --remove-service=cockpit   # runtime-only change
# test from a new session, then:
firewall-cmd --runtime-to-permanent && atrm <job>
```

**sysctl files don't support trailing comments.** `net.ipv4.ip_forward = 0  # not on Docker hosts` makes the value invalid. Put comments on their own lines:

```ini
# /etc/sysctl.d/60-cis.conf
# Do not apply ip_forward on container hosts
net.ipv4.ip_forward = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
```

```bash
sysctl --system      # loads all sysctl.d files, reports errors
```

---

## Ubuntu, RHEL and Windows specifics

**Ubuntu:** USG (`usg audit` / `usg fix`) is Canonical's tooling for the CIS profiles. Watch for snaps (squashfs), the `ssh` unit name, and netplan/cloud-init drop-ins. Full guide: [CIS Level 1 Ubuntu hardening](/blog/cis-level1-ubuntu-hardening).

**RHEL family:** OpenSCAP and `scap-security-guide` ship in the base repos. PAM changes go through `authselect`, crypto settings through system-wide crypto policies, and SELinux matters. Full guide: [CIS RHEL Level 1 hardening](/blog/cis-rhel-level1-hardening).

**Windows Server:** the same ideas delivered through Group Policy, with different landmines (NTLM restrictions, account lockout, user rights). See [CIS Windows Server Level 1 hardening](/blog/cis-windows-server-level1-hardening).

---

## Don't stop at the OS

A CIS-clean OS running a web server with TLS 1.0 enabled and a database listening on `0.0.0.0` is still an easy target. Once the OS baseline is in place, check the services on top:

- NGINX: [NGINX CIS hardening checker](/tools/nginx-cis-hardening-checker) and [NGINX config analyzer](/tools/nginx-config-analyzer), plus [NGINX SSL hardening](/blog/nginx-ssl-hardening) for the TLS side.
- Known vulnerabilities in your NGINX version: [NGINX CVE checker](/tools/nginx-cve-checker).
- PostgreSQL: [PostgreSQL hardening checker](/tools/pg-hardening-checker).

---

## Keep it from drifting

Hardening decays. Package updates add services, someone opens a port "temporarily," a new VM is built from an old image. Put the baseline in your image build and configuration management, and re-scan on a schedule (monthly is common) so drift shows up in a report rather than an incident.

---

## FAQ

**Is CIS Level 1 enough for compliance?**
It covers the hardening part of most frameworks well. It doesn't cover patching, vulnerability management, access reviews or monitoring, and auditors will ask about those separately.

**Should I run the automatic remediation (usg fix, oscap --remediate, Ansible roles)?**
Yes, but only after reviewing the audit, on a test system first, with lockout-risk controls handled deliberately. Automatic fixes apply everything in the profile, including the controls in the table above.

**Can I apply CIS server benchmarks to containers?**
Not directly. Containers don't have their own kernel, sshd or mount table to harden. Use the CIS Docker or Kubernetes benchmarks for the platform, and keep images minimal.

**What do I do with a control that breaks my application?**
Record it as an exception with the reason, the systems it applies to, and a compensating control. A documented exception is normal. An undocumented gap is what fails audits.

---

*Related: [Linux log analysis guide](/blog/linux-log-analysis-guide) for using the audit trail you just built. [nftables migration guide](/blog/nftables-migration-guide) for writing the host firewall by hand.*
