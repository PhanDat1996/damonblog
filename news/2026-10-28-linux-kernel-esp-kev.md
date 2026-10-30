---
title: "Linux kernel ESP bug (CVE-2026-46300) chained with PHP flaws for root webshells"
date: 2026-10-28
source: https://nvd.nist.gov/vuln/detail/CVE-2026-46300
---

CISA added **CVE-2026-46300** to the KEV catalog on October 28. A missing initialization in socket buffer coalescing makes ESP input processing decrypt shared fragments in place, which can modify page-cache-backed data.

CISA says attackers chain it with the PHP flaws **CVE-2026-109618** and **CVE-2026-109619** to drop PHP webshells and run commands as root. Patch the kernel (stable fixes are linked from NVD) and the PHP runtime together — fixing only one leaves the chain half open.
