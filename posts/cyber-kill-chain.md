---
title: "Cyber Kill Chain: 7 Phases Mapped to Detections and Logs"
date: "2026-04-23"
updated: "2026-10-28"
excerpt: "Use the Lockheed Martin Cyber Kill Chain the way analysts do: what each phase looks like in your logs, which detections fit, and how it speeds up triage."
tags: ["cybersecurity", "threatintel", "blueteam", "redteam", "killchain", "incidentresponse"]
featured: false
category: "security"
---

An alert fires: `php-fpm` on a web server opened an outbound connection to an IP you've never seen. Is this the beginning of an intrusion, or the end of one that started a week ago? What else should you look for, and where?

That's the question the Cyber Kill Chain is good at. Most explanations stop at listing the seven phases. This one focuses on how a defender uses them: what each phase looks like in real log sources, which detections belong where, and how placing an alert on the chain tells you which way to search next.

---

## What it is, and where it came from

The Cyber Kill Chain comes from Lockheed Martin's 2011 paper *Intelligence-Driven Computer Network Defense Informed by Analysis of Adversary Campaigns and Intrusion Kill Chains* by Eric M. Hutchins, Michael J. Cloppert and Rohan M. Amin. It borrowed the military idea of a kill chain and applied it to targeted intrusions:

```
1. Reconnaissance → 2. Weaponization → 3. Delivery → 4. Exploitation
   → 5. Installation → 6. Command & Control (C2) → 7. Actions on Objectives
```

The paper's central points, which matter more than the list:

- **The attacker has to complete every phase; the defender only has to break one.** Each phase is a chance to detect or block.
- **Analyze intrusions you stopped, too.** A phishing email blocked at delivery still tells you about the attacker's infrastructure and lures. Those indicators catch the next attempt earlier.
- **Track campaigns, not single alerts.** The same actor reuses infrastructure, tooling and techniques across intrusions. Indicators from later phases of one intrusion become early-phase detections for the next.

---

## The phases as a defender sees them

| Phase | What the attacker does | What you can observe | Typical log sources |
|---|---|---|---|
| 1. Reconnaissance | Researches targets, scans exposed services | Scans, crawling, enumeration (passive recon leaves nothing) | Web server access logs, firewall/IDS logs, VPN/SSO failures |
| 2. Weaponization | Builds the payload, sets up infrastructure | Nothing on your network. Only threat intel about tools and infrastructure | Threat intel feeds, certificate transparency, malware analysis |
| 3. Delivery | Sends the payload: email, web request, USB, update | Inbound emails, malicious requests, downloads | Mail gateway, proxy, web server logs, EDR file events |
| 4. Exploitation | Triggers code execution or abuses valid credentials | Crashes, odd child processes, auth anomalies | EDR/Sysmon process events, auditd, app error logs, auth logs |
| 5. Installation | Establishes persistence | New services, scheduled tasks, cron jobs, web shells, SSH keys | Windows 7045/4698, Sysmon 11/13, auditd file watches, FIM |
| 6. Command & Control | Opens a channel to operate the host | Beaconing, unusual outbound connections, odd DNS | Proxy/firewall egress logs, DNS logs, Zeek, EDR network events |
| 7. Actions on Objectives | Moves laterally, steals data, encrypts, destroys | Large transfers, credential access, backup deletion | EDR, Windows 4624/4688, auth logs, NetFlow, DLP, database logs |

Two things stand out. Phases 1 and 2 are mostly invisible from inside your network. And the most log-rich phases (4 to 7) are also the ones where the attacker already has a foothold. Good programs invest in Delivery detections because that's the first phase that both touches your environment and comes before code execution.

---

## Phase by phase: detections that fit

The examples lean on a Linux/NGINX web stack plus Windows endpoints, a common mix. Adapt the paths to yours.

### 1. Reconnaissance

Passive reconnaissance (search engines, LinkedIn, certificate transparency, internet-wide scan databases such as Shodan) generates nothing you can log. Active reconnaissance does:

```bash
# Top sources of 404s in a combined-format NGINX log: scanners stand out
awk '$9 == 404 {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

On its own, scanning is noise, since every internet-facing server is scanned all the time. Its value is **context**: when an IP that probed you last week shows up in a later-phase alert, you now have a timeline. The practical defense is reducing what there is to find: look at your own external footprint (exposed services, forgotten subdomains, version banners) the way an attacker would.

### 2. Weaponization

Happens entirely on the attacker's side. You can't detect it directly. You can benefit from other people's visibility: threat intel on current malware families, newly registered lookalike domains of your brand, and public reporting on exploits being prepared for software you run. Patch prioritization based on the CISA Known Exploited Vulnerabilities catalog is, in kill chain terms, a weaponization-phase control.

### 3. Delivery

The first phase where the attacker must touch your environment:

- **Email:** attachments and links, judged by the mail gateway, sandbox detonation, and authentication results (SPF/DKIM/DMARC).
- **Web requests** to internet-facing apps: exploit attempts arrive as HTTP requests.
- **Supply chain:** a trusted software update carries the payload. In the SolarWinds compromise disclosed in December 2020, trojanized Orion updates delivered the SUNBURST backdoor through the normal update channel, which is why delivery-phase controls didn't see it.

Example: hunting for well-known exploit payloads in web logs:

```bash
grep -E 'eval-stdin\.php|\$\{jndi:|/\.env|/\.git/config|\.\./\.\./' /var/log/nginx/access.log \
  | awk '{print $1, $7, $9}' | sort | uniq -c | sort -rn | head
```

A `200` response next to an exploit path matters far more than a `404`. Knowing whether your web server version itself has published vulnerabilities is the delivery-and-exploitation question the [NGINX CVE checker](/tools/nginx-cve-checker) answers.

### 4. Exploitation

Code runs, or a stolen credential works. Most detections here are about **process lineage**: a web server, Office application or PDF reader spawning a shell is rarely legitimate.

- Windows: Sysmon Event 1 or Security 4688 with command line, for example `w3wp.exe` or `winword.exe` launching `cmd.exe`/`powershell.exe`.
- Linux: auditd `execve` rules for the web server user. A `www-data` (Debian/Ubuntu) or `nginx`/`apache` (RHEL) process starting `sh`, `curl` or `wget` is a strong signal.

```bash
# /etc/audit/rules.d/60-web-exec.rules  (uid 33 = www-data on Debian/Ubuntu)
-a always,exit -F arch=b64 -S execve -F uid=33 -k web_exec
```

```bash
ausearch -k web_exec --start today -i | grep -E 'exe=.*(sh|curl|wget|python|perl)'
```

Valid-account abuse (stolen VPN session, phished credentials) has no exploit at all. It shows up as authentication anomalies: new geography, impossible travel, a session token reused from a different client.

### 5. Installation

The attacker makes sure a reboot or a password reset doesn't end their access.

| Persistence | Where to look |
|---|---|
| Web shell | New or modified script files in the web root. auditd watch `-w /var/www -p wa -k webroot`, or FIM. Sysmon 11 on IIS servers |
| Cron / systemd | `crontab -l -u www-data`, `/etc/cron.*`, recently changed units in `/etc/systemd/system` |
| SSH keys | Changes to `~/.ssh/authorized_keys` (auditd watch) |
| Windows service | System log **7045**, Security **4697** |
| Scheduled task | Security **4698** |
| Run keys | Sysmon **13** on `...\CurrentVersion\Run` |

```bash
# Script files changed in the web root in the last 2 days
find /var/www -type f \( -name '*.php' -o -name '*.jsp' -o -name '*.aspx' \) -mtime -2 -ls
```

### 6. Command & Control

The compromised host has to talk to the attacker. Useful signals:

- **Servers that shouldn't initiate connections, doing so.** A web worker connecting to the internet (other than known APIs) is unusual:

```bash
ss -tnp state established | grep -E 'php-fpm|nginx|java' | grep -vE '127\.0\.0\.1|10\.|192\.168\.'
```

- **Regular beaconing:** connections to the same destination at near-constant intervals, visible in proxy, firewall or Zeek `conn.log` data. Most C2 frameworks add jitter, so look for clustering, not exact periods.
- **DNS:** long, high-entropy subdomain labels, or a high query volume to one domain. SUNBURST's first stage, for example, encoded data in subdomains of its C2 domain.
- **Egress filtering** makes this phase much harder for the attacker. A server that can only reach its update mirror and its database leaves C2 few options.

For digging into live connections on a host, see [check open connections on Linux](/blog/linux-check-open-connections).

### 7. Actions on Objectives

What the intrusion was for: data theft, ransomware, espionage, sabotage. Lateral movement and credential theft usually happen here too.

- Data staging and exfiltration: large outbound transfers, archive tools run by unusual users, `mysqldump`/`pg_dump` launched by a web user.
- Ransomware precursors on Windows: `vssadmin delete shadows`, `wbadmin delete catalog`, `bcdedit ... recoveryenabled No` in 4688/Sysmon 1. These are high-confidence alerts on almost any server.
- Lateral movement: new admin logons (4624 type 3/10) from a server that never administers others, remote service creation, PsExec-style activity.

Controls that limit damage even when detection fails: offline or immutable backups you've test-restored, tiered admin accounts, and segmentation so one compromised web server can't reach the domain controllers.

---

## Courses of action: more than "detect"

The 2011 paper paired the phases with a **courses of action matrix**: for each phase, what can you *detect*, *deny*, *disrupt*, *degrade*, *deceive* or *destroy*? Filling in even part of it shows where your defenses are thin:

| Phase | Detect | Deny | Disrupt | Degrade | Deceive |
|---|---|---|---|---|---|
| Delivery | Mail gateway, WAF alerts | Block attachments, patch | Inline sandbox | Rate limiting | Decoy mailboxes |
| Exploitation | EDR, auditd `execve` | Patching, app allow-listing | Exploit mitigations (DEP/ASLR) | Least privilege | Honeypot services |
| C2 | DNS/proxy analytics | Egress allow-list | Proxy with TLS inspection | Throttled egress | DNS sinkhole |
| Actions | DLP, unusual transfers | Segmentation, MFA | Kill sessions, isolate host | Quotas | Canary files and tokens |

("Destroy" in the original sense means offensive action against the attacker's capability. It's outside what most organizations can or should do, so it's left out here.)

---

## Using the kill chain during triage

This is where the model earns its place in a SOC.

**1. Place the alert on the chain.** An outbound connection from `php-fpm` is C2 (phase 6). A blocked phishing email is Delivery (3). A `vssadmin delete shadows` is Actions (7).

**2. The phase sets urgency.** A Delivery alert that was blocked is low urgency but worth mining for indicators. A phase 6 or 7 alert means the attacker already has execution on a host. Escalate and start containment planning.

**3. Look left: how did they get here?** For a C2 alert, find installation and exploitation evidence on the same host: new files in the web root, unusual child processes, the HTTP request that started it. The earliest phase you can find is your root cause and your scoping anchor.

**4. Look right: what happens next?** If you've found Installation, check whether C2 and Actions have already happened: outbound connections, credential access, logons to other hosts.

**5. Feed indicators back.** The IP, domain, file hash, user agent or URL pattern from this intrusion becomes a detection at an *earlier* phase next time. This is the campaign-analysis loop the original paper describes, and it pairs naturally with the [Diamond Model](/blog/diamond-model-intrusion-analysis) for pivoting across related events.

---

## Worked example (hypothetical)

A hypothetical intrusion against a PHP application behind NGINX, triaged backwards from the alert:

```
Alert (phase 6):  php-fpm connects to 198.51.100.77:443 every ~60s ±20%

Look left:
  Phase 5  find /var/www -name '*.php' -mtime -3
           → /var/www/html/uploads/thumb.php (created 2 days ago, owner www-data)
  Phase 4  ausearch -k web_exec → php-fpm executed sh -c 'curl ... | sh'
  Phase 3  grep 'uploads/' access.log → POST /upload.php from 203.0.113.9, 200,
           followed by GET /uploads/thumb.php?c=... from the same IP
  Phase 1  same IP: 1,900 404s across the site three days earlier (scanner)

Look right:
  Phase 7  outbound transfer volume from this host? DB dumps? SSH to other hosts?
```

Each "look" step uses a specific log source. That's the practical payoff: the kill chain becomes a checklist of where to search, in which order. For working the logs themselves, see [log analysis for incident triage](/blog/log-analysis-incident-triage) and [security log analysis on Windows and web servers](/blog/log-analysis-security-windows-webserver).

---

## Where the model doesn't fit well

- **Edge-device exploitation compresses phases.** In CISA advisory AA23-325A, LockBit 3.0 affiliates exploited Citrix Bleed (CVE-2023-4966) on internet-facing NetScaler appliances to hijack valid sessions. Delivery and exploitation were a single HTTP request, and there was no malware "installation" in the classic sense.
- **Insiders and stolen credentials skip phases.** An attacker with valid VPN credentials starts at phase 4 or later.
- **Cloud and identity attacks** (OAuth consent phishing, token theft) don't map neatly onto a malware-delivery model.
- **It's linear; real intrusions loop.** After the first foothold, attackers repeat reconnaissance, exploitation and installation internally. Extensions like Paul Pols' Unified Kill Chain (2017) model that internal loop explicitly.

None of this makes the model useless. It makes it a triage and coverage tool, not a complete description of attacker behavior.

---

## Kill Chain vs MITRE ATT&CK

| | Cyber Kill Chain | MITRE ATT&CK |
|---|---|---|
| Origin | Lockheed Martin, 2011 | MITRE, started 2013, public 2015 |
| Structure | 7 sequential phases | 14 Enterprise tactics, hundreds of techniques and sub-techniques |
| Level | Intrusion lifecycle | Specific attacker behavior |
| Best for | Triage direction, coverage per phase, executive framing | Detection engineering, hunting, red/purple team plans |

Use both. The kill chain tells you *where* in an intrusion you are. ATT&CK tells you *exactly which behavior* to detect there. For example, phase 5 maps to techniques such as T1505.003 (Web Shell), T1053.003 (Cron), T1098.004 (SSH Authorized Keys) and T1543.003 (Windows Service).

---

## FAQ

**What are the 7 phases of the Cyber Kill Chain?**
Reconnaissance, Weaponization, Delivery, Exploitation, Installation, Command and Control, and Actions on Objectives, as defined by Hutchins, Cloppert and Amin of Lockheed Martin in 2011.

**Is the Cyber Kill Chain still relevant?**
Yes, as a way to organize detections and direct triage. It's weaker at modeling insider threats, credential-based intrusions and cloud identity attacks, which is why teams pair it with MITRE ATT&CK.

**Which kill chain phase is the most important to detect?**
Delivery and Exploitation give you the best chance to stop an intrusion before the attacker has a foothold. C2 detection is often the most reliable later safety net, because a remote attacker has to communicate.

**How is the Diamond Model different from the Kill Chain?**
The kill chain orders events in time. The Diamond Model describes each event by adversary, capability, infrastructure and victim, so you can pivot between related events. Analysts often tag each Diamond event with its kill chain phase. See the [Diamond Model guide](/blog/diamond-model-intrusion-analysis).

---

*Related: [Linux log analysis guide](/blog/linux-log-analysis-guide) for the Linux log sources referenced above. [NGINX config analyzer](/tools/nginx-config-analyzer) to reduce what your web tier exposes in the first place.*
