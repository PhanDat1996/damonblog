---
title: "CIS Level 1 Ubuntu Hardening Without Breaking Production"
date: "2026-04-20"
updated: "2026-10-28"
excerpt: "Apply CIS Level 1 to Ubuntu 22.04/24.04 safely: audit with USG, then harden SSH, sysctl, auditd and /tmp without lockouts or broken Docker networking."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: true
category: "security"
---

You've been asked to bring a set of Ubuntu servers to CIS Level 1. The benchmark PDF runs to hundreds of pages, `usg fix` can apply most of it in one command, and you have a fair idea what happens if you run that on production without reading anything first: SSH stops letting people in, Docker containers lose network access, or a snap-based agent stops starting.

This guide follows the order you'd actually work in. Audit, sort the findings, then apply the low-risk controls before the ones that can lock you out. It also points out where Ubuntu behaves differently from generic Linux hardening advice.

> **Benchmark versions matter.** CIS publishes a separate benchmark for each Ubuntu LTS release, and recommendation numbers and Level 1/Level 2 assignments change between versions. This guide describes controls by what they do rather than by number. Check the details against the benchmark version your auditor uses.

---

## TL;DR

```bash
# 1. Audit (read-only)
pro enable usg && apt install usg
usg audit cis_level1_server

# 2. Review the failures. Decide what NOT to apply (tailoring file).
usg generate-tailoring cis_level1_server tailor.xml

# 3. Apply on a test box first, with console access
usg fix --tailoring-file tailor.xml
```

Then handle these deliberately, not via a blanket fix: SSH group restrictions, ufw default-deny, PAM lockout, `noexec` on `/tmp`, `ip_forward` on container hosts, and the auditd immutable flag.

---

## Audit first

### Ubuntu Security Guide (USG)

USG is Canonical's tool for the CIS and DISA-STIG profiles on Ubuntu 20.04 and later. It comes through Ubuntu Pro, which is free for personal use on a small number of machines and part of paid Pro subscriptions.

```bash
pro attach <token>          # if the machine isn't attached yet
pro enable usg
apt install usg

usg audit cis_level1_server
```

The audit writes an HTML report and an XML results file under `/var/lib/usg/`. Nothing on the system changes.

`usg fix` applies the whole profile. Use a **tailoring file** to switch off rules you've decided not to apply (for example IP forwarding on a Docker host), then pass it to both `audit` and `fix` so reports and changes agree:

```bash
usg generate-tailoring cis_level1_server tailor.xml
# edit tailor.xml: set selected="false" on rules you exclude
usg audit --tailoring-file tailor.xml
usg fix   --tailoring-file tailor.xml
```

### Lynis

Lynis isn't a CIS scanner, but it's a quick, free second opinion on any distribution:

```bash
apt install lynis
lynis audit system
```

It gives a hardening index and a list of suggestions. It's useful for spotting things CIS doesn't cover, less useful as compliance evidence.

---

## 1. Filesystem: `/tmp`, mount options, kernel modules

### `/tmp` as its own mount with `nodev,nosuid,noexec`

The benchmark wants `/tmp` on a separate mount with restrictive options. Other separate partitions (`/var`, `/var/tmp`, `/var/log`, `/var/log/audit`, `/home`) are mostly Level 2 in recent Ubuntu benchmarks, and they're easiest to get right at build time (Packer template, autoinstall, cloud image) rather than retrofitted.

A tmpfs `/tmp` is the simplest way to do it on an existing server:

```bash
# /etc/fstab
tmpfs  /tmp  tmpfs  defaults,rw,nosuid,nodev,noexec,relatime,size=2G  0  0
```

Mounting a new filesystem over `/tmp` on a live system hides whatever is already in it from running processes. Apply this at a reboot, then verify:

```bash
findmnt /tmp
# TARGET SOURCE FSTYPE OPTIONS
# /tmp   tmpfs  tmpfs  rw,nosuid,nodev,noexec,relatime,size=2097152k
```

| Option | Blocks |
|---|---|
| `nodev` | Device files on that filesystem |
| `nosuid` | setuid/setgid bits taking effect |
| `noexec` | Executing binaries directly from it |

> **What `noexec` breaks:** software that unpacks native code into `/tmp` and loads it. Java libraries that bundle native code (Netty, JNA, snappy, sqlite-jdbc) do this through `java.io.tmpdir`, and the typical error is `failed to map segment from shared object`. Some installers and package maintainer scripts do it too. Fix the application (`-Djava.io.tmpdir=/var/lib/myapp/tmp`, or `TMPDIR` for other tools) rather than dropping the control. If you can't, record an exception.

`noexec` isn't a strong security boundary: `bash /tmp/script.sh` or `python3 /tmp/x.py` still work, because the interpreter lives elsewhere. It blocks direct execution of dropped binaries, which is still worthwhile.

### Disable unused filesystem kernel modules

```bash
# /etc/modprobe.d/cis-filesystems.conf
install cramfs   /bin/false
blacklist cramfs
install freevxfs /bin/false
blacklist freevxfs
install jffs2    /bin/false
blacklist jffs2
install hfs      /bin/false
blacklist hfs
install hfsplus  /bin/false
blacklist hfsplus
```

The `install … /bin/false` line makes any load attempt fail. `blacklist` stops automatic loading by alias.

> **Don't disable `squashfs` on Ubuntu unless you've checked.** Snaps are squashfs images, so disabling it breaks every snap, including the snap-packaged agents some vendors ship. Likewise `udf`: Azure delivers provisioning data on UDF media. Recent Ubuntu benchmarks treat these two separately from the list above for those reasons.

---

## 2. Remove services you don't use

```bash
systemctl list-units --type=service --state=running --no-pager
ss -tulnp
```

Ubuntu Server and cloud images are already lean. Services the benchmark lists (Avahi, CUPS, DHCP/DNS/FTP/NFS servers, rpcbind, NIS, Samba, SNMP and others) are usually not installed. Where one is present and unused, remove it rather than just disabling it:

```bash
apt purge avahi-daemon cups rpcbind
```

Check that nothing depends on it first. `rpcbind`, for example, is needed if the box mounts NFSv3 shares. Recheck `ss -tulnp` afterward.

---

## 3. Network sysctls

```ini
# /etc/sysctl.d/60-cis-network.conf
# Comments must be on their own line; trailing comments make the value invalid.

# Not on Docker/Podman/Kubernetes hosts (see warning)
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0

net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1

# Only if IPv6 is static or unused (see warning)
net.ipv6.conf.all.accept_ra = 0
net.ipv6.conf.default.accept_ra = 0
```

```bash
sysctl --system                         # applies all files, prints errors
sysctl net.ipv4.conf.all.accept_redirects
```

> **Container hosts:** Docker turns on `net.ipv4.ip_forward` when it starts, because routing container traffic needs it. If your hardening sets it back to `0` (the next `sysctl --system`, a reboot where the order differs, a config-management run), containers lose outbound connectivity and published ports stop answering from other hosts, even though the containers themselves keep running. Exclude this control on container hosts and document why.

> **`accept_ra = 0`** stops the kernel from learning IPv6 addresses and default routes from router advertisements. On networks using SLAAC, including some cloud IPv6 setups, the server loses IPv6 connectivity. **`rp_filter = 1`** (strict) drops traffic on multi-homed hosts with asymmetric routing. Test both where those apply.

---

## 4. SSH

> **Lockout warning.** Before changing SSH: keep your current session open, confirm console access, and test every change from a **new** session before closing the old one.

### Where to put the settings on Ubuntu

Ubuntu's `/etc/ssh/sshd_config` starts with `Include /etc/ssh/sshd_config.d/*.conf`, and for most options sshd uses the **first** value it reads. Cloud images often ship `50-cloud-init.conf` with `PasswordAuthentication yes`. Put your settings in a drop-in that sorts first:

```bash
# /etc/ssh/sshd_config.d/00-cis.conf
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
DisableForwarding yes

LogLevel VERBOSE
Banner /etc/issue.net
```

Notes:

- **`KbdInteractiveAuthentication`** replaced `ChallengeResponseAuthentication` in OpenSSH 8.7. Ubuntu 22.04 and 24.04 ship newer versions.
- **`ClientAliveCountMax 0`** doesn't do what older guides claim. Since OpenSSH 8.2 a value of 0 *disables* the idle disconnect. Use a value above 0. Check your benchmark version for the exact interval it expects.
- **`DisableForwarding yes`** turns off TCP, agent, X11 and stream-local forwarding together. If developers rely on SSH tunnels or agent forwarding through this host, that's a deliberate trade-off. Recent benchmarks put full forwarding restrictions at Level 2.
- **Ciphers/MACs/KEX.** Ubuntu's OpenSSH defaults are already modern. If your benchmark requires an explicit list, build it from `ssh -Q cipher`, `ssh -Q mac` and `ssh -Q kex` on that host. `sshd -t` rejects algorithm names your OpenSSH doesn't know, and a hard-coded list from an old guide can drop the newer post-quantum key exchange your version would otherwise prefer.

### Apply safely

```bash
groupadd -f sshusers
usermod -aG sshusers alice
usermod -aG sshusers deploy          # automation users too
getent group sshusers

sshd -t                               # syntax check
sshd -T | grep -Ei 'passwordauth|permitroot|allowgroups|clientalive'   # effective values
systemctl restart ssh                 # the unit is "ssh" on Ubuntu
```

Then open a new terminal and log in. Only close the original session once that works.

---

## 5. Host firewall (ufw)

The Ubuntu benchmark expects a host firewall with default-deny inbound. With ufw:

> **Lockout warning:** enabling ufw with default deny and no SSH rule cuts off new SSH connections. Add the allow rule **first**.

```bash
ufw allow from 10.10.0.0/16 to any port 22 proto tcp   # or: ufw allow OpenSSH
ufw default deny incoming
ufw default allow outgoing
ufw enable
ufw status verbose
```

Inventory listeners (`ss -tulnp`) and who connects to them (monitoring, backups, load balancers) before enabling. Docker-published ports bypass ufw's INPUT rules. See [check firewall status on Linux](/blog/check-firewall-status-linux) for why.

---

## 6. Accounts and PAM

The benchmark covers password quality (`pam_pwquality`), lockout after failed attempts (`pam_faillock` on 22.04 and later; `pam_tally2` is gone), password history, and password aging in `/etc/login.defs`.

> **Lockout warning:** a broken PAM stack can stop *all* logins, including `sudo`. Keep a root shell open while you change PAM, and test `sudo -v` and a new SSH login before closing it.

Practical points:

- **Don't hand-edit `/etc/pam.d/common-*`.** Ubuntu regenerates them with `pam-auth-update`. Use USG, or the benchmark's method of adding a profile under `/usr/share/pam-configs/` and running `pam-auth-update`.
- **Faillock can lock your automation.** A deploy script that loops on a failing `sudo` locks its own account. Keep a second admin account, and know the recovery command: `faillock --user deploy --reset`.
- **`/etc/login.defs` aging values only apply to newly created accounts.** Existing users need `chage` (for example `chage --maxdays 365 alice`), which is what the remediation scripts do.
- **Service accounts shouldn't have passwords to expire.** Use keys or tokens, and lock the password (`passwd -l svc_app`).

---

## 7. auditd

```bash
apt install auditd audispd-plugins
systemctl enable --now auditd
```

A representative subset of benchmark-style rules, in `/etc/audit/rules.d/50-cis.rules`:

```bash
# Identity and privilege files
-w /etc/passwd   -p wa -k identity
-w /etc/group    -p wa -k identity
-w /etc/shadow   -p wa -k identity
-w /etc/gshadow  -p wa -k identity
-w /etc/sudoers   -p wa -k scope
-w /etc/sudoers.d -p wa -k scope

# Login records
-w /var/log/lastlog  -p wa -k logins
-w /var/run/faillock -p wa -k logins

# Commands run as another user (sudo, su)
-a always,exit -F arch=b64 -C euid!=uid -F auid!=unset -S execve -k user_emulation
-a always,exit -F arch=b32 -C euid!=uid -F auid!=unset -S execve -k user_emulation

# Kernel module loading/unloading
-a always,exit -F arch=b64 -S init_module,finit_module,delete_module -F auid>=1000 -F auid!=unset -k kernel_modules
-a always,exit -F path=/usr/bin/kmod -F perm=x -F auid>=1000 -F auid!=unset -k kernel_modules
```

The full benchmark adds rules for time changes, network configuration, mounts, permission changes, file deletion and privileged commands. USG generates the complete set. Module loading is watched with syscall rules because `insmod`, `modprobe` and `rmmod` on Ubuntu are symlinks to `kmod`, and a file watch on a symlink path doesn't reliably catch executions.

Load and check:

```bash
augenrules --load
auditctl -l | head
ausearch -k identity --start today
```

### The immutable flag

`-e 2` (usually in a file sorted last, such as `99-finalize.rules`) locks the rules until reboot. Leave it out until the ruleset has run cleanly for a while. A typo locked in with `-e 2` means a reboot to fix it.

### Disk space

Size `/var/log/audit` from a measured event rate, not a guess. Run the rules for a few days and watch `du -sh /var/log/audit`. In `/etc/audit/auditd.conf`, `max_log_file` (MB) and `num_logs` cap disk use with rotation. Some benchmark profiles instead require `max_log_file_action = keep_logs` and `halt`/`single` actions when the disk fills. That's a reasonable trade for some systems and an outage waiting to happen on others. Decide per server role, and forward logs off the box either way.

For working with the resulting logs, see [log analysis for incident triage](/blog/log-analysis-incident-triage).

---

## What typically breaks, and the fix

| Symptom after hardening | Likely control | Fix |
|---|---|---|
| `Permission denied (publickey)` for a valid user | `AllowGroups` | Add the user to the group from a working session or console |
| SSH password login still works | A `sshd_config.d` drop-in setting it first | `sshd -T`, put your settings in `00-*.conf` |
| Containers can't reach the internet | `ip_forward = 0` | Exclude on container hosts |
| Java service fails with `failed to map segment` | `noexec` on `/tmp` | Set `java.io.tmpdir` to an exec-allowed directory |
| Snaps fail to mount | `squashfs` disabled | Re-enable, or remove snaps deliberately |
| Deploy user locked out of sudo | `pam_faillock` | `faillock --user <u> --reset`, fix the looping script |
| Can't change audit rules | `-e 2` | Reboot with the corrected rules |

---

## Rollout checklist

```
[ ] usg audit saved as the baseline report
[ ] Console access tested; second admin account exists
[ ] Tailoring file excludes controls you won't apply, with reasons
[ ] Low-risk: modules, services, sysctl (minus exclusions), file permissions
[ ] auditd rules loaded without -e 2; disk sizing measured; forwarding set up
[ ] SSH: drop-in in sshd_config.d, groups populated, sshd -T verified, new-session test
[ ] ufw: allow rules first, then default deny, then enable
[ ] PAM via pam-auth-update/USG, sudo and login tested before closing root shell
[ ] Final usg audit; exceptions documented
```

Then build it into the image and configuration management, and re-audit on a schedule so drift shows up early.

---

## Beyond the OS

The benchmark hardens Ubuntu, not the services you run on it. For the layer above:

- [NGINX CIS hardening checker](/tools/nginx-cis-hardening-checker) and [NGINX SSL hardening](/blog/nginx-ssl-hardening) for the web tier.
- [NGINX CVE checker](/tools/nginx-cve-checker) for known vulnerabilities in your NGINX version.
- [PostgreSQL hardening checker](/tools/pg-hardening-checker) for the database.

---

## FAQ

**Is CIS Level 1 enough for production Ubuntu servers?**
It's a solid baseline for general-purpose servers: web, API, database. It doesn't replace patching, monitoring or access control, and it doesn't harden the applications you run.

**Does USG support Ubuntu 24.04?**
Yes. USG provides CIS profiles for 20.04, 22.04 and 24.04 through Ubuntu Pro. Run `usg list` (or check the USG documentation) for the profiles available on your release.

**Should I use usg fix or apply controls by hand?**
Use `usg fix` with a tailoring file for consistency, after you've reviewed the audit and tested on a non-production machine. Handle the lockout-risk controls deliberately either way.

**Does CIS hardening affect performance?**
Mostly no. auditd is the exception. A broad ruleset on a busy server costs CPU and disk I/O in proportion to activity, so measure before rolling it out fleet-wide.

---

*Related: [Linux security hardening guide](/blog/linux-security-hardening-guide) for the cross-distro rollout plan. [CIS RHEL Level 1 hardening](/blog/cis-rhel-level1-hardening) for the Red Hat side.*
