---
title: "Triaging an OpenSCAP CIS Report With an LLM"
seoTitle: "Using an LLM to Triage OpenSCAP CIS Findings (Tested)"
date: "2026-11-12"
updated: "2026-11-12"
excerpt: "I ran a CIS Level 1 scan on Ubuntu 24.04 — 115 failures — and had an LLM triage the report. Where it helped, and where trusting it breaks production."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: false
category: "security"
lab: true
---

An OpenSCAP scan tells you what fails. It does not tell you what to do on Monday morning. I scanned a fresh Ubuntu 24.04 server against CIS Level 1 and got **115 failed rules**. The report rates each one high, medium or low, but that rating is CIS's generic opinion, not your context — and a flat list of 115 items is a wall, not a plan.

So I tried the obvious 2026 move: paste the failures into an LLM and ask it to triage them. This is the honest write-up of that experiment — the real scan, what the LLM got right, and where following it blindly would have taken the server down. If you haven't run a scan yet, start with the [OpenSCAP scanning guide](/blog/openscap-cis-scanning-guide); this picks up from the report it produces.

> **Lab environment:** a Colima-managed **Ubuntu 24.04.4 LTS** VM, kernel `6.8.0-117-generic` (aarch64), scanned with **OpenSCAP `oscap` 1.3.9** and **SCAP Security Guide 0.1.82**, profile `cis_level1_server` (CIS Ubuntu 24.04 LTS Benchmark v1.0.0). The scan ran as root against the running system — not a container, so systemd, sysctl, mounts and PAM are all in scope. Every number below is from that run.

---

## The raw report

```bash
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_level1_server \
  --results results.xml --report report.html \
  ssg-ubuntu2404-ds.xml
```

408 rules evaluated. The result:

![Terminal output of the oscap CIS Level 1 scan on Ubuntu 24.04: OpenSCAP 1.3.9, compliance score 66.76 out of 100, 225 pass, 115 fail, 68 not applicable, with failures broken down as 4 high, 98 medium, 9 low and 4 unscored](/images/oscap-cis-ubuntu24-scan.jpg)

- **Compliance score: 66.76 / 100**
- **225 pass, 115 fail, 68 not applicable**
- Failures by CIS severity: **4 high, 98 medium, 9 low**, 4 without a severity tag

![The OpenSCAP report's Compliance and Scoring section for the Ubuntu 24.04 scan: a rule-results bar showing 225 passed and 115 failed, a severity bar breaking the failures into 4 high, 98 medium, 9 low and 4 other, and a default score of 66.76 out of 100](/images/oscap-cis-ubuntu24-results.jpg)

Now look at what "severity" buys you. The four **high** failures are:

- `no_empty_passwords_unix` — accounts with empty passwords
- `sshd_disable_empty_passwords` — SSH login with an empty password
- `grub2_password` — set a GRUB bootloader password
- `grub2_uefi_password` — set a UEFI bootloader password

The first two are genuine must-fix, and take one line each. The other two are "high" in the benchmark but, on a cloud VM with no physical console, a **bootloader password protects nothing an attacker can reach** — and it's a classic way to lock yourself out of single-user recovery. Two of the four top-severity items are, in context, lower priority than several "medium" ones. That's the whole problem: severity is context-free, and the other 98 mediums are an undifferentiated pile.

---

## The experiment: hand the failures to an LLM

I pulled the failed rules (id, title, severity) out of the results and pasted them into an LLM — I used Claude — with a prompt roughly like this:

```text
Here are 115 failed rules from a CIS Level 1 OpenSCAP scan of an
Ubuntu 24.04 cloud VM (no physical console; it's an app server
reachable over SSH; nftables is not yet configured). For each, you
have the rule id, title and CIS severity.

1. Group them into themes.
2. Give me a fix order optimised for risk reduced per unit of effort
   and low blast radius first.
3. Flag every item that can lock me out or cut network access if
   applied carelessly.
4. Call out anything whose "failure" might be load-bearing for this
   server role and should be tailored out instead of fixed.

Do NOT write remediation scripts; I'll generate those with oscap.
```

The context in the prompt matters more than the list. "Cloud VM, no console, app server, nftables not configured" is exactly what the scanner can't know and what changes the priorities.

---

## What the LLM produced

It collapsed the 115 findings into about ten themes and ranked them. Reproduced faithfully, with the real rule counts from my scan:

| Theme | Rules | Risk of the fix | Do first? |
|---|---|---|---|
| Empty-password accounts/SSH | 2 | None | **Yes — now** |
| Kernel network sysctls (rp_filter, redirects, source-route, syncookies) | 23 | Very low | **Yes** |
| Unused filesystem/USB kernel modules | 5 | Very low | **Yes** |
| Umask, core dumps, ASLR | ~6 | Low | **Yes** |
| AppArmor utils + enforce | 3 | Low | Yes |
| journald / rsyslog config | 6 | Low | Yes |
| cron/at permissions + enable | 6 | Low | Yes |
| AIDE install + init | 2 | Low (I/O at build) | Soon |
| PAM: faillock, pwquality, pwhistory | 11 | **High — lockout** | Last, with a root shell open |
| SSH daemon hardening | 18 | **High — lockout** | Last, test in a second session |
| nftables default-deny firewall | 7 | **High — cuts network** | Last, with a rollback timer |
| GRUB/UEFI bootloader password | 2 | Medium — recovery lockout | **Skip on this VM** |

Three things it got genuinely right:

1. **It turned severity on its head where context demanded it.** The two "high" bootloader-password rules went to the bottom; the 23 "medium" sysctl rules — one file, no lockout risk, real hardening — went near the top. That's the correct call for a cloud VM, and it's the opposite of what a severity sort gives you.
2. **It flagged every lockout landmine.** PAM faillock, the SSH drop-in, and the nftables default-deny are exactly the three clusters that have taken people's servers down after a CIS run — the same ones the [RHEL](/blog/cis-rhel-level1-hardening) and [Ubuntu](/blog/cis-level1-ubuntu-hardening) hardening guides warn about by hand. It put all three last and told me to keep a second session and a rollback open.
3. **The grouping is the real value.** "Fix these 23 sysctls in one `/etc/sysctl.d` file, re-scan, move on" is a plan. "23 separate medium findings" is not.

---

## Where it was wrong — and where that hurts

This is the part that matters, because the failures are quiet.

**It doesn't know your environment; it guesses.** It told me to skip the GRUB password "because it's a cloud VM." Right here — wrong, and dangerous, on a physical server in a shared rack or a branch-office box, where console access is exactly the threat. The LLM confidently applied my one-line context to a rule where the context is the whole decision. You own that call, not the model.

**It will invent remediation that looks correct.** Ask it to write the SSH fixes and you get a plausible `sshd_config` block with real holes in it. The failure modes are consistent: it misses that `sshd_config.d/*.conf` drop-ins override the main file on Ubuntu 24.04 (so your edits do nothing), and it reaches for `ClientAliveCountMax 0`, which on modern OpenSSH *disables* the idle timeout instead of enforcing it. Looks right, ships a hole. **Never take remediation from the LLM.** `oscap xccdf generate fix --fix-type ansible` generates the fix from the same content that scored the rule — that's your source of truth. Use the LLM to prioritise; use oscap to remediate.

**It can't see what's load-bearing.** `sysctl_net_ipv4_ip_forward` is a failure the model happily lumped into "fix the sysctls." On a NAT box, a VPN gateway or a Kubernetes node, IP forwarding is *supposed* to be on — "fixing" it blackholes traffic. The LLM has no way to know the server's job unless you tell it, and even then it won't catch every case. Failures that might be intentional get **tailored out** (documented exceptions), not fixed — see tailoring in the [OpenSCAP guide](/blog/openscap-cis-scanning-guide).

**Pasting a scan report out is itself a risk.** A CIS results file is a precise map of how to attack the host: every control you *don't* have. Treat it as sensitive. For real infrastructure, scrub hostnames and addresses, or use a self-hosted model — don't paste your weakest points into a third-party chat box tied to production.

---

## A workflow that stays safe

The LLM earns its place as a triage and explanation layer, nothing more:

1. **Scan** with oscap (audit only) → `results.xml` + `report.html`.
2. **Extract** the failed rules (id, title, severity).
3. **Triage with the LLM**, and put your environment in the prompt: server role, console access, what's load-bearing. Ask for themes, a risk-ordered plan, and lockout flags — not scripts.
4. **You adjust the order.** Override it where you know the box (the GRUB call, any load-bearing "failure").
5. **Generate the real fixes** per theme with `oscap xccdf generate fix`, read them, and apply in stages — low-blast-radius first, SSH/PAM/firewall last with a console and a rollback. The distro guides cover exactly what breaks.
6. **Re-scan** and tailor out the documented exceptions so the next report reflects reality.

Used that way, the LLM took a 115-line wall and a 66.76% score and turned it into a sequenced afternoon of work with the three dangerous steps clearly fenced off. It did not — and should not — decide anything or write a single line that touched the system.

---

## FAQ

**Does the LLM need access to my server?**
No, and don't give it any. It only sees the rule ids and titles you paste. Keep secrets, hostnames and addresses out of the prompt.

**Can it replace a compliance engineer?**
No. It prioritises and explains a report you already have. It has no view of your architecture, your change process, or what's load-bearing, and it will state wrong things with full confidence.

**What's the source of truth for the actual fixes?**
`oscap xccdf generate fix` (bash or Ansible), generated from the same SCAP content that scored the rules. The LLM's hand-written remediation is for reading comprehension, not for running.

**Is it safe to paste a scan report into a public LLM?**
Treat the report as sensitive — it's a list of your unpatched weaknesses. Scrub identifiers, or use a self-hosted model, for anything tied to production.

---

*Related: [OpenSCAP scanning guide](/blog/openscap-cis-scanning-guide) for running the scan, tailoring and generating fixes. [CIS RHEL Level 1 hardening](/blog/cis-rhel-level1-hardening) and [CIS Level 1 Ubuntu hardening](/blog/cis-level1-ubuntu-hardening) for what each control breaks and how to stage it. [Linux security hardening guide](/blog/linux-security-hardening-guide) for the cross-distro rollout order.*
