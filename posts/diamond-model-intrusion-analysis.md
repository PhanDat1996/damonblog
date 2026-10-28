---
title: "Diamond Model of Intrusion Analysis: How Analysts Pivot"
date: "2026-04-23"
updated: "2026-10-28"
excerpt: "The Diamond Model applied to real triage: map an alert to adversary, capability, infrastructure and victim, then pivot through your logs to find the rest."
tags: ["cybersecurity", "threatintel", "blueteam", "incidentresponse", "diamondmodel"]
featured: false
category: "security"
---

You have one indicator: an IP address from a WAF alert, a file hash from EDR, or a domain from a phishing report. The usual next step is to block it and close the ticket. The Diamond Model asks a better question: **what else does this one fact connect to?** The same IP may have hit three other servers. The same exploit may have come from forty other IPs. One of them may have succeeded.

This guide covers the model itself briefly and accurately, then spends most of its time on what makes it useful in a SOC: pivoting from one vertex to the others through your own logs.

---

## Origin and core idea

The Diamond Model of Intrusion Analysis was published in 2013 by **Sergio Caltagirone, Andrew Pendergast and Christopher Betz**. Its founding axiom, paraphrased: every intrusion event has an **adversary** using a **capability** over **infrastructure** against a **victim**, working toward a goal and producing a result.

Those four core features form the diamond:

```
                 Adversary
                /    :    \
               /     :     \
     Capability ·····:····· Infrastructure
               \     :     /
                \    :    /
                  Victim

  Vertical axis (Adversary–Victim):           social-political (why this victim?)
  Horizontal axis (Capability–Infrastructure): technology (how they connect)
```

The edges between features are the point. If you know one feature, the edges tell you where to look for the others. The paper calls this **analytic pivoting**.

---

## The four core features, and where you find them

| Feature | Meaning | Where it shows up in your data |
|---|---|---|
| **Victim** | The target: an organization or person (*persona*) and the specific systems, accounts or addresses (*assets*) | Usually known first: the host, user or mailbox in the alert |
| **Capability** | The tools and techniques used: exploit, malware, phishing kit, stolen credentials | Request payloads, file hashes, process trees, user agents, TTPs |
| **Infrastructure** | What delivers the capability or controls it: IPs, domains, email accounts, C2 servers | Source IPs, sender addresses, contacted domains, URLs |
| **Adversary** | Who is behind it. The *operator* at the keyboard and the *customer* who benefits | Rarely known at triage time, and that's normal |

Sub-concepts from the paper that matter in practice:

- **Adversary operator vs customer.** In ransomware-as-a-service, the affiliate who breaks in (operator) and the group that runs the platform and takes a cut (customer) are different parties with different motives.
- **Capability capacity vs adversary arsenal.** *Capacity* is the set of vulnerabilities a capability can exploit (an exploit for one CVE only works on unpatched versions). The *arsenal* is everything an adversary has available.
- **Type 1 vs Type 2 infrastructure.** Type 1 is owned or controlled by the adversary (their registered domains, rented servers). Type 2 is controlled by an intermediary, often unknowingly: compromised websites, free email accounts, hijacked servers used as relays. Most IPs you see are Type 2. Blocking them helps briefly. Following them back is where intelligence comes from.
- **Service providers** (registrars, hosting companies, email platforms) aren't adversaries, but they're where abuse reports and takedowns happen.

---

## Meta-features

The paper adds meta-features to each event. They're what makes events comparable across an investigation:

| Meta-feature | Example values |
|---|---|
| Timestamp | Start and end time of the event |
| Phase | The stage of the intrusion (the paper uses the kill chain as an example of a phase model) |
| Result | Success / failure / unknown, plus which of confidentiality, integrity or availability was affected |
| Direction | Infrastructure-to-Victim, Victim-to-Infrastructure, Infrastructure-to-Infrastructure, Adversary-to-Infrastructure, Infrastructure-to-Adversary, bidirectional, unknown |
| Methodology | The class of activity: spearphishing, port scan, web exploitation |
| Resources | What the event required: software, knowledge, information, hardware, funds, facilities, access |

**Phase** is the link to the [Cyber Kill Chain](/blog/cyber-kill-chain). Tag every diamond with its phase and you can line events up into a timeline.

---

## Analytic pivoting: the practical core

Pivoting means taking a known feature and using it to discover others. In a SOC, each pivot is a query against a log source:

| From (known) | To (unknown) | Typical query |
|---|---|---|
| Infrastructure (IP/domain) | Other victims | Which of our hosts and users talked to this IP/domain? (proxy, DNS, firewall, web logs) |
| Infrastructure | Capability | What else did this IP send us? Which payloads, URLs, user agents? |
| Capability (payload, hash, UA) | Other infrastructure | Which other source IPs used the same exploit string, hash or user agent? |
| Capability | Other victims | Which hosts have this file hash or saw this request pattern? (EDR, web logs across servers) |
| Victim | Other infrastructure | What else did this compromised host or account connect to around the same time? |
| Infrastructure | More infrastructure | Passive DNS, WHOIS and TLS certificate overlaps (external threat intel) |

Every pivot carries a confidence level. A shared IP on a cloud provider or a common open-source tool is a weak link. A shared, unusual TLS certificate or a custom implant hash is a strong one. Write the confidence down.

---

## Worked example: an exploit attempt on NGINX (hypothetical)

A hypothetical alert: the WAF flags a request to a well-known PHPUnit remote code execution path (CVE-2017-9841) on one of your NGINX servers.

**Start the diamond with what the alert gives you:**

```
Victim:          web-03, vhost shop.example.com          (asset)
Capability:      POST /vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php
Infrastructure:  203.0.113.9                              (likely Type 2)
Adversary:       unknown
Phase:           Delivery/Exploitation    Result: unknown    Direction: Infra → Victim
```

**Pivot 1: Result. Did it work?**

```bash
LOG=/var/log/nginx/access.log
grep 'eval-stdin.php' $LOG | awk '{print $1, $9}' | sort | uniq -c
#      4 203.0.113.9 404
#      1 198.51.100.40 200
```

The 404s are failures. A `200` doesn't prove code execution, but it means the vulnerable file exists and was reached. That second line just became the priority.

**Pivot 2: Capability → infrastructure. Who else is using this exploit?**

```bash
grep 'eval-stdin.php' $LOG | awk '{print $1}' | sort -u
```

Two IPs so far. Run the same query on every web server (or in your SIEM) to see the full set.

**Pivot 3: Infrastructure → capability. What else did these IPs try?**

```bash
awk '$1=="198.51.100.40" {print $6, $7, $9}' $LOG | sort | uniq -c | sort -rn | head
```

A long list of unrelated exploit paths means a broad automated scanner. A short, targeted sequence (exploit, then requests to a newly created file) means a follow-up stage, so check the web root for new files.

**Pivot 4: Capability → more infrastructure, via the user agent**

```bash
# Combined log format: with " as the separator, field 6 is the User-Agent
grep 'eval-stdin.php' $LOG | awk -F'"' '{print $6}' | sort | uniq -c
awk -F'"' '$6 == "<the unusual UA>"' $LOG | awk '{print $1}' | sort -u
```

Default tool user agents (`python-requests`, `Go-http-client`) are weak links. An unusual, specific string is a stronger one.

**Pivot 5: Victim → infrastructure. Did web-03 talk to anything new afterward?**

```bash
ss -tnp state established | grep -E 'php-fpm|nginx'
# plus egress firewall/proxy logs for web-03 since the 200 response
```

An outbound connection from `php-fpm` after a successful exploit request is C2-phase activity, and the incident just got serious.

**What the filled-in diamond tells you:** the socio-political axis here is probably *opportunistic*. The capability targets a vulnerable library, not your company, and the infrastructure hits everyone. That changes the response: fix the exposure (why is `vendor/` reachable from the web?), check every server for the same file, and don't spend hours on attribution. [NGINX config analyzer](/tools/nginx-config-analyzer) and [NGINX CIS hardening checker](/tools/nginx-cis-hardening-checker) help with the "why was it reachable" part.

---

## Second example: AiTM phishing (hypothetical)

A user reports a DocuSign-themed email. They entered credentials and approved MFA.

```
Victim:          j.doe@example.com, finance team               (persona + asset)
Capability:      Reverse-proxy phishing kit (e.g. Evilginx-style) capturing
                 the session cookie after MFA
Infrastructure:  sign-docs-portal[.]example-lookalike  (Type 1, newly registered)
                 sending mailbox at a compromised partner domain (Type 2)
Adversary:       unknown, financially motivated (assessment, low confidence)
Phase:           Delivery → Exploitation    Result: success (credential + session)
```

Pivots that matter: **infrastructure → victims** (who else received mail from that sender or visited that domain? check mail and proxy logs), **victim → infrastructure** (sign-ins for j.doe from new IPs or devices after the click), and **capability → mitigation** (session-cookie theft defeats push and TOTP MFA; phishing-resistant MFA such as FIDO2 doesn't fall to it).

ATT&CK mapping for the capability: T1566.002 (Spearphishing Link), T1557 (Adversary-in-the-Middle), T1539 (Steal Web Session Cookie), and T1550.004 (Web Session Cookie) for the reuse.

---

## Activity threads and activity groups

Single diamonds become useful when you connect them:

- **Activity thread:** diamonds for one adversary–victim pair, ordered by phase. Scan, exploit, web shell, C2, exfiltration. Gaps in the thread are your open questions ("we have C2 but no installation event, so how did it persist?").
- **Activity group:** diamonds clustered by shared features (same capability, overlapping infrastructure, same targeting) into something you can track over time. An activity group is an analytic grouping, not proof of who the adversary is. Keep the two separate.

The kill chain gives the thread its order. The diamond gives each step its content.

---

## Diamond Model vs Kill Chain vs ATT&CK

| | Diamond Model | Cyber Kill Chain | MITRE ATT&CK |
|---|---|---|---|
| Authors / year | Caltagirone, Pendergast, Betz, 2013 | Hutchins, Cloppert, Amin (Lockheed Martin), 2011 | MITRE, started 2013, public 2015 |
| Unit of analysis | One event and its relationships | Intrusion lifecycle | Individual technique |
| Answers | What connects to what? Where do I pivot? | Where in the intrusion are we? | Exactly what behavior was this? |
| Best for | Scoping, campaign tracking, intel production | Triage direction, coverage by phase | Detection engineering, hunting |

In practice: tag each diamond with a kill chain phase and ATT&CK technique IDs, and use the pivots to fill in the rest.

---

## Common mistakes

**Treating "Adversary: unknown" as failure.** At triage, it almost always is unknown. The model is useful precisely because you can still pivot on the other three features.

**Blocking Type 2 infrastructure and stopping.** A compromised relay gets blocked, the adversary switches relays. The capability and victim pivots find the activity you'd otherwise miss.

**Pivoting on weak links.** Shared cloud IPs, common user agents and public tools link unrelated activity. Record confidence for each link.

**Over-reading time zones.** Activity clustering in certain hours is a hint, not attribution. Automation, shift work and deliberate deception all distort it.

**Skipping the result.** "Attempted" and "succeeded" lead to very different responses. Establish the result early, as in Pivot 1 above.

---

## FAQ

**What are the four components of the Diamond Model?**
Adversary, Capability, Infrastructure and Victim. Each intrusion event is described by how these four relate, with meta-features such as timestamp, phase, result and direction added for context.

**Who created the Diamond Model of Intrusion Analysis?**
Sergio Caltagirone, Andrew Pendergast and Christopher Betz, in their 2013 paper "The Diamond Model of Intrusion Analysis."

**What is the difference between Type 1 and Type 2 infrastructure?**
Type 1 is owned or controlled by the adversary. Type 2 is controlled by an intermediary, often a compromised or free third-party service, which hides the adversary's own infrastructure.

**How does the Diamond Model relate to the Cyber Kill Chain?**
They're complementary. The kill chain provides the phase for each event, and the Diamond Model describes the event itself and how to pivot from it. Ordered by phase, diamonds form an activity thread. See the [Cyber Kill Chain guide](/blog/cyber-kill-chain).

**Is the Diamond Model only for threat intelligence teams?**
No. Its most everyday use is scoping an alert: deciding which logs to query next and whether an event is isolated or part of something wider.

---

*Related: [Log analysis for incident triage](/blog/log-analysis-incident-triage) for the log work behind each pivot. [Security log analysis on Windows and web servers](/blog/log-analysis-security-windows-webserver) for the Windows side of the same pivots.*
