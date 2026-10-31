---
title: "Is My NGINX Vulnerable? Version vs Distro Backports"
date: "2026-10-31"
updated: "2026-10-31"
excerpt: "nginx -v says 1.28.3 and a scanner lists 16 CVEs. Lab-tested on Ubuntu 26.04: all 16 were already patched. How to check the package, not the version."
tags: ["nginx", "security", "linux", "security-ops", "troubleshooting"]
featured: false
lab: true
category: "security"
---

A vulnerability scanner reads `nginx/1.28.3` from your server header or `nginx -v`, compares it with the upstream advisory list, and reports a page of CVEs. On a distribution package, that list is often wrong. Debian, Ubuntu, RHEL and others **backport** security fixes into the version they ship, so the upstream version number stays the same while the code underneath is patched.

This lab took one Ubuntu 26.04 server, ran a version-only check against it, and then verified every result against the package itself.

> **Lab environment:** Ubuntu 26.04 LTS, kernel `7.0.0-42-generic`, NGINX package `1.28.3-2ubuntu1.12` from the Ubuntu archive, `ubuntu-pro-client` 37.2. The version-only check used the advisory data behind the [NGINX CVE checker](/tools/nginx-cve-checker) (nginx.org advisory list, updated 2026-10-30). Reading the changelog and `apt changelog` works as a normal user. `pro fix` was run with `sudo` and `--dry-run`, so nothing was installed.

---

## Quick answer

```bash
# What the package really is (not just the upstream version)
dpkg -l nginx | tail -1

# Is a specific CVE fixed in the installed package? (Debian/Ubuntu)
zgrep -c CVE-2026-42533 /usr/share/doc/nginx/changelog.Debian.gz

# Ubuntu: the authoritative answer, without installing anything
sudo pro fix CVE-2026-42533 --dry-run

# RHEL family (not run in this lab)
rpm -q --changelog nginx | grep CVE-2026-42533
```

| Result | Meaning |
|---|---|
| CVE listed in the package changelog | The distro patched it in that revision or earlier |
| `pro fix`: "The update is already installed" / "is resolved" | Fixed in your installed package |
| `pro fix`: "No affected source packages are installed" | Your package was never affected (wrong branch, feature not built, etc.) |
| CVE missing from the changelog, and the distro tracker says "needs evaluation" or "vulnerable" | Treat it as open |

---

## The version-only result: 16 advisories

`nginx -v` on the lab VM:

```
nginx version: nginx/1.28.3 (Ubuntu)
```

Comparing `1.28.3` against the upstream advisory ranges flags 16 advisories, including one rated **major**. The changelog marker in each line is explained below:

```
riskStatus possibly_vulnerable matches 16
CVE-2026-42533 major IN_UBUNTU_CHANGELOG | Buffer overflow when using map and regex
CVE-2026-15176 medium IN_UBUNTU_CHANGELOG | Buffer overflow when using alias with rewrite
CVE-2026-95101 medium IN_UBUNTU_CHANGELOG | Request body injection in HTTP/3
CVE-2026-97629 medium IN_UBUNTU_CHANGELOG | Session forgery when using TLS session tickets
CVE-2026-97205 medium IN_UBUNTU_CHANGELOG | Use-after-free when using asynchronous file I/O (AIO)
CVE-2026-60005 medium IN_UBUNTU_CHANGELOG | Memory disclosure when using ngx_http_slice_module
CVE-2026-56434 medium IN_UBUNTU_CHANGELOG | Use-after-free when using ngx_http_ssi_module
CVE-2026-42055 medium IN_UBUNTU_CHANGELOG | Buffer overflow in the ngx_http_proxy_v2_module and ngx_http_grpc_module
CVE-2026-9256 medium IN_UBUNTU_CHANGELOG | Buffer overflow in the ngx_http_rewrite_module
CVE-2026-42945 medium IN_UBUNTU_CHANGELOG | Buffer overflow in the ngx_http_rewrite_module
CVE-2026-42946 medium IN_UBUNTU_CHANGELOG | Buffer overread in the ngx_http_scgi_module and ngx_http_uwsgi_module
CVE-2026-40460 medium IN_UBUNTU_CHANGELOG | HTTP/3 address spoofing
CVE-2026-40701 medium IN_UBUNTU_CHANGELOG | resolver use-after-free in OCSP
CVE-2026-48142 low IN_UBUNTU_CHANGELOG | Buffer overread in the ngx_http_charset_module
CVE-2026-42934 low IN_UBUNTU_CHANGELOG | Buffer overread in the ngx_http_charset_module
CVE-2025-53859 low IN_UBUNTU_CHANGELOG | Buffer overread in the ngx_mail_smtp_module
```

The lab script that produced this ran the checker's analyzer on the string `nginx version: nginx/1.28.3 (Ubuntu)`, then marked each result whose CVE ID appears in the package changelog shown in the next section (`IN_UBUNTU_CHANGELOG`).

By upstream numbering that's correct: 1.28.3 is older than the 1.30.x/1.31.x releases that fixed these. But this isn't upstream's 1.28.3.

---

## The package: every one of them is patched

```
$ dpkg -l nginx | tail -1
ii  nginx          1.28.3-2ubuntu1.12 amd64        small, powerful, scalable web/proxy server
```

The `-2ubuntu1.12` suffix is the part that matters. Every Ubuntu security update to this package adds an entry to its changelog:

```
$ zcat /usr/share/doc/nginx/changelog.Debian.gz | head -12
nginx (1.28.3-2ubuntu1.12) resolute-security; urgency=medium

  * SECURITY UPDATE: heap overflow in certain configurations
    - debian/patches/CVE-2026-15176.patch: Avoid post-rewrite URI to path
      mapping with alias in src/http/ngx_http_core_module.c.
    - CVE-2026-15176
  * SECURITY UPDATE: heap overflow in certain configurations
    - debian/patches/CVE-2026-93479.patch: Script: reserved memory overrun
      protection in ngx_http_script_run() in src/http/ngx_http_script.c,
      src/stream/ngx_stream_script.c.
    - CVE-2026-93479
...
```

All CVE IDs mentioned anywhere in the changelog:

```
$ zcat /usr/share/doc/nginx/changelog.Debian.gz | grep -oE "CVE-[0-9]{4}-[0-9]+" | sort -u | tr "\n" " "
CVE-2023-44487 CVE-2024-3094 CVE-2024-31079 CVE-2024-32760 CVE-2024-34161 CVE-2024-35200 CVE-2024-7347 CVE-2025-53859 CVE-2026-15176 CVE-2026-1642 CVE-2026-40460 CVE-2026-40701 CVE-2026-42055 CVE-2026-42533 CVE-2026-42934 CVE-2026-42945 CVE-2026-42946 CVE-2026-48142 CVE-2026-49975 CVE-2026-56434 CVE-2026-60005 CVE-2026-9256 CVE-2026-93479 CVE-2026-95101 CVE-2026-97205 CVE-2026-97629
```

All **16 of 16** advisories from the version-only check are in that list. On this server, the version-only check had a 100% false-positive rate.

Two details from the same data:

- `CVE-2026-93479` is patched in the Ubuntu package even though upstream lists its vulnerable range as 1.30.0–1.30.5 and 1.31.2–1.31.6, which doesn't include 1.28.3. A version-only check correctly left it out. A CVE ID in a changelog tells you the distro shipped a patch. It doesn't tell you your version was ever exposed.
- A changelog line is necessary but not always sufficient. The next section shows why.

---

## A fix can be shipped, pulled, and shipped again

For CVE-2026-42533, the changelog records a fix that was disabled twice:

```
nginx (1.28.3-2ubuntu1.11) resolute-security; urgency=medium
  * SECURITY UPDATE: DoS and possible code execution via map directive
    - debian/patches/CVE-2026-42533.patch: fix DoS and possible code execution
...
nginx (1.28.3-2ubuntu1.10) resolute-security; urgency=medium
  * SECURITY REGRESSION: "no buffer space in script copy" (LP: #2164558)
    - debian/patches/CVE-2026-42533.patch: disabled, pending further
      investigation.
...
nginx (1.28.3-2ubuntu1.9) resolute-security; urgency=medium
  * SECURITY UPDATE: DoS and possible code execution via map directive
...
nginx (1.28.3-2ubuntu1.8) resolute-security; urgency=medium
  * SECURITY REGRESSION: Security fix may break ABI (LP: #2161362)
    - debian/patches/CVE-2026-42533-*.patch: Disabled for now.
```

`grep CVE-2026-42533` on a server running `ubuntu1.10` **finds** the CVE ID, because the entry that disables the fix mentions it too. Reading only the top entries, or using the distro tool below, avoids that trap. What the patch does and how to audit your config for this CVE: [NGINX CVE-2026-42533](/blog/nginx-cve-2026-42533-map-regex).

---

## Ubuntu: pro fix gives a direct answer

`pro fix` checks the Ubuntu security data against your installed packages. With `--dry-run` it only reports. Three different answers came up in the lab:

**Fixed in the installed package:**

```
$ sudo pro fix CVE-2026-42533 --dry-run
...
1 affected source package is installed: nginx
(1/1) nginx:
A fix is available in Ubuntu standard updates.
The update is already installed.

✔ CVE-2026-42533 is resolved.
```

**Never affected.** CVE-2026-42530 is an HTTP/3 bug in mainline 1.31.0–1.31.1 only:

```
$ sudo pro fix CVE-2026-42530 --dry-run
...
No affected source packages are installed.

✔ CVE-2026-42530 does not affect your system.
```

**Never affected**, for a different reason. CVE-2026-90439 needs HTTP/3 with OpenSSL ≤ 3.5.0, and upstream lists 1.29.2–1.31.5:

```
$ sudo pro fix CVE-2026-90439 --dry-run
...
No affected source packages are installed.

✔ CVE-2026-90439 does not affect your system.
```

The changelog doesn't mention either of the last two, and that's expected: there was nothing to patch. A simple loop over the changelog can't tell "not affected" from "not fixed yet":

```
$ for c in CVE-2026-42533 CVE-2026-42530 CVE-2026-93479 CVE-2026-90439; do printf "%-16s " $c; zgrep -q "$c" /usr/share/doc/nginx/changelog.Debian.gz && echo "in changelog" || echo "NOT in changelog"; done
CVE-2026-42533   in changelog
CVE-2026-42530   NOT in changelog
CVE-2026-93479   in changelog
CVE-2026-90439   NOT in changelog
```

For "NOT in changelog" lines, check `pro fix` or the distro's CVE tracker (`https://ubuntu.com/security/CVE-...`, Debian's security tracker, Red Hat's CVE pages).

The first lines of every `pro fix` run were an update notice (`A new version is available: 38ubuntu0~26.04`). It didn't change the results.

### Check before you upgrade

`apt changelog` downloads the changelog for the candidate package from Ubuntu's servers, so you can see what an update fixes before installing it:

```
$ apt changelog nginx | head -3
Get:1 https://changelogs.ubuntu.com nginx 1.28.3-2ubuntu1.12 Changelog [211 kB]
nginx (1.28.3-2ubuntu1.12) resolute-security; urgency=medium
```

---

## When the version check is right

Version-only results are accurate when NGINX doesn't come from a distro that backports:

- Packages from nginx.org's own repository (`nginx/1.30.x` without a distro tag) follow upstream versions. The upstream fixed-in versions apply directly.
- Builds compiled from source, or third-party images that pin an upstream tarball.
- Distro releases past their support window, where nothing gets backported anymore.

The lab didn't test those cases. For any of them, the [NGINX CVE checker](/tools/nginx-cve-checker) gives a direct answer from `nginx -V`, and the checker also flags `(Ubuntu)`/`(Debian)`/RHEL-style strings with a note to check the changelog.

---

## What to report to a scanner or auditor

When a scan flags a backported package, the evidence that closes the finding is:

1. `dpkg -l nginx` (or `rpm -q nginx`): the full package revision.
2. The changelog entry, or `pro fix CVE-... --dry-run` output, naming the CVE as fixed.
3. The distro's CVE tracker page listing your release as fixed in that revision or earlier.

Hiding the version (`server_tokens off;`) stops banner-based scanners from flagging anything, but it doesn't fix anything. Keep it as a hardening step, as in [NGINX SSL hardening](/blog/nginx-ssl-hardening), not as a CVE response. The OS side of the same baseline is in [CIS Level 1 hardening for Ubuntu](/blog/cis-level1-ubuntu-hardening).

---

## FAQ

**Why does nginx -v show an old version after I updated?**
Distros keep the upstream version and add a revision suffix for each patch. In the lab, `nginx -v` showed `1.28.3` while the package `1.28.3-2ubuntu1.12` contained fixes for advisories that upstream only fixed in 1.30.x and 1.31.x.

**Is a CVE in the changelog always fixed?**
Usually, but read the entry. Ubuntu's NGINX changelog mentions CVE-2026-42533 in two entries that **disabled** the fix (`ubuntu1.8`, `ubuntu1.10`) as well as the ones that applied it.

**How do I check a CVE on Ubuntu without installing anything?**
`sudo pro fix CVE-XXXX-YYYY --dry-run`. In the lab it answered "is resolved" for a patched CVE and "does not affect your system" for two HTTP/3 CVEs that never applied to this package.

**Does server_tokens off fix CVE findings?**
No. It hides the version from banner scanners, but the code is the same. Fix the package, then use `server_tokens off` as hardening.

**What about Docker images?**
Not tested in this lab. Images built on a distro's NGINX package follow that distro's changelog. Images built from upstream source follow upstream versions.
