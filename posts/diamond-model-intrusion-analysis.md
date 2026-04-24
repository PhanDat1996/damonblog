---
title: "Diamond Model of Intrusion Analysis: 4 Core Components Explained (2026)"
date: "2026-04-23"
excerpt: "A technical breakdown of the Diamond Model of Intrusion Analysis — adversary, victim, capability, and infrastructure — with real attack examples, meta-features, and how it compares to the Cyber Kill Chain and MITRE ATT&CK."
tags: ["cybersecurity", "threatintel", "blueteam", "incidentresponse", "diamondmodel"]
featured: false
category: "security"
---

---

Most threat intelligence reports tell you *what* happened. The Diamond Model tells you *why the pieces connect*.

A phishing email lands in an inbox. Your SIEM fires an alert. You have an IOC — a malicious domain, a sender address, a hash. But who sent it? What capability were they using? Which part of your infrastructure did they target, and what were they actually trying to accomplish?

IOCs alone don't answer those questions. The **Diamond Model of Intrusion Analysis** does.

Developed in 2013 by Sergio Caltagirone, Andrew Pendergast, and Christopher Betz, the Diamond Model provides a structured framework for decomposing any intrusion event into four core components: **Adversary, Victim, Capability, and Infrastructure**. The model doesn't just describe what happened — it maps the relationships between every element of an attack, enabling analysts to correlate events, attribute campaigns, and forecast adversary behavior.

This post covers all four core components, the six meta-features, a full real-world attack mapping, and how the Diamond Model fits alongside the Cyber Kill Chain and MITRE ATT&CK.

---

## TL;DR — Diamond Model at a Glance

```
Adversary    → Who is behind the attack (operator + customer)
Victim       → Who/what is being targeted (personae + assets)
Capability   → How they attack (tools, techniques, TTPs)
Infrastructure → What they use to deliver and control (C2, domains, email)

Meta-Features → Timestamp, Phase, Result, Direction, Methodology, Resources
Axes          → Social-Political (why) + Technology (how capability meets infra)
```

Every intrusion event can be expressed as a relationship between these four nodes — connected in the shape of a diamond.

---

## What Is the Diamond Model?

The Diamond Model of Intrusion Analysis is a framework for structuring the analysis of cyber intrusion events. Its core premise: **every intrusion activity consists of an adversary deploying a capability over infrastructure against a victim.**

These four elements are always present in any attack. The model makes their relationships explicit and exploitable for analysis.

```
          Adversary
         /         \
        /           \
  Capability ——— Infrastructure
        \           /
         \         /
           Victim
```

The four nodes are edge-connected — each relationship between them is analytically meaningful:

- **Adversary ↔ Capability**: What tools and techniques does this actor use?
- **Adversary ↔ Infrastructure**: What does this actor's operational infrastructure look like?
- **Capability ↔ Infrastructure**: How is the capability delivered or controlled?
- **Infrastructure ↔ Victim**: What was actually hit?
- **Adversary ↔ Victim**: Who is targeting whom, and why?
- **Capability ↔ Victim**: What attack surface was exploited?

When you populate this model for multiple events, patterns emerge — linking campaigns, attributing actors, and predicting next moves.

---

## Core Component 1: Adversary

### Who Is the Adversary?

The adversary is the actor behind the attack — the person, group, or organization responsible for directing a capability against a victim to achieve a specific intent.

In practice, adversary information is often the last thing you'll know with confidence. Most events at the time of discovery have an empty adversary field. You build toward attribution through accumulated evidence across multiple events.

The Diamond Model distinguishes two adversary roles that are frequently conflated:

### Adversary Operator

The **Adversary Operator** is the individual or team directly conducting the intrusion — the person at the keyboard. They execute the TTPs, interact with the infrastructure, and make real-time decisions during the attack.

### Adversary Customer

The **Adversary Customer** is the entity that benefits from the operation — the one who commissioned or funded it. This may be the same person as the operator, or an entirely separate party.

```
Real-world examples:

RaaS model:
  Adversary Customer → LockBit ransomware group (owns the platform, takes the cut)
  Adversary Operator → Affiliate (executes the intrusion, deploys the encryptor)

Nation-state operation:
  Adversary Customer → Government intelligence agency (defines the target and objective)
  Adversary Operator → APT unit (conducts the intrusion)
```

**Why this distinction matters:** A single Adversary Customer may control multiple Operators simultaneously. Each Operator may use different capabilities and infrastructure — but they share intent and objectives. Separating these roles allows analysts to track the customer relationship even when operator TTPs vary across campaigns.

**Analytical value:** Knowing the adversary allows you to predict future behavior, scope potential targets, and pivot from a single event to a broader campaign picture.

---

## Core Component 2: Victim

### Who Is the Victim?

The victim is the target — any organization, person, system, or asset that the adversary directs their capability against. There is always a victim in every intrusion event.

The Diamond Model splits victim analysis into two dimensions:

### Victim Personae

**Victim Personae** describes the human or organizational identity: the company name, the job role, the industry vertical, the individual's profile. This is the *who* from a strategic perspective.

```
Examples:
- "Finance department employees at US defense contractors"
- "C-suite executives in the healthcare sector"
- "Security researchers following specific Twitter accounts"
  (used in the 2021 North Korean campaign targeting security researchers via LinkedIn/Twitter)
```

### Victim Assets

**Victim Assets** are the technical attack surface — the specific systems, accounts, or infrastructure the adversary targets.

```
Examples:
- Email addresses (phishing delivery targets)
- IP addresses and exposed services
- Web applications (public-facing attack surface)
- VPN appliances, edge devices
- Social media accounts
- Physical endpoints
```

**Why this distinction matters:** The Victim Personae helps you understand *why* the target was selected (industry, role, data they hold). The Victim Assets help you understand *how* the adversary accessed them. Together they let you model targeting logic — useful for predicting who else in your sector may be hit next.

---

## Core Component 3: Capability

### What Is Capability?

Capability encompasses the skills, tools, malware, and techniques an adversary uses in an intrusion event. It represents the adversary's operational toolkit — from the most rudimentary (manual password guessing) to the most sophisticated (custom zero-day implants).

The Diamond Model introduces two sub-concepts:

### Capability Capacity

**Capability Capacity** defines the vulnerabilities and exposures that a given capability can exploit. A phishing lure exploits human trust. A memory corruption exploit targets a specific software vulnerability. Understanding capacity tells you what attack surface that capability is effective against.

```
Capability: Spearphishing with malicious Office attachment
Capacity:   Targets users who open Office documents with macros enabled
            Exploits: human trust, insufficient macro policy, lack of sandbox

Capability: CVE-2023-4966 (Citrix Bleed) exploit
Capacity:   Targets Citrix NetScaler appliances running vulnerable firmware
            Exploits: unauthenticated session token leakage
```

### Adversary Arsenal

The **Adversary Arsenal** is the complete set of capabilities available to an adversary. An APT group's arsenal might include custom malware families, commodity tools, living-off-the-land binaries (LOLBins), and social engineering playbooks.

```
Example — APT29 (Cozy Bear) known arsenal:
- SUNBURST (supply chain implant, SolarWinds)
- WellMess / WellMail (custom C2 implants)
- Cobalt Strike (commercial C2, used post-compromise)
- BloodHound / SharpHound (AD reconnaissance)
- Credential dumping via LSASS memory access
```

**Analytical value:** Tracking an adversary's arsenal across events allows you to attribute new intrusions even when infrastructure changes. Malware code overlap, build environment artifacts, and TTP patterns persist across campaigns even when C2 domains rotate.

---

## Core Component 4: Infrastructure

### What Is Infrastructure?

Infrastructure is the physical or logical interconnection the adversary uses to deliver capability or maintain control — the operational backbone of the attack. This includes anything that sits between the adversary and the victim.

```
Infrastructure examples:
- C2 servers (command and control)
- Registered domains (phishing lures, C2 callbacks)
- Email accounts (spearphishing delivery)
- Compromised third-party servers (staging, relay)
- Malicious USB devices
- Bulletproof hosting providers
- Anonymization layers (Tor, VPN chains)
```

The Diamond Model defines two infrastructure types:

### Type 1 Infrastructure

**Type 1** is directly owned or controlled by the adversary. This is the true origin of the attack — attacker-registered domains, self-managed VPS servers, attacker-operated email accounts.

```
Type 1 examples:
- VPS registered via cryptocurrency payment
- Domain registered through a bulletproof registrar
- Attacker-owned email account used for spearphishing
```

### Type 2 Infrastructure

**Type 2** is controlled by an intermediary — often infrastructure that was compromised from a third party and repurposed as a relay or staging server. The victim sees Type 2 infrastructure as the apparent attacker.

```
Type 2 examples:
- Compromised WordPress site hosting a payload
- Hijacked cloud storage bucket used for C2 staging
- Compromised legitimate email account used for BEC
- Botnet node used as a proxy hop
```

Type 2 infrastructure serves a critical adversary purpose: **obfuscation and attribution resistance**. Investigators following the trail hit a compromised third party — not the actual adversary.

### Service Providers

Service Providers are the organizations that enable Type 1 and Type 2 infrastructure: domain registrars, hosting providers, ISPs, webmail platforms. They are not adversaries — but they are choke points for takedown and abuse reporting.

**Analytical value:** Infrastructure is the most trackable component of any intrusion. Domains get registered, IPs get allocated, SSL certificates get issued — all of these leave artifacts. Infrastructure pivoting (finding all assets connected to a known C2 IP or domain) is one of the most productive techniques in threat intelligence analysis.

---

## Event Meta-Features

Meta-features are optional attributes that can be added to any Diamond Model event to provide additional analytical context. They don't change the four core components — they enrich them.

### 1. Timestamp

Date and time of the event — both start and stop when available.

```
Example: 2026-02-14 03:22:17 UTC

Analytical use: Intrusion at 3am US Eastern = likely adversary in a distant timezone.
Pattern across campaign: All events occur Tuesday–Friday 09:00–17:00 UTC+8
→ Suggests a structured working team in East Asia timezone
```

### 2. Phase

The kill chain phase the event belongs to. The Diamond Model directly references the Cyber Kill Chain as the phase taxonomy.

```
Phase mapping:
1. Reconnaissance
2. Weaponization
3. Delivery
4. Exploitation
5. Installation
6. Command & Control
7. Actions on Objectives
```

Tagging events with phases allows analysts to track adversary progression across an intrusion timeline and identify gaps in detection coverage.

### 3. Result

The outcome of the event — from both the adversary's and defender's perspective.

```
Values:
- Success / Failure / Unknown

CIA impact:
- Confidentiality Compromised  (data accessed or exfiltrated)
- Integrity Compromised        (data modified or deleted)
- Availability Compromised     (service disrupted or destroyed)
```

### 4. Direction

The direction of activity relative to infrastructure and victim boundaries.

```
Possible values:
- Adversary-to-Infrastructure    (attacker sets up C2)
- Infrastructure-to-Victim       (payload delivery)
- Victim-to-Infrastructure       (victim beacons out to C2)
- Infrastructure-to-Infrastructure (lateral relay)
- Infrastructure-to-Adversary    (exfiltrated data returned)
- Bidirectional
- Unknown
```

Direction is especially useful for network-based event analysis — mapping which direction traffic flowed and what that implies about the attack phase.

### 5. Methodology

The general classification of the intrusion technique.

```
Examples: phishing, spearphishing, DDoS, watering hole,
          supply chain compromise, brute force, port scan,
          drive-by download, BEC (Business Email Compromise)
```

### 6. Resources

Every intrusion requires external resources to execute. Cataloguing them helps profile adversary sophistication and operational requirements.

```
Resource categories:
- Software     → OS, virtualization, Metasploit, Cobalt Strike
- Knowledge    → how to operate tools, target-specific OSINT
- Information  → valid credentials, insider data, target employee names
- Hardware     → servers, workstations, routers, USB devices
- Funds        → purchasing domains, VPS, exploits, RaaS access
- Facilities   → physical location, electricity, shelter
- Access       → network path to target, valid account access
```

High resource requirements indicate sophisticated, well-funded adversaries. Low resource requirements (commodity phishing kit, free hosting) indicate opportunistic actors or low-capability affiliates.

---

## The Two Axes: Social-Political and Technology

Beyond the four core nodes and meta-features, the Diamond Model defines two additional components as perpendicular axes.

### Social-Political Component

The Social-Political axis describes the **motivations and intent** driving the adversary — the *why* behind the attack.

```
Common adversary motivations:
- Financial gain          → ransomware groups, financial crime actors
- Espionage               → nation-state APTs targeting government/defense
- Hacktivism              → ideologically motivated disruption or exposure
- Competitive advantage   → corporate espionage
- Reputation / notoriety  → gaining status in the underground community
- Destruction             → nation-state destructive attacks (wipers)
```

Understanding motivation shapes how you model future behavior. A financially motivated actor will follow the money — exfiltrate data before encrypting, target organizations with cyber insurance, negotiate ransom. An espionage actor will prioritize stealth and persistence over visible impact.

The social-political component also captures the **adversary-victim relationship**: what does the victim represent to the adversary? Do they hold data the adversary wants? Are they a stepping stone to a higher-value target?

### Technology Component

The Technology axis describes **how capability and infrastructure connect** — the technical relationship between the attack tool and the delivery mechanism.

```
Example: Watering hole attack

Capability:      Browser exploit kit targeting a specific CVE
Infrastructure:  Compromised legitimate website (Type 2)
Technology:      The exploit kit is injected into the website's JavaScript,
                 silently executing when the victim visits the page
```

The Technology component answers the question: *how does this capability actually reach the victim through this infrastructure?* It's the link that completes the operational picture.

---

## Real-World Attack: Diamond Model Applied

**Scenario:** Spearphishing campaign targeting a financial services firm — based on publicly documented BEC and credential harvesting TTPs.

---

**Adversary**
- Operator: FIN7-affiliated threat actor (keyboard operator)
- Customer: Criminal organization monetizing stolen credentials via dark-web resale

**Victim**
- Personae: Accounts payable team, mid-size investment management firm
- Assets: Corporate email accounts, VPN credentials, internal finance portal

**Capability**
- Phishing lure: Fake DocuSign notification with credential harvesting link
- Capability Capacity: Targets users expecting document signature requests (high-plausibility pretext)
- Arsenal: EvilGinx2 (reverse proxy phishing to bypass MFA), custom phishing kit

**Infrastructure**
- Type 1: Attacker-registered domain `docusign-secure-portal[.]com` (registered 3 days before campaign)
- Type 2: Compromised legitimate mail server used as relay to pass SPF/DKIM checks
- Service Provider: Bulletproof hosting provider in Eastern Europe

**Meta-Features**
```
Timestamp:   2026-01-08 09:15:00 UTC (Tuesday morning — target's local business hours)
Phase:       Delivery → Exploitation (credential capture)
Result:      Success — 3 credentials compromised, Confidentiality Compromised
Direction:   Infrastructure-to-Victim (phishing delivery) + Victim-to-Infrastructure (credential submission)
Methodology: Spearphishing, MFA bypass via reverse proxy
Resources:   EvilGinx2, domain registration ($12), compromised relay server, OSINT on target org
```

**Social-Political:** Financial gain — credentials sold on darkweb market or used directly for BEC wire fraud

**Technology:** EvilGinx2 acts as a reverse proxy between the victim and the real DocuSign — capturing the session token after MFA completion, bypassing TOTP-based MFA entirely

---

**What this Diamond Model tells us:**

- The adversary registered infrastructure days before use → monitor new domain registrations with brand-similar names
- Type 2 relay was used to pass email authentication → SPF/DKIM pass alone is insufficient trust signal
- MFA bypass via reverse proxy → hardware tokens or FIDO2 are required; TOTP is not resistant to this technique
- Timestamp targeting business hours → alerts during off-hours for this adversary cluster are low-probability; focus monitoring on working hours

---

## Diamond Model vs Cyber Kill Chain vs MITRE ATT&CK

All three frameworks are complementary. Each answers a different analytical question.

| Dimension | Diamond Model | Cyber Kill Chain | MITRE ATT&CK |
|---|---|---|---|
| Created | 2013, Caltagirone et al. | 2011, Lockheed Martin | 2013, MITRE Corporation |
| Primary question | Who, what, where, why — per event | At which phase was the attacker? | Which specific technique was used? |
| Structure | 4 nodes + axes + meta-features | 7 sequential phases | 14 tactics, 400+ techniques |
| Granularity | Event-level, relational | Campaign-level, sequential | Technique-level, behavioral |
| Attribution support | Strong | Weak | Moderate |
| Threat intel integration | Strong | Moderate | Strong |
| Best used for | Intrusion analysis, campaign correlation, attribution | Defense coverage mapping | Detection engineering, threat hunting |

**How to use all three together:**

1. **Diamond Model** → decompose each event into its four components. Link events into campaigns by shared adversary, infrastructure, or capability indicators.
2. **Cyber Kill Chain** → assign each Diamond event to a kill chain phase. Identify which phases the attacker has completed and where your detection fired (or didn't).
3. **MITRE ATT&CK** → map the capability component to specific technique IDs. Build or tune detection rules against those techniques.

```
Example workflow for a single phishing event:

Diamond Model:
  Adversary: Unknown (FIN7 cluster, medium confidence)
  Victim:    AP team member, corporate email
  Capability: EvilGinx2 reverse proxy phishing kit
  Infra:     docusign-secure-portal[.]com (Type 1)

Kill Chain Phase: Delivery (Phase 3) → Exploitation (Phase 4)

MITRE ATT&CK:
  T1566.002 – Spearphishing Link
  T1557.002 – AiTM Phishing (Adversary-in-the-Middle)
  T1078     – Valid Accounts (post-credential-capture access)
```

→ See also: [Cyber Kill Chain: All 7 Phases Explained with Real Attack Examples]()
→ See also: [MITRE ATT&CK Explained: Tactics, Techniques, and the Navigator]()

---

## When to Use the Diamond Model

The Diamond Model adds the most value in these scenarios:

**Incident response and intrusion analysis** — when you need to structure what you know about an event and identify what's missing. An empty adversary field tells you attribution work is needed. A well-populated infrastructure node gives you pivot points.

**Campaign correlation** — when you have multiple events and need to determine if they're connected. Shared infrastructure (same C2 IP, same domain registrar pattern, same SSL certificate) links events even when malware families differ.

**Threat intelligence production** — when writing structured intelligence reports for sharing (STIX/TAXII, ISACs). The Diamond Model maps directly to STIX 2.1 objects.

**Attribution analysis** — when building a case that multiple intrusions share a common adversary customer, even if operators and tooling vary.

**Briefing non-technical stakeholders** — the four-node structure is intuitive enough to explain a breach to executives without losing analytical precision.

---

## Common Mistakes When Applying the Diamond Model

**Mistake 1: Treating it as a static snapshot**
The Diamond Model is designed to be applied per-event and then linked across events. A single populated diamond is useful; a set of linked diamonds across a campaign is where the real analytical value appears.

**Mistake 2: Conflating Adversary Operator and Adversary Customer**
Especially in RaaS operations, the entity executing the intrusion is not the entity benefiting from it. Attribution to the operator without modeling the customer misses the campaign's true scope and intent.

**Mistake 3: Stopping at Type 2 infrastructure**
Many investigations end when they hit a compromised third-party server. The Diamond Model explicitly models Type 2 infrastructure as distinct from the true adversary infrastructure — following the chain to Type 1 is the goal.

**Mistake 4: Ignoring the meta-features**
Timestamps and direction data seem mundane until you have 50 events to correlate. Consistent time-of-day patterns, systematic direction flows, and repeated methodology classifications are how you distinguish an automated campaign from a hands-on-keyboard operator.

**Mistake 5: Using it in isolation**
The Diamond Model tells you *who and what*. The Kill Chain tells you *where in the sequence*. ATT&CK tells you *exactly how*. All three together give you full analytical coverage.

---

## Conclusion

The Diamond Model doesn't replace log analysis, SIEM rules, or EDR telemetry. It gives you the analytical structure to make sense of what those tools surface.

Every intrusion has an adversary, a victim, a capability, and infrastructure. When you map these explicitly — and link them across events — you stop analyzing individual alerts and start analyzing adversary behavior. That's when threat intelligence becomes operationally useful: not just telling you what happened, but who is doing it, how they operate, and where they'll likely strike next.

Map the diamond. Link the events. Follow the infrastructure.

---

## FAQ — Diamond Model of Intrusion Analysis

### What is the Diamond Model of Intrusion Analysis?

The Diamond Model is a framework for analyzing cyber intrusion events by decomposing them into four core components: Adversary, Victim, Capability, and Infrastructure. Developed in 2013 by Sergio Caltagirone, Andrew Pendergast, and Christopher Betz, it provides a structured way to map the relationships between these elements, enabling analysts to correlate events, attribute campaigns, and forecast adversary behavior.

### Who created the Diamond Model?

The Diamond Model of Intrusion Analysis was created by Sergio Caltagirone, Andrew Pendergast, and Christopher Betz, published in 2013 in the paper *"The Diamond Model of Intrusion Analysis."* Caltagirone was then working at Microsoft; all three had backgrounds in US government intelligence analysis.

### What are the 4 components of the Diamond Model?

The four core components are: **Adversary** (the actor behind the attack, split into Operator and Customer), **Victim** (the target, split into Personae and Assets), **Capability** (the tools and techniques used), and **Infrastructure** (the physical or logical systems used to deliver capability — split into Type 1 and Type 2). These four nodes are edge-connected in the shape of a diamond, with each relationship between nodes carrying analytical meaning.

### How does the Diamond Model differ from the Cyber Kill Chain?

The Cyber Kill Chain models a complete attack as a seven-phase sequential progression — useful for measuring where defenses should sit across an attack lifecycle. The Diamond Model analyzes individual intrusion *events* by mapping relationships between four components, making it better suited for attribution, campaign correlation, and threat intelligence production. They are complementary: Kill Chain places events on a timeline; the Diamond Model structures the actors and tools within each event.

### Is the Diamond Model still relevant in 2026?

Yes. The Diamond Model's core analytical value — structuring the relationships between adversary, victim, capability, and infrastructure — is framework-agnostic and scales to any threat actor type. It maps directly to STIX 2.1 (the standard format for structured threat intelligence sharing), is used by government CERTs and commercial TI teams globally, and integrates naturally with MITRE ATT&CK and the Cyber Kill Chain in modern SOC and threat intelligence workflows.

### What is the difference between Adversary Operator and Adversary Customer?

The **Adversary Operator** is the individual directly conducting the intrusion — the hands-on-keyboard actor. The **Adversary Customer** is the entity that benefits from the operation — the one who commissioned or funded it. In ransomware-as-a-service operations, the affiliate executing the intrusion is the Operator; the ransomware platform (e.g., LockBit, BlackCat) that takes a percentage of the ransom is the Customer. Separating these roles is critical for understanding campaign intent, attribution, and predicting future targeting.

---

*Tags: #cybersecurity #threatintel #blueteam #incidentresponse #diamondmodel #threatanalysis #apt*