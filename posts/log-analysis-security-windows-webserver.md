---
title: "Security Log Analysis: Windows Event IDs and Web Logs"
date: "2026-04-24"
updated: "2026-10-28"
excerpt: "Investigating a suspected break-in: the Windows Event IDs that matter, logon types and failure codes, and the web log patterns behind scans and webshells."
tags: ["security", "linux", "logs", "incident", "troubleshooting", "debugging"]
featured: false
category: "security"
---

A web server is making outbound connections it shouldn't, or a domain account logged in at 03:12 from an IP nobody recognizes. Now you need to answer three questions from logs: **how did they get in, what did they do, and are they still there?**

This post covers the two log sources that answer those questions most often: the Windows Security log and web server access logs. It's about investigating attacker activity. For outage triage, see [incident triage with logs](/blog/log-analysis-incident-triage). For Linux system logs, see the [Linux log analysis guide](/blog/linux-log-analysis-guide).

---

## Before you start: preserve the evidence

Attackers clear logs, and logs rotate. Copy first, analyze the copy.

```powershell
# Windows: export the logs you need (run as Administrator)
wevtutil epl Security C:\IR\Security.evtx
wevtutil epl System   C:\IR\System.evtx
wevtutil epl "Microsoft-Windows-PowerShell/Operational" C:\IR\PowerShell.evtx
```

```bash
# Linux web server: copy logs including rotated ones, and record hashes
mkdir -p /root/ir && cp -a /var/log/nginx /var/log/auth.log* /root/ir/
sha256sum /root/ir/nginx/* > /root/ir/SHA256SUMS
```

Write down the timezone of every source. Windows Event Viewer shows local time, IIS logs are in UTC, and NGINX/Apache use the server's local time with an offset.

---

## Windows: the Event IDs that matter

The **Security** log holds authentication and account events. The **System** log holds service installs and its own clearing event. Some IDs only appear if the matching audit policy is enabled (noted below). Check what's enabled with `auditpol /get /category:*`.

### Logons and authentication

| Event ID | Log | Meaning | Why you care |
|---|---|---|---|
| **4624** | Security | Successful logon | The key field is **Logon Type** (table below) plus the source IP |
| **4625** | Security | Failed logon | Bursts = brute force or password spraying. **Sub Status** tells you why it failed. |
| **4634** / **4647** | Security | Logoff / user-initiated logoff | Gives session duration when paired with 4624 (same Logon ID) |
| **4648** | Security | Logon with explicit credentials | `runas`, or a tool using someone else's credentials. Common in lateral movement. |
| **4672** | Security | Special privileges assigned to new logon | Logged right after a 4624 when the account is an admin. Admin logon from an unusual source = priority. |
| **4740** | Security | Account locked out | Logged on the domain controller; shows the caller computer |
| **4768** / **4769** | Security (DC) | Kerberos TGT / service ticket requested | Unusual volumes of 4769 for many services from one account can indicate Kerberoasting |
| **4771** | Security (DC) | Kerberos pre-authentication failed | The domain-side view of failed passwords |
| **4776** | Security | NTLM credential validation | Failures here with Kerberos available deserve a look |

### Logon Type (in 4624 and 4625)

| Type | Name | Typical source |
|---|---|---|
| 2 | Interactive | Keyboard at the console |
| 3 | Network | SMB share, `net use`, PsExec-style tools, many remote management tools |
| 4 | Batch | Scheduled task |
| 5 | Service | A service starting under an account |
| 7 | Unlock | Workstation unlocked |
| 8 | NetworkCleartext | Credentials sent in clear text (e.g., IIS Basic auth) |
| 9 | NewCredentials | `runas /netonly` |
| 10 | RemoteInteractive | RDP |
| 11 | CachedInteractive | Logon with cached domain credentials (laptop off the network) |

With Network Level Authentication enabled, failed RDP attempts often show up as **type 3** failures, not type 10, because authentication happens before the RDP session is created. Don't filter brute-force searches on type 10 only.

### Why did the logon fail? (4625 Sub Status)

| Sub Status | Meaning |
|---|---|
| `0xC0000064` | Username does not exist |
| `0xC000006A` | Username exists, wrong password |
| `0xC0000234` | Account locked out |
| `0xC0000072` | Account disabled |
| `0xC0000071` | Password expired |
| `0xC0000193` | Account expired |
| `0xC000006F` | Outside allowed logon hours |
| `0xC0000070` | Not allowed from this workstation |
| `0xC000015B` | User not granted this logon type (e.g., not allowed RDP) |

This distinction is valuable. Many `0xC0000064` across many usernames is someone guessing usernames. A run of `0xC000006A` against one real account is a targeted password attack, and a 4624 for that same account afterwards is the event you're dreading.

### Persistence, privilege and cover-up

| Event ID | Log | Meaning |
|---|---|---|
| **4720** | Security | User account created |
| **4722** | Security | User account enabled |
| **4724** | Security | Attempt to reset an account's password (by someone else) |
| **4726** | Security | User account deleted |
| **4728** | Security | Member added to a security-enabled **global** group (e.g., Domain Admins) |
| **4732** | Security | Member added to a security-enabled **local** group (e.g., local Administrators) |
| **4756** | Security | Member added to a security-enabled **universal** group |
| **4688** | Security | New process created. Needs "Audit Process Creation"; the command line is only logged if the "Include command line in process creation events" policy is on. |
| **4697** | Security | Service installed (needs "Audit Security System Extension") |
| **7045** | System | New service installed. Logged by the Service Control Manager, so it's there even without extra auditing. |
| **4698** | Security | Scheduled task created (needs "Audit Other Object Access Events") |
| **4104** | PowerShell/Operational | Script block logged (needs Script Block Logging). Shows deobfuscated PowerShell. |
| **1102** | Security | **The audit log was cleared** |
| **104** | System | The System log (or another log) was cleared |

A 1102 that nobody can explain is a finding on its own. Attackers clear the log to hide earlier events. The events before the clear may still exist in your SIEM or in exported copies.

The classic persistence chain looks like this, often within a minute:

```
4624 (type 10, unknown IP) → 4672 → 4720 (new user "svc_backup") → 4732 (added to Administrators) → 7045 (new service)
```

### Querying from PowerShell

Event Viewer's **Filter Current Log** is fine for one ID. For anything bigger, use `Get-WinEvent`, which can read live logs or the `.evtx` you exported.

```powershell
# Failed logons in the last 24h, grouped by source IP and failure reason
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddHours(-24)} |
  ForEach-Object {
    $d = @{}
    ([xml]$_.ToXml()).Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
    [pscustomobject]@{ IP=$d.IpAddress; User=$d.TargetUserName; Type=$d.LogonType; SubStatus=$d.SubStatus }
  } | Group-Object IP, SubStatus | Sort-Object Count -Descending | Select-Object -First 15 Count, Name
```

```powershell
# Successful logons from an IP you're investigating
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 5000 |
  Where-Object { $_.Message -match '203\.0\.113\.45' } |
  Select-Object TimeCreated, @{n='Msg';e={($_.Message -split "`n")[0..20] -join ' '}}

# Was the log cleared? New services?
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=1102} -ErrorAction SilentlyContinue
Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045} -MaxEvents 20 | Format-List TimeCreated, Message

# Same queries against an exported file
Get-WinEvent -FilterHashtable @{Path='C:\IR\Security.evtx'; Id=4624,4625}
```

`wevtutil` works too, and is handy over remote shells:

```powershell
wevtutil qe Security /q:"*[System[(EventID=4720 or EventID=4732)]]" /c:20 /rd:true /f:text
```

> Retention catches people out. The Security log's default maximum size is small, and on a busy domain controller it may cover only hours. If the logs don't reach back to the suspected entry time, check your SIEM or log forwarder before concluding "no evidence".

---

## Web server access logs

### Read the line correctly

Apache and NGINX both default to the `combined` format:

```
203.0.113.45 - - [28/Oct/2026:03:11:52 +0000] "GET /index.php?id=1%27%20UNION%20SELECT%201,2,3-- HTTP/1.1" 200 5123 "-" "sqlmap/1.8.4#stable (https://sqlmap.org)"
```

| Field | Example | Notes |
|---|---|---|
| Client IP | `203.0.113.45` | Behind a load balancer or CDN this is the **proxy's** IP unless you log `X-Forwarded-For` |
| Identity / user | `- -` | User is filled only for HTTP auth |
| Time | `[28/Oct/2026:03:11:52 +0000]` | Request start, server local time with offset |
| Request | `"GET /index.php?id=... HTTP/1.1"` | Method, path **and query string**, protocol |
| Status | `200` | `200` on an attack request means the server processed it, not that the attack failed |
| Bytes | `5123` | Response size. A big jump on the same URL can mean data came back. |
| Referer, User-Agent | `"-"`, `"sqlmap/..."` | Client-supplied, trivially faked |

Locations: `/var/log/nginx/access.log`, `/var/log/apache2/access.log` (Debian/Ubuntu), `/var/log/httpd/access_log` (RHEL). IIS writes W3C logs to `C:\inetpub\logs\LogFiles\W3SVC<id>\` in **UTC**, with fields named in the `#Fields:` header line.

What the access log does **not** contain: POST bodies, most headers, cookies. A login brute force or an exploit sent in a POST body shows only as a POST line with a status. Absence of a payload in the log isn't absence of an attack.

### Patterns and what they indicate

| Pattern in the request | Indicates |
|---|---|
| Hundreds of `404`s from one IP across many different paths | Content discovery / vulnerability scanning |
| `/.env`, `/.git/config`, `/wp-config.php.bak`, `/phpinfo.php` | Hunting for leaked secrets and source |
| `../`, `%2e%2e%2f`, `/etc/passwd`, `win.ini` | Path traversal / local file inclusion |
| `UNION SELECT`, `%27` (`'`), `OR 1=1`, `sleep(`, `benchmark(` | SQL injection probing |
| `${jndi:` anywhere, including the User-Agent | Log4Shell (CVE-2021-44228) attempts |
| Many `POST /login` (or `/wp-login.php`, `/xmlrpc.php`) from one IP | Credential brute force |
| `POST` to a `.php`/`.jsp`/`.aspx` in an **upload** directory, returning `200` | Possible webshell in use |
| User-Agent `sqlmap`, `Nikto` | Default UA of scanning tools (careful attackers change it) |

### Commands that answer the questions

```bash
LOG=/var/log/nginx/access.log

# Who is scanning: IPs by number of DISTINCT paths that returned 404
awk '$9==404 {print $1, $7}' $LOG | sort -u | awk '{print $1}' | uniq -c | sort -rn | head

# Attack strings, matching both raw and URL-encoded forms
grep -iE "union(\+|%20| )+select|%27|\.\./|%2e%2e|/etc/passwd|\\\$\{jndi:|/\.env|/\.git/" $LOG | awk '{print $1}' | sort | uniq -c | sort -rn | head

# Did any of those requests succeed? (status 200 with attack strings)
grep -iE "union(\+|%20| )+select|\.\./|%2e%2e|\\\$\{jndi:" $LOG | awk '$9 == 200' | head

# Everything one suspicious IP did, with status and size, across current and rotated logs
# (the text sort on the timestamp is only chronological within one month)
zgrep -h "^203\.0\.113\.45 " $LOG* | sort -t'[' -k2 | awk '{print $4, $6, $7, $9, $10}'

# POSTs to unusual scripts: rare URLs are more interesting than common ones
awk '$6 == "\"POST" {print $7}' $LOG | sed 's/?.*//' | sort | uniq -c | sort -n | head -20
```

The last command is the webshell hunt. A legitimate app POSTs to a handful of endpoints thousands of times. A webshell is usually one odd filename hit a few times by one or two IPs. Check it on disk:

```bash
ls -la /var/www/html/uploads/
find /var/www -type f \( -name "*.php" -o -name "*.jsp" \) -mtime -14 -ls     # recently modified scripts
grep -lE "eval\(|base64_decode\(|system\(|shell_exec\(|assert\(" -r /var/www --include=*.php
```

Those grep hits aren't proof (legitimate code uses some of these functions), but a short obfuscated file in an upload directory is.

### From the web log to the host

If a request looks successful, pivot to the server itself at the same timestamps:

```bash
journalctl --since "2026-10-28 03:10" --until "2026-10-28 03:40" --no-pager | grep -E "www-data|nginx|apache|sudo|sshd"
grep -E "Accepted|sudo:" /var/log/auth.log            # new logins or sudo after the attack
ps -eo user,pid,ppid,lstart,cmd | grep -E "^www-data|^nginx|^apache"   # shells or downloaders running as the web user
```

A shell, `curl`, `wget` or `python` process owned by the web server user, with the web server as its parent, is a strong sign of code execution. On Linux, [last and lastb](/blog/linux-check-last-login-users) show logins that followed.

---

## Investigation order

1. **Preserve**: export or copy the logs, note timezones.
2. **Entry**: web logs for exploit attempts that returned 200; 4625 bursts followed by 4624 from the same source.
3. **Execution**: 4688 / 4104 on Windows; processes owned by the web user on Linux.
4. **Persistence**: 4720, 4732/4728, 7045/4697, 4698, new files in the web root.
5. **Cover-up**: 1102, 104, gaps in log timestamps, truncated web logs.
6. **Scope**: every other host the same account or IP touched (4624 type 3 and 10 across servers).

---

## Mistakes that cost investigations

- **Trusting the client IP behind a proxy.** Every request seems to come from the load balancer. Log `X-Forwarded-For` (and only trust it from your own proxy).
- **Ignoring 200s.** Defenders filter on errors. A successful attack returns 200.
- **Filtering 4625 by logon type 10 only.** NLA failures appear as type 3.
- **Single-event conclusions.** One 4625 is noise. Two hundred in five minutes followed by a 4624 is an incident.
- **Analyzing only the current log file.** Entry often happened days before detection; it's in `access.log.5.gz`. `zgrep` reads compressed files directly.

---

## FAQ

**What is the Event ID for a cleared Security log?**
1102 in the Security log ("The audit log was cleared"). Clearing the System log produces Event ID 104 in the System log.

**Which Event ID shows RDP logons?**
4624 with Logon Type 10 for successful RDP sessions. Failed RDP attempts appear as 4625, frequently with Logon Type 3 when Network Level Authentication is on.

**Why don't I see Event 4688 or the command line?**
Process creation auditing is off by default. Enable "Audit Process Creation", and separately the "Include command line in process creation events" policy, to get the full command line.

**Does the access log show POST data?**
No. Neither NGINX nor Apache log request bodies by default. You see the method, path, query string, status and size, not what was submitted.

---

*Related: [grep for log searching](/blog/search-text-in-files-linux-grep), [CIS Windows Server Level 1 hardening](/blog/cis-windows-server-level1-hardening) for enabling the audit policies above, and the [Cyber Kill Chain](/blog/cyber-kill-chain) for mapping what you find to attack stages.*
