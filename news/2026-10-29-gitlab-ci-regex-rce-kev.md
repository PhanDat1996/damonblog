---
title: "GitLab CI/CD regex bug (CVE-2026-97229) is being exploited — patch now"
date: 2026-10-29
source: https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-4-2-released/
---

CISA added **CVE-2026-97229** to the KEV catalog on October 29. An integer overflow in the Ruby/Onigmo regex compiler lets an **unauthenticated** user run code on a GitLab CE/EE server through a crafted regular expression in a CI/CD config.

If you self-host GitLab, move to the patched release (19.4.2 or the matching backport) today. CISA's deadline for federal agencies is November 1. Other Ruby apps that compile untrusted regexes may be affected by the same Onigmo issue — see the [Ruby advisory](https://www.ruby-lang.org/en/news/2026/10/23/regexp-fixes-for-gitlab-cves).
