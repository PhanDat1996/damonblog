---
title: "Scanning Container Images for CVEs With Trivy in CI"
seoTitle: "Trivy in CI: Scan Container Images for CVEs, Tested"
date: "2026-11-12"
updated: "2026-11-12"
excerpt: "Scan a container image with Trivy, read the CVE report, cut 1,084 findings down to the ones that matter, and gate the CI build — tested on a real nginx image."
tags: ["security", "infrastructure", "security-ops", "devops"]
featured: false
category: "security"
lab: true
---

Your app's Dockerfile probably starts with one line you didn't think hard about: `FROM nginx:1.21.6`, or some other pinned base. That base image is a whole Debian userland — openssl, curl, zlib, dozens of libraries — that you don't write and, if you pinned an old tag, don't patch. It ages. Quietly.

I scanned a real one to see how badly. `nginx:1.21.6` — a perfectly normal image a lot of people are still running — has **1,084 known vulnerabilities**, 31 of them critical. Trivy is the tool that surfaces that before it ships, and gates it in your pipeline. Here's the real run, how to read it, and the honest limits of "0 criticals."

> **Lab environment:** [Trivy](https://trivy.dev/) (the `aquasec/trivy` image) scanning **`nginx:1.21.6`** (Debian 11.3) via Docker on Colima. Result: **1,084 vulnerabilities — 31 CRITICAL, 308 HIGH, 409 MEDIUM, 308 LOW, 28 UNKNOWN**. Every number below is from that scan.

---

## Scan an image

Trivy runs as a container and scans any image it can pull — no install needed:

```bash
docker run --rm aquasec/trivy:latest image nginx:1.21.6
```

![Terminal: trivy image nginx:1.21.6 runs, warns that the OS (debian 11.3) is no longer supported, and prints a Report Summary table showing the target nginx:1.21.6 with 1084 vulnerabilities](/images/trivy-01-scan.jpg)

It pulls the image, works out the OS (Debian 11.3) and package manifest, and matches every installed package version against its vulnerability database. That 1,084 is not a bug in the image — it's the cost of pinning a base tag and never rebuilding.

---

## Read the report

Each finding is a row: the package, the CVE, its severity, a **status**, the installed version and the version that fixes it.

![Terminal: Trivy vulnerability detail for nginx:1.21.6 — Total 1084 broken down by severity, then a table with CRITICAL zlib1g CVE-2022-37434 and curl CVE-2021-22945 (both fixed), and a HIGH openssl CVE-2022-0778, showing installed and fixed-in versions](/images/trivy-02-detail.jpg)

The **status** column is the one people skip, and it's the important one:

- **`fixed`** — a patched package version exists. Rebuild on a newer base and it's gone. These are your to-do list.
- **`affected` / `fix_deferred` / `will_not_fix`** — the distro has no fix (yet, or ever). You can't rebuild your way out; you mitigate or accept, with a reason.
- **`end_of_life`** — the base OS is out of support (as Debian 11 now is), so you stop getting security updates at all. That's the real signal to change base images.

---

## The number that matters isn't 1,084

A report with 1,084 lines gets ignored. The job is to turn it into a decision. Two flags do most of that:

- `--severity CRITICAL,HIGH` drops the low/medium noise.
- `--ignore-unfixed` keeps only vulnerabilities that actually have a fix available — the ones a rebuild resolves.

![Terminal: gating the build — trivy image --exit-code 1 --severity CRITICAL,HIGH nginx:1.21.6 then echo $? returns 1 (the CI job fails); then trivy image --ignore-unfixed --severity CRITICAL,HIGH nginx:1.21.6 returns Total 164 (HIGH 142, CRITICAL 22)](/images/trivy-03-gate.jpg)

On this image that takes **1,084 → 164** actionable findings (22 critical, 142 high) — the ones you can fix today by updating packages. That's a backlog a team can act on, instead of a wall it routes around.

---

## Gate it in CI

The point of scanning is to stop a bad image from shipping. `--exit-code 1` makes Trivy fail the pipeline when it finds something at or above your threshold:

```yaml
# GitHub Actions step
- name: Scan image for critical/high CVEs
  run: |
    docker run --rm aquasec/trivy:latest image \
      --exit-code 1 --ignore-unfixed \
      --severity CRITICAL,HIGH \
      myorg/myapp:${{ github.sha }}
```

The scan returned exit code **1** on `nginx:1.21.6`, so that build fails. Pick the threshold you'll actually keep: gating on *every* severity generates so much noise that teams disable the check, which is worse than no gate. Critical/high, fixable, is a policy that survives contact with a deadline.

![Terminal: Trivy result — the full scan reports Total 1084 (UNKNOWN 28, LOW 308, MEDIUM 409, HIGH 308, CRITICAL 31); filtered to the actionable subset it is Total 164 (CRITICAL 22, HIGH 142)](/images/trivy-04-result.jpg)

---

## A scan is not a fix — and "0 criticals" isn't secure

This is where image scanning gets oversold.

- **Trivy finds *known* CVEs in packages, not your bugs.** It matches versions against a database. It says nothing about your application code, your logic flaws, or how the container is run. A green scan is necessary, not sufficient.
- **The real fix is almost always the base image.** You don't patch 164 packages by hand — you rebuild on a current base. Moving `nginx:1.21.6` to a current `nginx` tag, or to a slim/distroless base, drops most of the 1,084 at once because you inherit an OS that's still getting updates. Pinning an old tag "for stability" is how you accumulate this.
- **`--ignore-unfixed` hides risk you still own.** It's right for a build gate (you can't fail a build on something with no fix), but those unfixed CVEs don't disappear. Track them somewhere, because the day a fix lands, they become your problem to ship.
- **Scan more than the OS layer.** Trivy also has `--scanners vuln,secret,config` — it'll flag hardcoded secrets and Dockerfile/IaC misconfigurations in the same pass. The CVE count is only one of the things wrong with a typical image.

Scanning tells you how old your base is and what shipping it would cost. Fixing it is a rebuild and a base-image decision — the scan just makes the decision unavoidable.

---

## FAQ

**Does Trivy patch anything?**
No. It reports known vulnerabilities. You fix them by updating packages or, usually, rebuilding on a newer base image.

**Why does a popular image like nginx have 1,084 CVEs?**
Because `1.21.6` is an old pinned tag on Debian 11, which is end-of-life. Most findings are low/medium OS-package CVEs; the fix is to build on a current, supported base, not to chase them individually.

**Trivy or Grype?**
Both are solid image scanners with similar coverage. Trivy does a bit more out of the box (secrets, IaC/config, SBOM). Pick one and wire it into CI; the gate matters more than the brand.

**Does `--ignore-unfixed` hide real vulnerabilities?**
It hides the ones you can't fix by rebuilding, which is correct for a *build gate*. Don't treat it as making them safe — track unfixed CVEs separately and revisit when a patch ships.

**Can Trivy scan things other than images?**
Yes — filesystems, git repos, running Kubernetes clusters, IaC templates, and secrets. The image scan is just the most common entry point.

---

*Related: [Is My NGINX Vulnerable? Version vs Distro Backports](/blog/check-nginx-version-vulnerable-backports) for the same version-vs-CVE problem at the package level, and the [NGINX CVE checker](/tools/nginx-cve-checker) tool. [CIS Kubernetes Benchmark with kube-bench](/blog/kube-bench-cis-kubernetes-benchmark) for the cluster the image runs on, and the [OpenSCAP scanning guide](/blog/openscap-cis-scanning-guide) for the host underneath.*
