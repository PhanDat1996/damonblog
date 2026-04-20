---
title: "CIS RHEL Level 1 Hardening: What Actually Breaks in Production"
date: "2026-04-21"
excerpt: "CIS RHEL Level 1 hardening guide for production Red Hat systems — what breaks, what to apply first, and how to avoid SSH lockouts, auditd disk exhaustion, and PAM-related service outages."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: false
slug: "cis-rhel-level1-hardening-production-guide"
---

## The RHEL Server That Locked Everyone Out

A team applied CIS RHEL Level 1 via an Ansible role on a Saturday night. By Sunday morning, every SSH connection returned `Permission denied`. The automation pipeline was broken. The monitoring agent had stopped reporting. The on-call engineer spent four hours on the cloud provider's serial console undoing three specific controls that nobody had tested.

Every setting was technically correct per the CIS benchmark. None of it had been validated against the actual environment.

**CIS RHEL Level 1** is the right security baseline for Red Hat Enterprise Linux in production. But it is not a role you run and walk away from. This guide covers what matters, what breaks, and how to apply it without a Sunday morning recovery operation.

> **Production reality:** If you are running RHEL in a SOC 2, PCI-DSS, or HIPAA environment without a documented CIS baseline, you are already non-compliant — whether an auditor has noticed yet or not.

---

## Quick Summary: What Is CIS RHEL Level 1?

**CIS RHEL Level 1** is the baseline security profile from the Center for Internet Security Red Hat Enterprise Linux Benchmark. It defines configuration controls across SSH, PAM, auditd, filesystem, services, and firewall — the areas that address the most commonly exploited misconfigurations on Linux servers.

Key facts:

- A default RHEL install fails **40–60%** of Level 1 checks
- Level 1 controls are designed for broad applicability with minimal operational impact
- In practice, PAM changes, SSH restrictions, and auditd configuration each have documented failure modes in production
- Applying the full benchmark in one shot breaks environments reliably — phased deployment is not optional

**Level 1 vs Level 2:** Level 1 is the right target for general-purpose production RHEL servers. Level 2 adds stricter controls appropriate for high-security or air-gapped environments, at the cost of significant operational impact. Start with Level 1.

---

## Top 5 Quick Wins: Apply in 30 Minutes

These are high-impact, low-risk controls. Apply them first before working through the full benchmark.

**1. Disable root SSH login**

This is the single most targeted attack vector on internet-facing Linux servers.

```bash
# /etc/ssh/sshd_config
PermitRootLogin no

# Apply
systemctl reload sshd
```

**2. Enable and start auditd**

No audit daemon means no forensic capability after a breach. Enable it before anything else.

```bash
systemctl enable --now auditd
systemctl status auditd
```

**3. Enable firewalld**

Default RHEL has firewalld available but sometimes inactive. Enable it with default zone set to drop unnecessary traffic.

```bash
systemctl enable --now firewalld
firewall-cmd --state
firewall-cmd --list-all
```

**4. Set password aging policy**

Enforces maximum password age without requiring PAM changes.

```bash
# /etc/login.defs
PASS_MAX_DAYS   90
PASS_MIN_DAYS   7
PASS_WARN_AGE   14
```

**5. Remove world-writable permissions from sensitive files**

```bash
# Find world-writable files outside /tmp and /proc
find / -xdev -type f -perm -0002 \
  ! -path "/tmp/*" ! -path "/proc/*" ! -path "/sys/*" \
  -ls 2>/dev/null

# Fix: remove world-write bit
chmod o-w /path/to/file
```

---

## Why Default RHEL Is Not Secure

Red Hat ships RHEL with compatibility-first defaults. This is intentional — a general-purpose OS cannot know your workload. But it means:

| Default Setting | Security Risk |
|---|---|
| Root SSH login allowed | Direct root brute-force target |
| Password auth enabled | SSH brute-force via password guessing |
| `auditd` not configured | Zero forensic trail after compromise |
| Weak password policy | Trivial credentials on service accounts |
| `firewalld` may be inactive | All ports accessible if no other firewall |
| SUID binaries from packages | Unnecessary privilege escalation paths |
| `/tmp` not restricted | Payload staging and execution |
| `rpcbind` may be running | NFS enumeration endpoint |
| Unused kernel modules loaded | Expanded kernel attack surface |

**The Red Hat security baseline does not enforce itself.** Package updates can reset configs. New package installs add firewall exceptions. Without automated scanning, drift is invisible.

[See also: CIS Level 1 Ubuntu Hardening Guide](/blog/cis-level1-ubuntu-hardening) — same hardening discipline on Debian-based systems.

---

## Key Areas of CIS RHEL Level 1 Hardening

### SSH Hardening

SSH is the primary administrative interface on every RHEL server and the first thing attackers target. CIS Level 1 hardens it significantly from RHEL defaults.

```bash
# /etc/ssh/sshd_config — production-hardened configuration

# No root access over SSH
PermitRootLogin no

# Keys only — no passwords
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
KerberosAuthentication no
GSSAPIAuthentication no

# Restrict to approved groups
# ⚠️ Verify your account is in this group BEFORE applying
AllowGroups sshusers wheel

# Reduce attack window
MaxAuthTries 4
MaxSessions 10
LoginGraceTime 60

# Terminate idle sessions
ClientAliveInterval 300
ClientAliveCountMax 0

# Disable forwarding
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitUserEnvironment no

# Strong ciphers and MACs only
Ciphers aes128-ctr,aes192-ctr,aes256-ctr,aes128-gcm@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-256,hmac-sha2-512,hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com
KexAlgorithms curve25519-sha256,diffie-hellman-group14-sha256,diffie-hellman-group16-sha512

# Banner and logging
Banner /etc/issue.net
LogLevel VERBOSE
PrintLastLog yes
```

**Safe apply procedure:**

```bash
# Step 1: validate config
sshd -t

# Step 2: keep a second session open
# Step 3: reload (not restart — avoids dropping existing sessions)
systemctl reload sshd

# Step 4: test from a third terminal before closing anything
```

> **⚠️ Warning — SSH lockout is the most common CIS RHEL failure**
>
> **What breaks:** Adding `AllowGroups sshusers` when your account is not in that group. Setting `PasswordAuthentication no` before confirming key auth works. Both result in immediate lockout — even with valid credentials.
>
> **Why it breaks:** The change takes effect on the next connection attempt, not the current session. You will not know it is broken until you try to reconnect.
>
> **Fix:** Before applying SSH changes:
> ```bash
> # Confirm your key is in authorized_keys
> cat ~/.ssh/authorized_keys
>
> # Confirm group membership
> groups $(whoami)
>
> # Add yourself to AllowGroups target group if not present
> usermod -aG sshusers $(whoami)
>
> # Always keep a second session open during changes
> ```

> **⚠️ Warning — SSH hardening breaks Ansible and automation**
>
> **What breaks:** Ansible playbooks using password-based SSH, scripts using `ssh-keyscan` with weak key exchange algorithms, deployment tools relying on root SSH access.
>
> **Why it breaks:** Ansible's `ansible_password` connection method uses password auth. Scripts may use deprecated ciphers or KEX algorithms that are no longer in the allowed list.
>
> **Fix:** Before applying SSH cipher restrictions, test your automation:
> ```bash
> ssh -vvv -o "Ciphers=aes128-ctr" user@host
> # Look for "no matching cipher" in verbose output
> ```
> Update Ansible inventory to use key-based auth. Update any scripts using SSH to use supported algorithms.

---

### PAM and Password Policy

PAM controls authentication on every login, sudo, su, and service authentication on the system. CIS Level 1 hardens PAM significantly.

**Password quality (`/etc/security/pwquality.conf`):**

```bash
minlen = 14
minclass = 4
maxrepeat = 3
maxclasrepeat = 4
gecoscheck = 1
dcredit = -1
ucredit = -1
lcredit = -1
ocredit = -1
```

**Password aging (`/etc/login.defs`):**

```bash
PASS_MAX_DAYS   90
PASS_MIN_DAYS   7
PASS_WARN_AGE   14
ENCRYPT_METHOD  SHA512
```

**Failed authentication lockout (`/etc/security/faillock.conf`):**

```bash
deny = 5
unlock_time = 900
fail_interval = 900
```

Apply faillock to PAM (`/etc/pam.d/system-auth` and `/etc/pam.d/password-auth`):

```bash
# Add to auth section — before pam_unix
auth        required      pam_faillock.so preauth silent audit deny=5 unlock_time=900
auth        sufficient    pam_unix.so nullok try_first_pass
auth        [default=die] pam_faillock.so authfail audit deny=5 unlock_time=900

# Add to account section
account     required      pam_faillock.so
```

> **⚠️ Warning — PAM changes break service accounts and sudo**
>
> **What breaks:** Service accounts with expired or non-compliant passwords stop authenticating. Accounts that do not meet the new `pwquality` requirements cannot change their passwords through normal means. `faillock` configured incorrectly can break `sudo`.
>
> **Why it breaks:** PAM applies to every authentication on the system. A misconfigured `pam_faillock.so` in the wrong position in the auth stack can cause all authentication to fail — including root console login.
>
> **Fix:** Before applying PAM changes:
> - Test in a staging environment with your exact RHEL version
> - Always keep a root console session open during PAM changes
> - Test `sudo` and `su` immediately after each change
> - Back up PAM config files before modifying:
> ```bash
> cp /etc/pam.d/system-auth /etc/pam.d/system-auth.bak
> cp /etc/pam.d/password-auth /etc/pam.d/password-auth.bak
> ```

> **⚠️ Warning — Password aging causes service outages**
>
> **What breaks:** Any account with `PASS_MAX_DAYS` set will eventually have its password expire. Service accounts using passwords (rather than keys or tokens) will fail authentication on expiry — often at 2am on a Saturday.
>
> **Fix:** Before enforcing password aging:
> ```bash
> # Audit all accounts with password-based auth
> awk -F: '$2 != "!" && $2 != "*" {print $1}' /etc/shadow
>
> # Set service accounts to never expire
> chage -M -1 service_account_name
>
> # Or convert them to key-based or token-based auth entirely
> ```

---

### Auditd

`auditd` is the Linux kernel audit daemon. CIS Level 1 requires it running with specific rules covering privilege escalation, identity changes, and system modifications.

**Install and enable:**

```bash
dnf install audit audit-libs -y
systemctl enable --now auditd
```

**Production audit rules (`/etc/audit/rules.d/99-cis-rhel.rules`):**

```bash
# Remove existing rules
-D

# Buffer size — increase on busy systems
-b 8192

# Failure mode — 2 = panic on failure (required by some CIS controls)
# Use 1 (printk only) in production until log sizing is confirmed
-f 1

# --- Identity files ---
-w /etc/passwd  -p wa -k identity
-w /etc/group   -p wa -k identity
-w /etc/shadow  -p wa -k identity
-w /etc/gshadow -p wa -k identity
-w /etc/sudoers -p wa -k sudoers
-w /etc/sudoers.d -p wa -k sudoers

# --- SSH configuration ---
-w /etc/ssh/sshd_config -p wa -k sshd_config

# --- Authentication ---
-w /var/log/lastlog  -p wa -k logins
-w /var/run/faillock -p wa -k logins

# --- Privilege escalation syscalls ---
-a always,exit -F arch=b64 -S setuid  -F a0=0 -F exe=/usr/bin/su -k elevated_privs
-a always,exit -F arch=b64 -S setresuid -F a0=0 -F exe=/usr/bin/sudo -k elevated_privs
-a always,exit -F arch=b64 -S execve -C uid!=euid -F euid=0 -k elevated_privs

# --- Module loading (persistence vector) ---
-w /sbin/insmod  -p x -k modules
-w /sbin/rmmod   -p x -k modules
-w /sbin/modprobe -p x -k modules
-a always,exit -F arch=b64 -S init_module -S delete_module -k modules

# --- Crontab changes ---
-w /etc/crontab -p wa -k cron
-w /etc/cron.d  -p wa -k cron

# Make rules immutable — requires reboot to change
# Leave commented during initial setup
# -e 2
```

Apply and verify:

```bash
augenrules --load
auditctl -l | head -30
ausearch -k sudoers | tail -5   # test: check for sudoers events
```

> **⚠️ Warning — auditd fills disk and freezes the system**
>
> **What breaks:** On a busy RHEL server (high login volume, many setuid calls, active cron jobs), the audit log at `/var/log/audit/audit.log` fills gigabytes per day. When the partition fills completely, behavior depends on `-f` setting. With `-f 2` (panic mode, required by strict CIS compliance), **the kernel panics** — the system halts.
>
> **Why it breaks:** Default `/var/log/audit` partition is often 1–2GB. CIS-required rules generate orders of magnitude more events than default auditd configuration.
>
> **Fix:**
> ```bash
> # Check current audit log size and rate
> du -sh /var/log/audit/
> watch -n 5 'du -sh /var/log/audit/audit.log'
>
> # Size the audit partition — minimum 10GB for busy servers
> # Configure rotation in /etc/audit/auditd.conf
> max_log_file = 500           # MB per file
> num_logs = 20                # keep 20 rotated files (10GB total)
> max_log_file_action = ROTATE
>
> # Set up remote log forwarding before enabling -f 2
> # audisp-remote or rsyslog with auditd plugin
> ```

> **⚠️ Warning — `-e 2` is irreversible until reboot**
>
> **What breaks:** With `-e 2` active, audit rules cannot be modified without a reboot. A mistake in a rule path or syntax is locked in.
>
> **Fix:** Test all rules thoroughly. Verify with `auditctl -l` and `ausearch`. Add `-e 2` only after confirmed correct. In production, schedule the rule lock for a maintenance window.

---

### File Permissions and SUID

CIS Level 1 requires restricting SUID/SGID binaries and world-writable files.

**Find and audit SUID binaries:**

```bash
# List all SUID binaries on the system
find / -xdev -perm -4000 -type f -ls 2>/dev/null

# Common legitimate SUID binaries on RHEL
# /usr/bin/sudo, /usr/bin/su, /usr/bin/passwd, /usr/bin/newgrp
# /usr/bin/chage, /usr/bin/gpasswd, /usr/bin/mount, /usr/bin/umount

# Anything outside this list warrants investigation
# Remove SUID bit from unnecessary binaries
chmod u-s /path/to/unnecessary/binary
```

**Find world-writable directories (excluding /tmp, /var/tmp):**

```bash
find / -xdev -type d -perm -0002 \
  ! -path "/tmp" ! -path "/tmp/*" \
  ! -path "/var/tmp" ! -path "/var/tmp/*" \
  -ls 2>/dev/null
```

**Restrict `/tmp` and `/var/tmp`:**

```bash
# /etc/fstab — bind mount /tmp with restrictions
tmpfs  /tmp      tmpfs  defaults,rw,nosuid,nodev,noexec,relatime  0  0

# For /var/tmp — bind mount to /tmp with same restrictions
/tmp  /var/tmp  none  bind  0  0
```

> **⚠️ Warning — Removing SUID bits breaks applications**
>
> **What breaks:** Applications that rely on SUID for legitimate privilege operations. Common culprits: database installers, legacy monitoring agents, custom in-house tools written before capabilities were available.
>
> **Why it breaks:** SUID allows a binary to run with the owner's permissions regardless of who executes it. Removing it causes the binary to run as the calling user — which may lack required permissions.
>
> **Fix:** Before removing any SUID bit, understand what the binary does and whether it is in active use:
> ```bash
> # Check if a binary is being executed
> ausearch -f /path/to/binary -ts today 2>/dev/null
> lsof /path/to/binary
>
> # Test removal in staging — do not remove in production without testing
> ```

---

### Firewall: firewalld

CIS Level 1 requires firewalld enabled with default deny inbound.

```bash
# Enable and start
systemctl enable --now firewalld

# Set default zone to drop or block
firewall-cmd --set-default-zone=drop --permanent

# Allow required services by name
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=https

# Or by port — restrict SSH to management network only
firewall-cmd --permanent --add-rich-rule='
  rule family="ipv4"
  source address="10.10.1.0/24"
  port port="22" protocol="tcp"
  accept'

# Remove default allow-all services if present
firewall-cmd --permanent --remove-service=dhcpv6-client
firewall-cmd --permanent --remove-service=cockpit

# Apply all changes
firewall-cmd --reload

# Verify
firewall-cmd --list-all
```

**Disable unused network protocols:**

```bash
# /etc/modprobe.d/cis-disable-protocols.conf
install dccp  /bin/true
install sctp  /bin/true
install rds   /bin/true
install tipc  /bin/true
```

> **⚠️ Warning — Default drop zone breaks monitoring and backup**
>
> **What breaks:** Monitoring agents being polled from external hosts (Zabbix, Prometheus node_exporter, Nagios), backup agents receiving connections (Veeam, Commvault, Bacula), internal services accepting inbound connections.
>
> **Why it breaks:** The default zone change applies immediately to all interfaces. Traffic that was previously allowed by the pre-existing zone rules is now dropped silently.
>
> **Fix:** Before changing the default zone, document all inbound communication requirements:
> ```bash
> # Monitor incoming connections for 1 week before changing firewall policy
> journalctl -u firewalld | grep ACCEPT | awk '{print $NF}' | sort | uniq -c | sort -rn
>
> # Or use ss to identify what is listening and who connects
> ss -tnp state established
> ```
> Build the allow rules before changing the default zone.

---

## Tools for Applying and Verifying CIS RHEL Level 1

### OpenSCAP — The Primary Audit Tool on RHEL

OpenSCAP is built into RHEL and supports the CIS benchmark natively via the `scap-security-guide` package.

```bash
# Install
dnf install openscap-scanner scap-security-guide -y

# List available CIS profiles for your RHEL version
oscap info /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml | grep -i cis

# Run CIS Level 1 audit — read-only, no changes
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --results /tmp/cis-results.xml \
  --report /tmp/cis-report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml

# Open the HTML report
# This is what you hand to auditors
```

**Auto-remediation (use with extreme caution — test in staging first):**

```bash
oscap xccdf eval \
  --remediate \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --results /tmp/cis-remediate-results.xml \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

### CIS-CAT Pro — For Multi-System Compliance Scanning

CIS-CAT Pro produces detailed per-control reports across multiple hosts. Useful for fleet-wide compliance reporting.

```bash
# Run CIS-CAT assessment against RHEL 9
./CIS-CAT.sh \
  -b benchmarks/CIS_Red_Hat_Enterprise_Linux_9_Benchmark_v1.0.0-xccdf.xml \
  -p "Level 1 - Server" \
  -r /var/reports/ \
  -rd html
```

### Ansible — For Repeatable Deployment

The `linux-system-roles` project and community CIS roles provide Ansible-based CIS hardening.

```bash
# Install the RHEL system roles
dnf install rhel-system-roles -y

# Or use community CIS role
ansible-galaxy install MindPointGroup.RHEL8-CIS

# Example playbook structure
cat > cis-hardening.yml << 'EOF'
---
- hosts: rhel_servers
  become: yes
  vars:
    rhel8cis_level1_patching: true
    rhel8cis_ssh_allowgroups: "sshusers wheel"
    rhel8cis_auditd_max_log_file: 500
    rhel8cis_auditd_num_logs: 20
  roles:
    - MindPointGroup.RHEL8-CIS
EOF

# Run in check mode first — no changes
ansible-playbook cis-hardening.yml --check --diff

# Apply to staging
ansible-playbook cis-hardening.yml -l staging
```

**Always run Ansible roles in `--check --diff` mode first.** CIS Ansible roles make significant changes. Reviewing the diff before applying is not optional.

[See also: Reading Logs Like a Detective — for building forensic capability on hardened systems](/blog/log-analysis-incident-triage)

---

## Real-World Incidents from Production Environments

**Incident 1 — SSH AllowGroups locked out the entire team.**

An engineer applied the CIS SSH configuration including `AllowGroups sshusers`. The deployment user running Ansible was in `wheel` but not in `sshusers`. On the next SSH attempt, every connection returned `Permission denied`. The team had no console access configured for that batch of VMs.

Recovery took 3 hours: enable serial console access via the cloud provider, boot to rescue mode, edit `sshd_config` to remove `AllowGroups`, reboot.

**The lesson:** Test SSH config changes on one server with console access ready. Add `AllowGroups` only after confirming every required account is in the target group. Automate this check in your Ansible pre-tasks.

---

**Incident 2 — auditd filled `/var/log` and triggered kernel panic.**

A database server was hardened with full CIS auditd rules including `-f 2` (panic on failure). The server handled a high volume of database authentication events — roughly 40,000 audit events per hour. The `/var/log/audit` partition was 2GB. It filled in 48 hours. The kernel panicked. The database went down at 6am on a Tuesday.

The actual data was safe — database files were on a separate volume. But the unplanned downtime triggered an incident review.

The fix: separate `/var/log/audit` onto a dedicated 50GB partition, configure `audisp-remote` to forward events to a central SIEM, switch from `-f 2` to `-f 1` on this server class, and document it as an exception.

**The lesson:** Size audit partitions before enabling `-f 2`. Measure actual event rate on your specific workload — it varies enormously. A busy database server generates 10x more audit events than a static web server.

---

**Incident 3 — PAM faillock broke sudo after a botched deployment.**

A deployment script had a bug: it ran `sudo systemctl restart app` in a loop on failure. The loop ran 15 iterations before someone stopped it. With `pam_faillock.so` configured at 5 attempts, the deployment user's account was locked. Since the deployment user was the only account with sudo access on that server, no one could run privileged commands.

The account unlocked after 15 minutes — but the deployment window had passed. The fix took a console session.

**The lesson:** Monitor for `pam_faillock` lockout events (check `/var/run/faillock/`) as part of your deployment monitoring. Add alerting on unexpected lockouts. Ensure at least two accounts have sudo access on every server.

```bash
# Check faillock status for a user
faillock --user deployuser

# Unlock manually if needed
faillock --user deployuser --reset
```

---

## Implementation Strategy: Deploy Without Incidents

**Phase 1 — Baseline Assessment (Week 1)**

```bash
# Run OpenSCAP — read-only, no changes
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --report /tmp/baseline-report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

- Record initial score
- Identify controls that will conflict with your workload
- Document service accounts, automation users, monitoring agents

**Phase 2 — Zero-risk controls (Week 2)**

Apply controls with no operational dependencies:

- Disable unused kernel modules (`/etc/modprobe.d/`)
- Disable unused network protocols (DCCP, SCTP, RDS, TIPC)
- Set kernel parameters (`/etc/sysctl.d/99-cis.conf`)
- Enable `firewalld` logging only — no policy changes yet
- Set audit log to 500MB files, 20 rotation files

**Phase 3 — SSH and account policies (Week 3)**

- Convert automation to key-based auth before touching SSH config
- Validate `AllowGroups` membership for all accounts that need SSH
- Apply SSH hardening — test on one server before fleet rollout
- Set password aging policy (`/etc/login.defs`)
- Audit service accounts — apply `chage -M -1` to service accounts

**Phase 4 — PAM and auditd (Week 4)**

- Apply PAM password quality settings — test with a non-critical account
- Enable `pam_faillock` in test environment first
- Apply full auditd rules — measure event rate on representative servers
- Configure `audisp-remote` or SIEM forwarding
- Validate `-f 1` vs `-f 2` decision per server role

**Phase 5 — Firewall enforcement (Week 5)**

- Review firewall logs collected since Phase 2
- Document all inbound communication requirements
- Build role-specific firewall configurations
- Apply firewall policy to staging for 1 week
- Apply to production with rollback (firewall-cmd snapshot)

**Phase 6 — Verify and document**

```bash
# Final compliance scan
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --report /tmp/post-hardening-report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

- Capture final OpenSCAP score and report
- Document all exceptions with business justification
- Store compliance evidence with your audit package

---

## Best Practices

**Automate with Ansible — never apply by hand.**
Manual changes drift. A CIS hardening baseline applied manually across 50 servers will be different on every server within 60 days. Use Ansible or Puppet to enforce configuration state. Schedule monthly runs to catch drift.

**Keep separate configs per server role.**
A web server, a database server, and a bastion host have different requirements. One monolithic CIS GPO/playbook that applies to everything will either be too restrictive for some servers or too permissive for others. Build role-specific hardening profiles.

**Always have console access before applying.**
Before touching SSH, PAM, or firewall configurations on any server, verify you have an out-of-band access path — serial console, IPMI, cloud provider console, or a trusted bastion host with separate access. This is not paranoia. It is a prerequisite.

**Monitor audit log growth rate before locking rules.**
Measure actual audit event volume on your workload before deciding on log partition size and `-f` setting. Run with `-f 1` in production until you have 2 weeks of baseline data. Then make an informed decision about `-f 2`.

**Re-scan monthly.**
RHEL system updates, package installs, and configuration changes all create drift. Schedule OpenSCAP scans as a monthly cron job and alert on score drops greater than 5 points.

**Document every exception with justification.**
Some controls will be incompatible with your workload. Service accounts that cannot use key-based auth. Applications that require SUID binaries. Document every exception with a business justification and a compensating control. Auditors expect this.

---

## Frequently Asked Questions

**Does CIS RHEL Level 1 apply to RHEL 8 and RHEL 9?**
Yes. CIS maintains separate benchmarks for RHEL 8 and RHEL 9. The `scap-security-guide` package on each RHEL version includes the appropriate benchmark content. Use `ssg-rhel8-ds.xml` for RHEL 8, `ssg-rhel9-ds.xml` for RHEL 9.

**Does this apply to CentOS Stream or AlmaLinux?**
CIS publishes benchmarks for CentOS and AlmaLinux separately. The RHEL benchmark content in `scap-security-guide` often has equivalent profiles for RHEL-compatible distributions. Check `oscap info` on your specific OS for available profiles.

**Does CIS Level 1 break SELinux?**
No — CIS Level 1 requires SELinux to be in enforcing mode. If your applications break after hardening, it may be SELinux policy issues unrelated to CIS. Check `ausearch -m avc -ts recent` for SELinux denials before blaming CIS controls.

**How do I handle CIS hardening on systems managed by Red Hat Satellite?**
Apply CIS controls via Satellite's Policy and Compliance features, which integrate with OpenSCAP. This allows centralized compliance scanning and reporting across your RHEL fleet without running `oscap` manually on each host.

---

## Conclusion: Engineering Work, Not a Checklist

**CIS RHEL Level 1** closes the gaps that matter — SSH brute-force vectors, anonymous access to system information, privilege escalation paths, and the absent audit trail that makes breach forensics impossible.

The controls that cause the most production incidents are also the ones with the clearest fixes: SSH `AllowGroups` requires group membership validation, auditd requires partition sizing and log forwarding, PAM changes require backup and staged testing, firewall changes require inbound documentation first.

Apply in phases. Audit before you change anything. Keep console access available. Convert service accounts to key-based auth before touching PAM. Size your audit partitions before enabling verbose logging.

**The Red Hat security baseline is not optional** for any RHEL system in a regulated environment. CIS Level 1 is how you meet it without breaking production.

The teams that get this right treat it as systems engineering. The teams that get it wrong run Ansible roles on Friday afternoons.

---

*Related reading: [CIS Level 1 Ubuntu Hardening: A Field-Tested Production Guide](/blog/cis-level1-ubuntu-hardening) — same discipline on Debian-based systems. [CIS Windows Server Level 1 Hardening](/blog/cis-windows-server-level1-hardening-production-guide) — for mixed Linux/Windows environments.*