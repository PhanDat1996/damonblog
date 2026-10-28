---
title: "CIS Windows Server Level 1 Hardening Without Outages"
date: "2026-04-20"
updated: "2026-10-28"
excerpt: "Roll out CIS Level 1 on Windows Server via GPO without breaking NTLM apps, locking service accounts, or losing remote access. What each risky control does."
tags: ["security", "infrastructure", "security-ops", "windows"]
featured: false
category: "security"
---

The CIS GPO goes live on the server OU on a Friday. On Monday, a line-of-business app can't reach its file share, a service account keeps locking every fifteen minutes, and the backup server can't talk to its agents. Nothing in the GPO was wrong in isolation. It just hadn't been checked against the environment.

This guide covers how to deliver CIS Level 1 on Windows Server, the handful of controls that cause most of the breakage, and what to measure before you enforce each one.

> **Benchmark versions matter.** CIS publishes a benchmark per Windows Server release (2016, 2019, 2022, 2025) and revises each one. Values and Level assignments change between versions, so this guide describes settings by name and gives values as found in recent versions. Check them against the exact benchmark your auditor uses.

---

## TL;DR

- Each benchmark has separate profiles for **Domain Controllers** and **Member Servers**. Use the right one per OU.
- Deliver through **Group Policy** (domain) or **LGPO.exe** (standalone). Scan before and after.
- High-risk controls: **NTLM restrictions**, **account lockout**, **user rights that deny local accounts network/RDP access**, **SMB signing**, and **firewall policy that ignores local rules**.
- Account policies in a GPO linked to a server OU **don't change domain account policy**. That only comes from a GPO at the domain root or from fine-grained password policies.

---

## How the benchmark is organized

Each recommendation is tagged with profiles such as:

| Profile | Applies to |
|---|---|
| Level 1 – Domain Controller | DCs |
| Level 1 – Member Server | Domain-joined and standalone servers |
| Level 2 – DC / MS | Stricter additions on top of Level 1 |
| Next Generation Windows Security, BitLocker | Optional add-on profiles in recent versions |

Most settings live in **Security Settings** (account policies, local policies, advanced audit policy) and **Administrative Templates**. That's why GPO is the natural delivery mechanism.

---

## Audit before you enforce

Options for measuring where you stand:

- **CIS-CAT** (Lite is free with a limited benchmark set; Pro is part of CIS SecureSuite membership) produces a scored report per recommendation.
- **Microsoft Security Compliance Toolkit**: free. It includes Microsoft's own security baselines, **Policy Analyzer** to compare GPOs and local policy against a baseline, and **LGPO.exe**. Microsoft's baseline overlaps heavily with CIS Level 1 but isn't identical.
- **Resultant policy:** `gpresult /h C:\Temp\gp.html` shows which GPO set what, which matters when CIS settings collide with existing GPOs.

Record a baseline per **server role** (DC, file server, SQL, RDS, web), not just one server. The breakage is role-specific.

---

## Delivery: GPO and LGPO

**Domain-joined servers:** build the CIS settings into GPOs (CIS SecureSuite members get ready-made "Build Kit" GPO backups), link them to a **test OU** with representative servers, then expand. Splitting by area (account/audit, security options, user rights, firewall) makes rolling back one area easy.

**Standalone servers:**

```cmd
:: Back up current local policy first
LGPO.exe /b C:\Backup\pre-cis

:: Import a GPO backup into local policy
LGPO.exe /g C:\CIS\GPO-Backup-Folder
```

`secedit` can apply and compare security templates (`.inf`) for the Security Settings portion only:

```cmd
secedit /analyze /db C:\Temp\cis.sdb /cfg C:\CIS\cis-l1.inf /log C:\Temp\analyze.log
```

---

## Account policies

Values in recent Member Server Level 1 recommendations:

```
Enforce password history:                 24
Maximum password age:                     365 days or fewer, not 0
Minimum password age:                     1 day or more
Minimum password length:                  14
Password must meet complexity:            Enabled
Relax minimum password length limits:     Enabled
Store passwords using reversible enc.:    Disabled

Account lockout threshold:                5 or fewer, not 0
Account lockout duration:                 15 minutes or more
Reset account lockout counter after:      15 minutes or more
Allow Administrator account lockout:      Enabled
```

### The GPO scope trap

Password and lockout policy for **domain accounts** comes only from a GPO linked at the **domain root** (normally the Default Domain Policy) or from **fine-grained password policies**. A CIS GPO linked to a server OU sets these values for the **local** accounts on those servers and nothing else. Scanners check the local policy, so the scan passes while domain users are unaffected. If you mean to change domain policy, change it at the domain level, deliberately.

### Lockout and service accounts

> **What breaks:** a service, scheduled task or mapped drive still using an old password retries in the background, hits the threshold within minutes, and locks the account. It unlocks after the duration and locks again, in a loop.

Before tightening lockout:

- Move service accounts to **group Managed Service Accounts (gMSA)** where the application supports them. Windows rotates their passwords automatically.
- Find the source of lockouts: **Event ID 4740** on DCs (the PDC emulator sees them all) names the locked account and the caller computer. **4625** (failed logon) and **4771** (Kerberos pre-auth failed) on the source side show the process or service.
- Alert on 4740 for service accounts. A lockout loop is easy to fix once someone notices it.

---

## Audit policy and event logs

CIS uses **Advanced Audit Policy** subcategories and enables **"Audit: Force audit policy subcategory settings to override audit policy category settings"** so legacy category settings don't silently override them.

A sample of Member Server Level 1 subcategories:

| Subcategory | Recommended |
|---|---|
| Credential Validation | Success and Failure |
| Security Group Management | include Success |
| User Account Management | Success and Failure |
| Process Creation | include Success |
| Account Lockout | include Failure |
| Logon | Success and Failure |
| Special Logon | include Success |
| Audit Policy Change | include Success |
| Sensitive Privilege Use | Success and Failure |
| System Integrity | Success and Failure |

The benchmark also enables **"Include command line in process creation events"**, which makes Event 4688 useful for investigations.

To set or check locally:

```cmd
auditpol /set /subcategory:"Credential Validation" /success:enable /failure:enable
auditpol /set /subcategory:"Process Creation" /success:enable
auditpol /get /category:*
```

Subcategory names are localized on non-English systems. GPO is easier than scripting `auditpol` across a fleet.

### Log size: the real risk is losing evidence

The default maximum size of the Security log is **20 MB** (20,480 KB). Recent benchmarks require at least **196,608 KB** (192 MB) for Security and 32,768 KB for Application, System and Setup. With Process Creation and Logon auditing enabled, a busy server rolls a 20 MB log over in hours, so by the time you investigate, the events are gone.

```cmd
:: 1 GB Security log (value in bytes). A GPO setting overrides this.
wevtutil sl Security /ms:1073741824
wevtutil gl Security
```

About halting: the setting **"Audit: Shut down system immediately if unable to log security audits"** (`CrashOnAuditFail`) is recommended to be **Disabled** in CIS Level 1. With the default retention (overwrite as needed), a full Security log doesn't stop the server. Local logs are also the first thing an intruder clears. Forward events to a collector (Windows Event Forwarding or your SIEM agent) so a copy exists off the box. See [security log analysis for Windows and web servers](/blog/log-analysis-security-windows-webserver) for what to look for in them.

---

## User rights assignment

Selected Member Server Level 1 values:

```
Access this computer from the network:          Administrators, Authenticated Users
Allow log on locally:                           Administrators
Allow log on through Remote Desktop Services:   Administrators, Remote Desktop Users
Deny access to this computer from the network:  Guests, Local account and member of Administrators group
Deny log on through Remote Desktop Services:    Guests, Local account
Debug programs:                                 Administrators
Act as part of the operating system:            No One
```

> **What breaks:** the two "Deny … Local account" rights stop **local** accounts, including a LAPS-managed local admin, from logging on over the network or RDP. That's intentional, because it blocks lateral movement with a shared local admin password. It also breaks admin scripts, PsExec sessions, backup or monitoring agents, and RDP sessions that authenticate with local credentials.

Before applying: make sure remote administration uses domain accounts, keep the LAPS local admin for **console** break-glass use (local console logon is still allowed for Administrators), and find tools that authenticate with local accounts (look for 4624 logon type 3 with a local account name).

On DCs the values differ (for example, "Allow log on through Remote Desktop Services" is Administrators only). Use the DC profile there.

---

## Security options: NTLM, SMB signing, anonymous access

Selected Level 1 values:

```
Network security: LAN Manager authentication level
  -> Send NTLMv2 response only. Refuse LM & NTLM
Network security: Minimum session security for NTLM SSP (clients and servers)
  -> Require NTLMv2 session security, Require 128-bit encryption
Network security: LDAP client signing requirements
  -> Negotiate signing (or higher)
Microsoft network client: Digitally sign communications (always)  -> Enabled
Microsoft network server: Digitally sign communications (always)  -> Enabled
Network access: Do not allow anonymous enumeration of SAM accounts            -> Enabled
Network access: Do not allow anonymous enumeration of SAM accounts and shares -> Enabled
Interactive logon: Don't display last signed-in                    -> Enabled
Accounts: Guest account status                                     -> Disabled
Accounts: Rename administrator account                             -> (a non-default name)
```

### NTLM: find v1 users before refusing them

> **What breaks:** devices and software that can only do LM or NTLMv1, typically old NAS appliances, scanners and copiers saving to shares, legacy application components. They usually fail with a generic "access denied," with nothing pointing at NTLM.

Measure first:

- On servers and DCs, **Event 4624** (successful logon) includes `Package Name (NTLM only)`. Filter for `NTLM V1` to find who still uses it, from which workstation name and IP.
- On DCs, enable **"Network security: Restrict NTLM: Audit NTLM authentication in this domain"**, and on servers **"Restrict NTLM: Audit Incoming NTLM Traffic"**. The results appear in the `Microsoft-Windows-NTLM/Operational` log.
- Leave the audit running long enough to catch monthly and quarterly jobs, not just a week.

NTLMv1 is on its way out regardless: Microsoft removed it in Windows 11 24H2 and Windows Server 2025, so anything that depends on it needs replacing anyway.

### SMB signing

Requiring signing breaks old SMB clients and appliances that don't support it, and adds CPU overhead on very high-throughput file servers. Server 2025 and Windows 11 24H2 already require signing by default in more cases. Test file servers and anything that writes to them (scanners, backup targets).

---

## Windows Defender Firewall

Recent Level 1 recommendations for all three profiles: firewall **On**, inbound **Block** (default), outbound **Allow** (default), notifications off, logging of dropped packets and successful connections, and a log size of at least 16,384 KB. For the **Public** profile, they also set the firewall to **ignore locally created rules**, so only rules from Group Policy apply.

> **Lockout warning:** if a server ends up on the Public profile (a standalone server, or a domain server whose network wasn't identified as the domain network), the local allow rules your applications and admins created stop applying, including RDP or WinRM rules added by hand. Deliver required allow rules (RDP from your management subnet, WinRM, monitoring, backup) **through GPO**, and check `Get-NetConnectionProfile` on a test server before rollout.

```powershell
Get-NetConnectionProfile                       # which profile is each NIC on?
Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, AllowLocalFirewallRules

# Find what currently comes in, before enforcing anything
Get-NetTCPConnection -State Established |
  Where-Object LocalPort -lt 49152 |
  Group-Object LocalPort | Sort-Object Count -Descending
```

Turn on logging of allowed connections a week or two ahead and review `pfirewall.log` to build the allow list from real traffic.

---

## Name resolution hardening (worth doing anyway)

**"Turn off multicast name resolution"** (LLMNR) is in the benchmark, and recent versions also restrict NetBIOS name resolution. Both protocols are abused by LLMNR/NBT-NS poisoning tools to capture NTLM hashes on the local network. Disable them through GPO in a domain:

```
Computer Configuration > Administrative Templates > Network > DNS Client
  > Turn off multicast name resolution = Enabled
```

For one server without GPO:

```powershell
New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient" -Force | Out-Null
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient" `
  -Name EnableMulticast -Value 0 -Type DWord

# NetBIOS over TCP/IP off on all IP-enabled adapters (2 = disable)
Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" |
  Invoke-CimMethod -MethodName SetTcpipNetbios -Arguments @{ TcpipNetbiosOptions = 2 }
```

Check first that nothing still relies on NetBIOS names (very old applications, some legacy clusters).

To rename the local Administrator on a standalone server: `Rename-LocalUser -Name Administrator -NewName <name>`. In a domain, use the GPO setting so it's enforced everywhere.

---

## Rollout order

```
1. Baseline scan per server role; gpresult to see existing GPO conflicts
2. Test OU with one server per role; console/ILO/hypervisor access confirmed
3. Low risk: anonymous enumeration, LLMNR, guest account, admin rename, log sizes, event forwarding
4. Audit policy; measure event volume on DCs and busy servers
5. Account lockout (local accounts; domain policy separately, deliberately) with 4740 alerting
6. User rights (local account deny) after moving remote admin to domain accounts
7. NTLM audit for weeks, then enforce; SMB signing tested on file servers
8. Firewall rules delivered via GPO, verified on the Public profile case, then enforce
9. Post-hardening scan; exceptions documented with reason and compensating control
```

---

## FAQ

**Does CIS Level 1 apply to domain controllers?**
Yes, through the Domain Controller profile in the same benchmark. Several values differ from the Member Server profile, so keep DCs in their own OU with their own GPO.

**Will CIS Level 1 break Active Directory?**
Not by itself on supported Windows Server versions, but LDAP signing and NTLM restrictions can break old clients, appliances and applications that bind to AD. Audit before enforcing.

**Is the Microsoft security baseline the same as CIS?**
No, but they overlap heavily. Some organizations apply the Microsoft baseline and document the differences. If an auditor asks for CIS specifically, scan against CIS.

**Can I use this on Azure or AWS VMs?**
Yes. Domain-joined VMs get the GPOs like any other server, and standalone VMs can use LGPO. CIS also publishes pre-hardened images in the major cloud marketplaces.

---

*Related: [Linux security hardening guide](/blog/linux-security-hardening-guide) for the same rollout approach on Linux. [Log analysis for incident triage](/blog/log-analysis-incident-triage) for putting the audit trail to use.*
