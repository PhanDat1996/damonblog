// lib/nginx-cve/database.ts
// Local NGINX CVE advisory database
// Sources: nginx.org/en/security_advisories.html + NVD
// Last updated: 2026-04-28
// Add new entries here when new CVEs are published

export type CVESeverity = "Critical" | "High" | "Medium" | "Low" | "Info";

export interface VersionRange {
  greaterOrEqual?: string;
  greaterThan?: string;
  lessOrEqual?: string;
  lessThan?: string;
  branch?: "stable" | "mainline" | "all";
}

export interface NginxCVE {
  cve_id:            string;
  title:             string;
  severity:          CVESeverity;
  cvss_score:        number;
  affected_versions: string;       // human-readable description
  fixed_versions:    string[];     // exact versions that fix this
  vulnerable_range:  VersionRange[];
  description:       string;
  conditions:        string | null; // null = always applies
  condition_check:   string | null; // regex/string to search config
  recommendation:    string;
  references:        string[];
  source:            string;
  published:         string;       // YYYY-MM-DD
}

export const NGINX_CVE_DATABASE: NginxCVE[] = [

  // ─── 2026 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2026-1642",
    title:             "SSL upstream response injection vulnerability",
    severity:          "High",
    cvss_score:        8.1,
    affected_versions: "NGINX before 1.28.2 (stable) and before 1.29.5 (mainline)",
    fixed_versions:    ["1.28.2", "1.29.5"],
    vulnerable_range:  [
      { lessThan: "1.28.2" },
    ],
    description:
      "A vulnerability in NGINX's SSL upstream handling may allow response injection when proxying to upstream TLS servers under specific timing conditions. An attacker with the ability to control upstream responses could inject crafted data into subsequent responses.",
    conditions:        "Only relevant when proxying to upstream TLS servers (proxy_pass https://)",
    condition_check:   "proxy_pass https://",
    recommendation:    "Upgrade to NGINX 1.28.2 stable or 1.29.5 mainline or later.",
    references:        [
      "https://nginx.org/news.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2026-1642",
    ],
    source:    "NGINX official advisory / NVD",
    published: "2026-03-15",
  },

  // ─── 2025 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2025-23419",
    title:             "Session resumption across different HTTP virtual servers",
    severity:          "Medium",
    cvss_score:        5.3,
    affected_versions: "NGINX before 1.27.4 (mainline) and before 1.26.3 (stable)",
    fixed_versions:    ["1.27.4", "1.26.3"],
    vulnerable_range:  [
      { lessThan: "1.26.3" },
    ],
    description:
      "NGINX may incorrectly allow TLS session resumption to be used for connections to different HTTP virtual servers when multiple virtual servers share the same IP/port. This can result in requests from one virtual host context being processed under another virtual host's configuration.",
    conditions:        "Requires multiple virtual servers on the same IP:port with different SSL configurations",
    condition_check:   null,
    recommendation:    "Upgrade to NGINX 1.27.4 mainline or 1.26.3 stable. As a workaround, ensure each SSL virtual server uses a dedicated IP address.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2025-23419",
    ],
    source:    "NGINX official advisory",
    published: "2025-02-05",
  },

  // ─── 2024 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2024-7347",
    title:             "ngx_http_mp4_module out-of-bounds read",
    severity:          "Medium",
    cvss_score:        4.7,
    affected_versions: "NGINX before 1.27.1 (mainline) and before 1.26.2 (stable)",
    fixed_versions:    ["1.27.1", "1.26.2"],
    vulnerable_range:  [
      { lessThan: "1.26.2" },
    ],
    description:
      "An out-of-bounds read vulnerability exists in ngx_http_mp4_module when processing specially crafted MP4 files. A remote attacker could cause NGINX worker process crashes or potentially disclose memory contents by sending a malicious MP4 file to an endpoint served by the mp4 module.",
    conditions:        "Only relevant when ngx_http_mp4_module is enabled (mp4; directive in location block)",
    condition_check:   "mp4;",
    recommendation:    "Upgrade to NGINX 1.27.1 mainline or 1.26.2 stable. If immediate upgrade is not possible, disable the mp4 module by removing the mp4; directive.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2024-7347",
    ],
    source:    "NGINX official advisory",
    published: "2024-08-14",
  },

  // ─── 2023 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2023-44487",
    title:             "HTTP/2 Rapid Reset Attack (NGINX affected)",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.25.3 (mainline) when HTTP/2 is enabled",
    fixed_versions:    ["1.25.3"],
    vulnerable_range:  [
      { lessThan: "1.25.3" },
    ],
    description:
      "The HTTP/2 Rapid Reset Attack exploits a design flaw in the HTTP/2 protocol. Attackers send a rapid series of HEADERS frames followed immediately by RST_STREAM frames, which allows them to maintain high request rates while consuming server resources without triggering standard rate limiting. This was used in record-breaking DDoS attacks (398 million rps).",
    conditions:        "Only relevant when HTTP/2 is enabled (http2 on or listen ... http2)",
    condition_check:   "http2",
    recommendation:    "Upgrade to NGINX 1.25.3 mainline. If not possible, disable HTTP/2 or implement aggressive connection-level rate limiting.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2023-44487",
      "https://blog.cloudflare.com/technical-breakdown-http2-rapid-reset-ddos-attack/",
    ],
    source:    "NGINX official advisory / CISA KEV",
    published: "2023-10-10",
  },

  {
    cve_id:            "CVE-2023-44488",
    title:             "ngx_http_v3_module QUIC memory corruption",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.25.3 when HTTP/3 (QUIC) is enabled",
    fixed_versions:    ["1.25.3"],
    vulnerable_range:  [
      { greaterOrEqual: "1.25.0", lessThan: "1.25.3" },
    ],
    description:
      "A memory corruption vulnerability exists in the experimental HTTP/3 (QUIC) implementation in NGINX. Processing malformed QUIC packets could lead to worker process crashes or potential remote code execution.",
    conditions:        "Only relevant when QUIC/HTTP3 is enabled (quic directive or listen ... quic)",
    condition_check:   "quic",
    recommendation:    "Upgrade to NGINX 1.25.3 or later. Disable HTTP/3/QUIC if not required.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2023-44488",
    ],
    source:    "NGINX official advisory",
    published: "2023-10-10",
  },

  // ─── 2022 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2022-41741",
    title:             "ngx_http_mp4_module memory corruption",
    severity:          "High",
    cvss_score:        7.8,
    affected_versions: "NGINX before 1.23.2 (mainline) and before 1.22.1 (stable)",
    fixed_versions:    ["1.23.2", "1.22.1"],
    vulnerable_range:  [
      { lessThan: "1.22.1" },
    ],
    description:
      "A memory corruption vulnerability in ngx_http_mp4_module when processing specially crafted MP4 files. An attacker can trigger a worker process crash or cause NGINX to incorrectly handle client data. In rare cases, this may lead to memory disclosure.",
    conditions:        "Only relevant when ngx_http_mp4_module is enabled (mp4; in location block)",
    condition_check:   "mp4;",
    recommendation:    "Upgrade to NGINX 1.23.2 mainline or 1.22.1 stable. Disable the mp4 module if not required.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2022-41741",
    ],
    source:    "NGINX official advisory",
    published: "2022-10-19",
  },

  {
    cve_id:            "CVE-2022-41742",
    title:             "ngx_http_mp4_module memory disclosure",
    severity:          "High",
    cvss_score:        7.1,
    affected_versions: "NGINX before 1.23.2 (mainline) and before 1.22.1 (stable)",
    fixed_versions:    ["1.23.2", "1.22.1"],
    vulnerable_range:  [
      { lessThan: "1.22.1" },
    ],
    description:
      "An additional memory disclosure vulnerability in ngx_http_mp4_module, related to CVE-2022-41741. Processing malformed MP4 files may cause NGINX to read beyond the allocated buffer, potentially leaking sensitive memory contents in error responses.",
    conditions:        "Only relevant when ngx_http_mp4_module is enabled (mp4; directive)",
    condition_check:   "mp4;",
    recommendation:    "Upgrade to NGINX 1.23.2 mainline or 1.22.1 stable. Disable the mp4 module if not required.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2022-41742",
    ],
    source:    "NGINX official advisory",
    published: "2022-10-19",
  },

  // ─── 2021 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2021-23017",
    title:             "DNS resolver off-by-one heap write",
    severity:          "High",
    cvss_score:        8.1,
    affected_versions: "NGINX before 1.21.0 (mainline) and before 1.20.1 (stable)",
    fixed_versions:    ["1.21.0", "1.20.1"],
    vulnerable_range:  [
      { lessThan: "1.20.1" },
    ],
    description:
      "A one-byte heap overwrite vulnerability in the DNS resolver component. When processing a specially crafted DNS response, NGINX could write a null byte one byte beyond the end of a heap-allocated buffer. This could potentially be exploited for remote code execution under specific conditions.",
    conditions:        "Only relevant when the NGINX resolver is configured (resolver directive present)",
    condition_check:   "resolver ",
    recommendation:    "Upgrade to NGINX 1.21.0 mainline or 1.20.1 stable immediately. This is a heap corruption vulnerability. If upgrade is not immediately possible, remove resolver directives and use hardcoded upstream IP addresses.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2021-23017",
      "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2021-23017",
    ],
    source:    "NGINX official advisory / NVD",
    published: "2021-06-01",
  },

  // ─── 2019 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2019-20372",
    title:             "HTTP request smuggling via invalid chunked request",
    severity:          "Medium",
    cvss_score:        5.3,
    affected_versions: "NGINX before 1.17.7",
    fixed_versions:    ["1.17.7"],
    vulnerable_range:  [
      { lessThan: "1.17.7" },
    ],
    description:
      "NGINX before 1.17.7 might allow HTTP request smuggling in configurations involving error_page with an internal redirect. When using the error_page directive with an internal redirect to handle 400 or 414 errors, an attacker can trigger response information disclosure from previous requests.",
    conditions:        "Relevant when error_page directive redirects 400/414 errors internally",
    condition_check:   "error_page",
    recommendation:    "Upgrade to NGINX 1.17.7 or later.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2019-20372",
    ],
    source:    "NGINX official advisory / NVD",
    published: "2020-01-09",
  },

  {
    cve_id:            "CVE-2019-9511",
    title:             "HTTP/2 Data Dribble — CPU exhaustion DoS",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.17.3 when HTTP/2 is enabled",
    fixed_versions:    ["1.17.3"],
    vulnerable_range:  [
      { lessThan: "1.17.3" },
    ],
    description:
      "An HTTP/2 vulnerability (part of the 'HTTP/2 and HPACK' vulnerability set). Attackers can set the window size to zero and request a large amount of data, causing the server to queue data into memory. This leads to CPU exhaustion and denial of service.",
    conditions:        "Only relevant when HTTP/2 is enabled",
    condition_check:   "http2",
    recommendation:    "Upgrade to NGINX 1.17.3 or later. Disable HTTP/2 as a temporary mitigation.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2019-9511",
    ],
    source:    "NGINX official advisory",
    published: "2019-08-13",
  },

  {
    cve_id:            "CVE-2019-9516",
    title:             "HTTP/2 0-Length Headers Leak — memory exhaustion",
    severity:          "High",
    cvss_score:        6.5,
    affected_versions: "NGINX before 1.17.3 when HTTP/2 is enabled",
    fixed_versions:    ["1.17.3"],
    vulnerable_range:  [
      { lessThan: "1.17.3" },
    ],
    description:
      "An HTTP/2 memory leak vulnerability. Sending zero-length headers causes NGINX to allocate memory that is never freed, eventually leading to memory exhaustion and denial of service.",
    conditions:        "Only relevant when HTTP/2 is enabled",
    condition_check:   "http2",
    recommendation:    "Upgrade to NGINX 1.17.3 or later.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2019-9516",
    ],
    source:    "NGINX official advisory",
    published: "2019-08-13",
  },

  // ─── 2018 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2018-16843",
    title:             "HTTP/2 excessive memory consumption",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.15.6 and before 1.14.1 when HTTP/2 enabled",
    fixed_versions:    ["1.15.6", "1.14.1"],
    vulnerable_range:  [
      { lessThan: "1.14.1" },
    ],
    description:
      "Excessive memory consumption in NGINX's HTTP/2 implementation. Attackers can send specially crafted HTTP/2 requests that cause NGINX to consume excessive memory, leading to denial of service or worker process crashes.",
    conditions:        "Only relevant when HTTP/2 is enabled",
    condition_check:   "http2",
    recommendation:    "Upgrade to NGINX 1.15.6 mainline or 1.14.1 stable.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2018-16843",
    ],
    source:    "NGINX official advisory",
    published: "2018-11-06",
  },

  {
    cve_id:            "CVE-2018-16844",
    title:             "HTTP/2 excessive CPU usage",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.15.6 and before 1.14.1 when HTTP/2 enabled",
    fixed_versions:    ["1.15.6", "1.14.1"],
    vulnerable_range:  [
      { lessThan: "1.14.1" },
    ],
    description:
      "Excessive CPU consumption vulnerability in NGINX's HTTP/2 implementation. Processing specially crafted HTTP/2 frames can cause worker process CPU to be fully consumed, resulting in denial of service for legitimate requests.",
    conditions:        "Only relevant when HTTP/2 is enabled",
    condition_check:   "http2",
    recommendation:    "Upgrade to NGINX 1.15.6 mainline or 1.14.1 stable.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2018-16844",
    ],
    source:    "NGINX official advisory",
    published: "2018-11-06",
  },

  {
    cve_id:            "CVE-2018-16845",
    title:             "ngx_http_mp4_module denial of service and memory disclosure",
    severity:          "Medium",
    cvss_score:        5.5,
    affected_versions: "NGINX before 1.15.6 and before 1.14.1",
    fixed_versions:    ["1.15.6", "1.14.1"],
    vulnerable_range:  [
      { lessThan: "1.14.1" },
    ],
    description:
      "Processing specially crafted MP4 files via ngx_http_mp4_module can lead to infinite loop (denial of service) or allow reading beyond a memory buffer (memory disclosure). The vulnerability is triggered by specific atom arrangements in MP4 file metadata.",
    conditions:        "Only relevant when ngx_http_mp4_module is enabled (mp4; directive)",
    condition_check:   "mp4;",
    recommendation:    "Upgrade to NGINX 1.15.6 or 1.14.1. Disable the mp4 module if not required.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2018-16845",
    ],
    source:    "NGINX official advisory",
    published: "2018-11-06",
  },

  // ─── 2017 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2017-7529",
    title:             "Range filter integer overflow — memory disclosure",
    severity:          "Medium",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.13.3 (mainline) and before 1.12.1 (stable)",
    fixed_versions:    ["1.13.3", "1.12.1"],
    vulnerable_range:  [
      { lessThan: "1.12.1" },
    ],
    description:
      "An integer overflow vulnerability in the range filter module (ngx_http_range_filter_module). Sending a specially crafted Range header can cause NGINX to allocate an incorrectly sized buffer and expose portions of previously freed memory in the response body.",
    conditions:        null,
    condition_check:   null,
    recommendation:    "Upgrade to NGINX 1.13.3 mainline or 1.12.1 stable. As a workaround, disable the Range header processing.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2017-7529",
    ],
    source:    "NGINX official advisory",
    published: "2017-07-11",
  },

  // ─── 2016 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2016-4450",
    title:             "Excessive memory allocation in HTTP/2",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.11.1 when HTTP/2 is enabled",
    fixed_versions:    ["1.11.1"],
    vulnerable_range:  [
      { greaterOrEqual: "1.9.5", lessThan: "1.11.1" },
    ],
    description:
      "A NULL pointer dereference vulnerability in NGINX's HTTP/2 implementation. A remote attacker can cause a worker process crash (denial of service) by sending a specially crafted HTTP/2 request.",
    conditions:        "Only relevant when HTTP/2 is enabled (http2 on directive)",
    condition_check:   "http2",
    recommendation:    "Upgrade to NGINX 1.11.1 or later. Disable HTTP/2 as a temporary mitigation.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2016-4450",
    ],
    source:    "NGINX official advisory",
    published: "2016-05-31",
  },

  // ─── 2014 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2014-3616",
    title:             "SSL session reuse vulnerability",
    severity:          "Medium",
    cvss_score:        5.8,
    affected_versions: "NGINX before 1.7.4 and before 1.6.2",
    fixed_versions:    ["1.7.4", "1.6.2"],
    vulnerable_range:  [
      { lessThan: "1.6.2" },
    ],
    description:
      "NGINX allows TLS session resumption without proper validation of virtual host context. An attacker can use a session ticket obtained from one virtual server to resume a session on a different virtual server on the same NGINX instance, potentially bypassing access controls.",
    conditions:        "Requires multiple SSL virtual hosts on the same IP/port with session caching enabled",
    condition_check:   "ssl_session_cache",
    recommendation:    "Upgrade to NGINX 1.7.4 mainline or 1.6.2 stable.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2014-3616",
    ],
    source:    "NGINX official advisory",
    published: "2014-09-17",
  },

  // ─── 2013 ────────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2013-2028",
    title:             "Chunked Transfer-Encoding stack buffer overflow",
    severity:          "Critical",
    cvss_score:        9.8,
    affected_versions: "NGINX 1.3.9 through 1.4.0",
    fixed_versions:    ["1.4.1", "1.5.0"],
    vulnerable_range:  [
      { greaterOrEqual: "1.3.9", lessOrEqual: "1.4.0" },
    ],
    description:
      "A stack buffer overflow vulnerability in NGINX's HTTP chunked transfer encoding parser. A remote attacker can send a specially crafted chunked request that causes a stack-based buffer overflow, potentially leading to remote code execution or denial of service. This is one of the most critical historical NGINX vulnerabilities.",
    conditions:        null,
    condition_check:   null,
    recommendation:    "Upgrade to NGINX 1.4.1 or 1.5.0 or later. This is a critical RCE vulnerability — immediate upgrade required.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2013-2028",
    ],
    source:    "NGINX official advisory / NVD",
    published: "2013-05-07",
  },

  {
    cve_id:            "CVE-2013-4547",
    title:             "Bypass security restrictions via crafted URI",
    severity:          "High",
    cvss_score:        7.5,
    affected_versions: "NGINX before 1.5.7 and before 1.4.4",
    fixed_versions:    ["1.5.7", "1.4.4"],
    vulnerable_range:  [
      { lessThan: "1.4.4" },
    ],
    description:
      "NGINX fails to properly handle filenames with embedded null bytes and spaces. An attacker can craft a URI that bypasses location-based access restrictions, potentially accessing protected resources or PHP files with unauthorized parameters.",
    conditions:        "Relevant in configurations that restrict access based on URI patterns",
    condition_check:   null,
    recommendation:    "Upgrade to NGINX 1.5.7 mainline or 1.4.4 stable.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2013-4547",
    ],
    source:    "NGINX official advisory",
    published: "2013-11-19",
  },

  // ─── WebDAV ───────────────────────────────────────────────────────────────

  {
    cve_id:            "CVE-2009-3555",
    title:             "TLS renegotiation vulnerability (affects NGINX with WebDAV)",
    severity:          "Medium",
    cvss_score:        5.8,
    affected_versions: "NGINX before 0.8.23 / 0.7.64 with WebDAV module",
    fixed_versions:    ["0.8.23", "0.7.64"],
    vulnerable_range:  [
      { lessThan: "0.8.23" },
    ],
    description:
      "The TLS protocol allows MITM attackers to insert arbitrary plaintext into the beginning of an application-protocol stream via a renegotiation handshake. Particularly relevant when ngx_http_dav_module is in use as it involves authenticated sessions.",
    conditions:        "Relevant when ngx_http_dav_module (WebDAV) is enabled",
    condition_check:   "dav_methods",
    recommendation:    "Upgrade to NGINX 0.8.23 or 0.7.64 or later. Disable WebDAV module if not required.",
    references:        [
      "https://nginx.org/en/security_advisories.html",
      "https://nvd.nist.gov/vuln/detail/CVE-2009-3555",
    ],
    source:    "NVD",
    published: "2009-11-09",
  },
];

// Helper to get latest safe version recommendation
export const LATEST_STABLE_VERSION  = "1.28.2";
export const LATEST_MAINLINE_VERSION = "1.29.5";