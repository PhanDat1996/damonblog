---
title: "OpenSCAP: Scan Linux for CIS Level 1 Compliance"
seoTitle: "OpenSCAP Tutorial: Scan for CIS Level 1 (RHEL & Ubuntu)"
date: "2026-11-12"
updated: "2026-11-12"
excerpt: "Use OpenSCAP to audit RHEL and Ubuntu against CIS Level 1: find the right profile, read the HTML report, tailor out rules that don't fit, and remediate safely."
tags: ["security", "linux", "infrastructure", "security-ops"]
featured: false
category: "security"
---

The CIS benchmark for a single distribution runs to hundreds of pages. Checking it by hand, host by host, is how hardening projects stall. OpenSCAP turns the benchmark into a scan: point it at a machine, get back a report that says which controls pass, which fail, and the exact fix for each. The same tool runs on RHEL and Ubuntu, so one workflow covers a mixed fleet.

This guide is about the scanner itself — installing it, finding the right profile, reading the results, tailoring, and turning findings into reviewed changes. For what actually breaks when you apply those changes on each distribution, the per-OS guides are linked at the end.

> **OpenSCAP vs the distro tools.** On Ubuntu, Canonical ships [USG](/blog/cis-level1-ubuntu-hardening), which needs an Ubuntu Pro subscription. OpenSCAP is the free, cross-distro alternative: the same `oscap` command and SCAP Security Guide content scan Ubuntu, RHEL, Debian and SUSE. If you already pay for Pro, USG is smoother on Ubuntu; OpenSCAP is what you reach for everywhere else, and when you want one tool across the fleet.

---

## TL;DR

```bash
# RHEL / Rocky / Alma
dnf install openscap-scanner scap-security-guide

# Ubuntu (no Pro needed)
apt install openscap-scanner ssg-debderived

# Audit only — no changes. Pick the data stream for your OS/version.
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --results results.xml --report report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

Open `report.html` in a browser. It lists every rule with pass/fail, the expected value, and a remediation script. Scanning changes nothing — it only reads the system.

---

## The two pieces: scanner and content

OpenSCAP is two things people conflate:

- **`oscap`** — the scanner (package `openscap-scanner`, older Ubuntu releases `libopenscap8`). It evaluates a system against a policy.
- **SCAP Security Guide (SSG)** — the policy content: the actual CIS, STIG and other profiles, shipped as **SCAP data streams**, one XML file per OS version. The package is `scap-security-guide` on RHEL and `ssg-debderived` on Ubuntu.

The data streams live under `/usr/share/xml/scap/ssg/content/`. Confirm which one matches your host before scanning — the file is version-specific:

```bash
ls /usr/share/xml/scap/ssg/content/
# ssg-rhel9-ds.xml, ssg-ubuntu2204-ds.xml, ssg-ubuntu2404-ds.xml, ...
```

Scanning RHEL 8 with the RHEL 9 stream, or Ubuntu 22.04 with the 24.04 stream, produces results that look fine and mean nothing. Match the stream to the OS.

> **Package names drift.** Across Ubuntu releases the scanner has been `libopenscap8` and then `openscap-scanner`, and SSG content has moved between `ssg-debderived`, `ssg-nondebian` and source builds. If `apt install` can't find a package, run `apt search openscap` and `apt search ssg`, and verify the content path with the `ls` above rather than trusting any one command line.

---

## Find the right profile

Profile IDs change between SSG versions, so don't copy one blindly from an old post. Ask the data stream what it ships:

```bash
oscap info /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

The output lists every profile with its full ID and title. Filter for CIS:

```bash
oscap info /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml | grep -iA1 cis
```

You'll typically see Level 1 and Level 2, for server and workstation:

- `..._profile_cis_server_l1` — CIS Level 1, Server (the usual starting point)
- `..._profile_cis_server_l2` — Level 2, stricter, more likely to break things
- `..._profile_cis_workstation_l1` / `_l2`

On Ubuntu the IDs look like `xccdf_org.ssgproject.content_profile_cis_level1_server`. Use whatever `oscap info` prints for your stream — that's the version of truth, not this list.

---

## Run an audit scan

Start read-only. This never modifies the system:

```bash
oscap xccdf eval \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --results results.xml \
  --report report.html \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

- **`--report report.html`** — the human report. Each rule shows pass/fail/notchecked, the rationale, the expected vs actual value, and a copy-pasteable fix.
- **`--results results.xml`** — machine-readable XCCDF results, for diffing scans or feeding a compliance platform. For a self-contained archive that bundles the content and results, use `--results-arf arf.xml` instead.

> **Exit code 2 is not an error.** `oscap` returns `0` when every rule passes, `2` when one or more rules fail, and `1` only for a real error (bad path, wrong profile). A CI job that treats any non-zero exit as failure will break on the first failed control. Handle `2` deliberately — that's the normal "found issues" signal.

A first scan on a stock image routinely fails a third to half of Level 1. That's expected: a default install isn't a hardened one. Read the report by severity first.

---

## Tailor out what doesn't fit

Some controls are wrong for your environment, not wrong in general: IP forwarding on a container host, a mandated banner your org doesn't use, a cipher policy a legacy client needs. Don't disable them ad hoc — record the exception in a **tailoring file** and use it for both scanning and remediation, so reports reflect your real policy:

```bash
# Interactive, with a GUI
yum install scap-workbench    # or apt install scap-workbench

# Or non-interactively with autotailor (newer OpenSCAP)
autotailor --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --unselect xccdf_org.ssgproject.content_rule_sysctl_net_ipv4_ip_forward \
  --output tailored-ds.xml \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

Then scan with `--profile <your_tailored_id> tailored-ds.xml`, or pass the tailoring file with `--tailoring-file`. Every deselected rule is now a documented decision instead of a silent gap.

---

## Turn findings into reviewed changes

`oscap` can apply fixes directly, but don't lead with that:

```bash
# Dangerous on a live box — applies every rule in the profile at once
oscap xccdf eval --remediate --profile ..._cis_server_l1 ...
```

A blind `--remediate` has locked people out of SSH, broken PAM, and firewalled off their own monitoring in a single run. Every one of those was a legitimate CIS control applied without checking how the server is used.

The reviewable path is to **generate** the remediation, read it, and run it through change control:

```bash
# Ansible (preferred — idempotent, --check/--diff first)
oscap xccdf generate fix --fix-type ansible \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --output cis-l1.yml \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml

# Or a bash script
oscap xccdf generate fix --fix-type bash \
  --profile xccdf_org.ssgproject.content_profile_cis_server_l1 \
  --output cis-l1.sh \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml
```

You can also generate the fix from a results file (`--result-id` against `results.xml`) so it targets only the rules that actually failed, not the whole profile. Run the Ansible playbook with `--check --diff` against a test host first.

**What breaks, and how to stage it, is distribution-specific.** Before you remediate anything:

- RHEL / Rocky / Alma: [CIS RHEL Level 1 hardening](/blog/cis-rhel-level1-hardening) — authselect, crypto policies, SELinux, firewalld, and the auditd full-disk trap.
- Ubuntu / Debian: [CIS Level 1 Ubuntu hardening](/blog/cis-level1-ubuntu-hardening) — USG vs OpenSCAP, SSH drop-ins, and Docker's networking vs sysctl.
- Windows Server: [CIS Windows Server Level 1](/blog/cis-windows-server-level1-hardening) — the GPO-driven equivalent for mixed shops.

The cross-distro rollout order lives in the [Linux security hardening guide](/blog/linux-security-hardening-guide).

---

## Automate and track over time

A compliance score is only useful if it doesn't quietly regress. Make scanning routine:

- **Scheduled scans.** A nightly or weekly `systemd` timer that runs an audit-only scan and drops the ARF/HTML somewhere durable. Compare `results.xml` between runs to catch drift — a package update or a hand edit that re-opens a control.
- **CI gate for images.** Scan your base image in the pipeline and fail the build when the pass rate drops below a threshold, remembering exit code 2. For golden images this catches regressions before they ship to a single host.
- **Fleet scale.** Running `oscap` host by host doesn't scale past a few dozen machines. On RHEL, Red Hat Satellite and Red Hat Insights do OpenSCAP-based scanning and reporting centrally. Cross-platform, the [Ansible Lockdown](https://github.com/ansible-lockdown) project maintains CIS/STIG roles, and SIEM/compliance platforms ingest SCAP results.

Keep one audit scan as your baseline, tailor it once, and measure every host against the same tailored policy. That's the difference between "we ran a hardening script once" and "we can show we're compliant today."

---

## FAQ

**Does OpenSCAP work on Ubuntu, or do I need Ubuntu Pro?**
OpenSCAP works on Ubuntu without Pro: install `openscap-scanner` and the `ssg-debderived` content, then scan with the matching `ssg-ubuntu<version>-ds.xml`. Ubuntu Pro's USG is a separate, smoother tool for Ubuntu specifically; OpenSCAP is the free, cross-distro option.

**What's the difference between SCAP, OpenSCAP and SSG?**
SCAP is the standard (a set of formats). OpenSCAP is the scanner that implements it (`oscap`). SCAP Security Guide (SSG) is the content — the actual CIS and STIG profiles OpenSCAP evaluates against.

**Why does my scan fail half the rules on a fresh install?**
A default OS install isn't hardened. A first Level 1 scan failing 30–50% is normal. Work the report by severity, tailor out what doesn't apply, then remediate in stages.

**Is it safe to run a scan on production?**
Yes — `oscap xccdf eval` without `--remediate` only reads the system. It's `--remediate` (and generated fix scripts) that change things; those need testing and change control.

**How do I compare two scans to see if hardening held?**
Keep the `results.xml` (or ARF) from each run and diff the rule results, or load both into a compliance platform. Scheduling scans and comparing results is how you catch configuration drift.

---

*Related: [CIS RHEL Level 1 hardening](/blog/cis-rhel-level1-hardening) and [CIS Level 1 Ubuntu hardening](/blog/cis-level1-ubuntu-hardening) for what each control breaks and how to stage it. [CIS Windows Server Level 1](/blog/cis-windows-server-level1-hardening) for mixed environments. [Linux security hardening guide](/blog/linux-security-hardening-guide) for the cross-distro rollout order.*
