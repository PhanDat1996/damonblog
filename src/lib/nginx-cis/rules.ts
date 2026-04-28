// lib/nginx-cis/rules.ts
// CIS-style NGINX security rules — v3
// Based on CIS-style NGINX hardening recommendations

export type Severity   = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export interface CISRule {
  id:               string;       // e.g. "2.1.1"
  title:            string;
  severity:         Severity;
  category:         string;
  description:      string;
  check:            (config: string) => boolean; // true = issue found
  remediation:      string;
  config_fix:       string;
  why_it_matters:   string;       // real-world impact
  attack_type:      string;       // e.g. "Information Disclosure"
  owasp_mapping:    string;       // e.g. "A05 Security Misconfiguration"
  confidence:       Confidence;
  detection_logic:  string;       // brief explanation of detection method
  reference:        string;
}

export interface CISResult {
  rule:   CISRule;
  passed: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const hasDirective = (config: string, name: string): boolean =>
  new RegExp(`(?:^|\\n)\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(config);

export const hasHeader = (config: string, name: string): boolean =>
  new RegExp(`add_header\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(config);

export const getDirectiveValue = (config: string, name: string): string | null =>
  config.match(
    new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([^;\\n]+)`, "i")
  )?.[1]?.trim() ?? null;

// ─── Rules ────────────────────────────────────────────────────────────────────

export const CIS_RULES: CISRule[] = [

  // ══ HIGH ══════════════════════════════════════════════════════════════════

  {
    id:             "2.1.1",
    title:          "NGINX version disclosure via server_tokens",
    severity:       "high",
    category:       "Information Disclosure",
    description:    "server_tokens is on or not explicitly disabled. NGINX version leaks in every Server response header and default error page body.",
    check:          (c) => {
      const val = getDirectiveValue(c, "server_tokens");
      return val === null || val.toLowerCase() !== "off";
    },
    remediation:    "Set server_tokens off in the http{} block. This suppresses the NGINX version from both response headers and error pages.",
    config_fix:     "server_tokens off;",
    why_it_matters: "An attacker who knows your exact NGINX version can cross-reference public CVE databases and target version-specific vulnerabilities without ever sending a single exploit attempt. Shodan and other scanners index this information automatically. Version disclosure converts reconnaissance from active to passive.",
    attack_type:    "Reconnaissance / Fingerprinting",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks for explicit 'server_tokens on' or absence of 'server_tokens off'. Default NGINX value is on.",
    reference:      "CIS NGINX Benchmark v2.1.0 §5.1.1",
  },

  {
    id:             "2.1.2",
    title:          "Directory listing enabled (autoindex on)",
    severity:       "high",
    category:       "Information Disclosure",
    description:    "autoindex on is present. Any directory without an index file will expose its full contents to unauthenticated users.",
    check:          (c) => /autoindex\s+on/i.test(c),
    remediation:    "Remove autoindex on or explicitly set autoindex off. If directory listing is needed for a specific path, scope it to that location block only.",
    config_fix:     "autoindex off;",
    why_it_matters: "Directory listing can expose backup files (database dumps, .sql files), source code, configuration files with credentials, and private assets. Attackers routinely look for autoindex-enabled paths because they bypass authentication entirely. A single exposed backup file can lead to full database compromise.",
    attack_type:    "Information Disclosure / Data Exposure",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Searches for 'autoindex on' directive anywhere in config.",
    reference:      "CIS NGINX Benchmark v2.1.0 §5.1.2",
  },

  {
    id:             "2.1.3",
    title:          "Legacy TLS versions enabled (TLS 1.0 / TLS 1.1)",
    severity:       "high",
    category:       "Transport Security",
    description:    "ssl_protocols includes TLSv1 or TLSv1.1. Both versions are deprecated by RFC 8996 and contain well-documented cryptographic weaknesses.",
    check:          (c) => /ssl_protocols[^;]*TLSv1(?:\.1)?\b/i.test(c),
    remediation:    "Restrict ssl_protocols to TLSv1.2 TLSv1.3 only. All modern clients support TLS 1.2+. TLS 1.1 support was removed from Chrome 84 and Firefox 78.",
    config_fix:     "ssl_protocols TLSv1.2 TLSv1.3;",
    why_it_matters: "TLS 1.0 is vulnerable to BEAST (Browser Exploit Against SSL/TLS) and POODLE (Padding Oracle On Downgraded Legacy Encryption) attacks. TLS 1.1 lacks AEAD cipher suites and perfect forward secrecy requirements. Both will cause immediate failures in PCI-DSS, SOC 2 Type II, HIPAA, and FedRAMP audits. In a man-in-the-middle position, an attacker can force a downgrade to these protocols and decrypt session traffic.",
    attack_type:    "Protocol Downgrade / MITM / Compliance Failure",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Regex match for TLSv1 or TLSv1.1 inside ssl_protocols directive value.",
    reference:      "RFC 8996 / CIS NGINX Benchmark v2.1.0 §4.1.2",
  },

  {
    id:             "2.1.4",
    title:          "No HTTPS listener configured",
    severity:       "high",
    category:       "Transport Security",
    description:    "No listen 443 ssl directive was found. All traffic is served over unencrypted HTTP.",
    check:          (c) => !/listen\s+443\b/i.test(c),
    remediation:    "Add a TLS-enabled server block. Use Let's Encrypt (certbot) for free automated certificates, or your organization's certificate authority.",
    config_fix: `server {
    listen 443 ssl http2;
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
}`,
    why_it_matters: "All HTTP traffic is plaintext. Credentials, session cookies, form data, and API tokens transmitted over HTTP are trivially interceptable on the same network (coffee shops, corporate networks, cloud provider networks). HTTP connections are also subject to content injection attacks where ISPs or attackers insert malicious scripts into responses.",
    attack_type:    "Credential Interception / Session Hijacking / Content Injection",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Checks for absence of 'listen 443' in any server block.",
    reference:      "CIS NGINX Benchmark v2.1.0 §4.1.1",
  },

  {
    id:             "2.1.5",
    title:          "Missing HTTP Strict Transport Security (HSTS)",
    severity:       "high",
    category:       "Transport Security",
    description:    "An HTTPS listener was detected but no Strict-Transport-Security header is configured.",
    check:          (c) => /listen\s+443/i.test(c) && !hasHeader(c, "Strict-Transport-Security"),
    remediation:    "Add HSTS with a minimum max-age of 1 year inside every HTTPS server block. Include includeSubDomains once all subdomains serve HTTPS.",
    config_fix:     `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
    why_it_matters: "Without HSTS, users who navigate to your site via HTTP (e.g., bookmarks, typed URLs, email links) can be intercepted before being redirected to HTTPS. SSL stripping attacks silently remove the 'S' from HTTPS and serve the entire session over HTTP while appearing HTTPS to the server. HSTS forces the browser to refuse non-HTTPS connections at the client level, eliminating this window.",
    attack_type:    "SSL Stripping / MITM",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Detects HTTPS listener (listen 443) but absence of add_header Strict-Transport-Security.",
    reference:      "RFC 6797 / CIS NGINX Benchmark v2.1.0 §4.1.5",
  },

  {
    id:             "2.1.6",
    title:          "Hidden files unprotected (.git, .env, .htaccess)",
    severity:       "high",
    category:       "Information Disclosure",
    description:    "No location block was found denying access to dotfiles. .git directories, .env files, and .htaccess files may be publicly accessible.",
    check:          (c) =>
      !/location\s+[~*]+\s+["']?\\?\.(git|env|htaccess|svn)/i.test(c) &&
      !/location\s+[~*]+\s+["']?\/\.\w/i.test(c),
    remediation:    "Add a catch-all location block denying access to all paths beginning with a dot. Exclude .well-known for ACME certificate validation.",
    config_fix: `location ~ /\\.(?!well-known) {
    deny all;
    return 404;
}`,
    why_it_matters: "Exposed .git directories allow downloading the entire source code history, including any credentials, API keys, or database passwords ever committed. .env files directly expose database credentials, third-party API keys, JWT secrets, and OAuth tokens. These are actively hunted by automated scanners — GitGuardian reported over 6 million secrets leaked via public repositories in 2023 alone. On NGINX, without a deny rule, these files are served directly as plaintext.",
    attack_type:    "Credential Exposure / Source Code Disclosure",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "medium",
    detection_logic: "Checks for absence of regex location blocks matching common dotfile patterns.",
    reference:      "CIS NGINX Benchmark v2.1.0 §5.1.3 / OWASP A05",
  },

  {
    id:             "2.1.7",
    title:          "Weak cipher suites configured",
    severity:       "high",
    category:       "Transport Security",
    description:    "ssl_ciphers contains one or more weak cipher patterns: RC4, DES, 3DES, NULL, EXPORT, ANON, or MD5.",
    check:          (c) => {
      const val = getDirectiveValue(c, "ssl_ciphers")?.toUpperCase() ?? "";
      if (!val) return false;
      return /RC4|DES\b|3DES|NULL|EXPORT|ANON|MD5|ADH|AECDH/.test(val);
    },
    remediation:    "Replace ssl_ciphers with the Mozilla Intermediate or Modern cipher list. Set ssl_prefer_server_ciphers off to allow TLS 1.3 to use its own cipher ordering.",
    config_fix: `ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;`,
    why_it_matters: "RC4 has statistical biases that allow recovery of plaintext from enough ciphertext. 3DES is vulnerable to the Sweet32 birthday attack with only ~785GB of encrypted data (achievable in hours on a busy HTTPS connection). NULL and ANON cipher suites provide zero encryption or authentication. These ciphers signal a fundamental TLS misconfiguration and will cause immediate failures in security audits.",
    attack_type:    "Cryptographic Attack / Compliance Failure",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Extracts ssl_ciphers value and tests for known weak cipher name patterns.",
    reference:      "CIS NGINX Benchmark v2.1.0 §4.1.4 / Mozilla SSL Generator",
  },

  // ══ MEDIUM ════════════════════════════════════════════════════════════════

  {
    id:             "3.1.1",
    title:          "Missing X-Frame-Options header",
    severity:       "medium",
    category:       "Security Headers",
    description:    "No X-Frame-Options or CSP frame-ancestors directive found. Pages can be embedded in iframes by any origin.",
    check:          (c) => !hasHeader(c, "X-Frame-Options") && !/frame-ancestors/i.test(c),
    remediation:    "Add X-Frame-Options SAMEORIGIN, or use CSP frame-ancestors for more granular control. CSP frame-ancestors supersedes X-Frame-Options in modern browsers.",
    config_fix:     `add_header X-Frame-Options "SAMEORIGIN" always;`,
    why_it_matters: "Clickjacking attacks embed your page in an invisible iframe layered over a deceptive page. Users believe they are clicking on the attacker's page, but are actually clicking on your authenticated interface — executing account deletions, money transfers, or permission changes without their knowledge. This attack requires zero server-side vulnerabilities and is trivially executed.",
    attack_type:    "Clickjacking / UI Redress Attack",
    owasp_mapping:  "A03 Injection (UI-layer)",
    confidence:     "high",
    detection_logic: "Checks absence of add_header X-Frame-Options and absence of 'frame-ancestors' in CSP header.",
    reference:      "CIS NGINX Benchmark v2.1.0 §6.1.1 / OWASP Clickjacking Defense",
  },

  {
    id:             "3.1.2",
    title:          "Missing X-Content-Type-Options header",
    severity:       "medium",
    category:       "Security Headers",
    description:    "X-Content-Type-Options: nosniff is absent. Browsers may MIME-sniff responses and execute scripts from non-script content types.",
    check:          (c) => !hasHeader(c, "X-Content-Type-Options"),
    remediation:    "Add X-Content-Type-Options nosniff to all responses. This is a single-line addition with no operational impact.",
    config_fix:     `add_header X-Content-Type-Options "nosniff" always;`,
    why_it_matters: "MIME-sniffing allows browsers to execute JavaScript embedded in files served as text/plain or image/jpeg. An attacker who can upload files (profile pictures, documents) can upload a JavaScript payload served as an image, then link to it to execute the script in a victim's browser. This converts file upload features into XSS vectors. The nosniff directive forces browsers to respect the declared Content-Type.",
    attack_type:    "MIME-Sniffing XSS / Content Injection",
    owasp_mapping:  "A03 Injection",
    confidence:     "high",
    detection_logic: "Checks for absence of add_header X-Content-Type-Options directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §6.1.2",
  },

  {
    id:             "3.1.3",
    title:          "Missing Content-Security-Policy header",
    severity:       "medium",
    category:       "Security Headers",
    description:    "No Content-Security-Policy header is configured. The browser applies no constraints on script execution sources.",
    check:          (c) => !hasHeader(c, "Content-Security-Policy"),
    remediation:    "Deploy CSP in report-only mode first (Content-Security-Policy-Report-Only) to identify violations without blocking. Tighten incrementally, then switch to enforcement.",
    config_fix:     `add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'" always;`,
    why_it_matters: "Without CSP, any XSS vulnerability — even a minor reflected XSS in a search parameter — allows an attacker to execute arbitrary JavaScript with full access to the page's DOM, cookies (unless HttpOnly), localStorage, and the ability to make authenticated API calls. CSP is the last line of defense that limits the blast radius of XSS from full account takeover to a contained, non-executable injection.",
    attack_type:    "Cross-Site Scripting (XSS) Amplification",
    owasp_mapping:  "A03 Injection",
    confidence:     "high",
    detection_logic: "Checks for absence of add_header Content-Security-Policy directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §6.1.3 / W3C CSP Level 3",
  },

  {
    id:             "3.1.4",
    title:          "Missing Referrer-Policy header",
    severity:       "medium",
    category:       "Security Headers",
    description:    "No Referrer-Policy header found. Full URLs including paths and query strings are sent as Referer on external navigation.",
    check:          (c) => !hasHeader(c, "Referrer-Policy"),
    remediation:    "Set Referrer-Policy to strict-origin-when-cross-origin to send origin-only on cross-origin requests and full URL on same-origin.",
    config_fix:     `add_header Referrer-Policy "strict-origin-when-cross-origin" always;`,
    why_it_matters: "Query strings frequently contain session tokens, CSRF tokens, user IDs, and internal path structures. Without Referrer-Policy, every external link, image load from a third-party CDN, or analytics script receives the full URL of the page the user was on. This can leak authenticated session state, reveal internal application structure, and expose user activity to advertising networks.",
    attack_type:    "Information Leakage / Token Exposure",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Checks for absence of add_header Referrer-Policy directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §6.1.4 / W3C Referrer Policy",
  },

  {
    id:             "3.2.1",
    title:          "Proxy using HTTP/1.0",
    severity:       "medium",
    category:       "Reverse Proxy",
    description:    "proxy_http_version is set to 1.0 or not explicitly configured. HTTP/1.0 closes the TCP connection after every request.",
    check:          (c) => {
      if (!/proxy_pass\s+/i.test(c)) return false;
      const val = getDirectiveValue(c, "proxy_http_version");
      return val === null || val === "1.0";
    },
    remediation:    "Set proxy_http_version 1.1 in all proxy location blocks and clear the Connection header to enable keepalive with upstreams.",
    config_fix: `proxy_http_version 1.1;
proxy_set_header   Connection "";`,
    why_it_matters: "With HTTP/1.0, each proxied request requires a complete TCP handshake to the upstream. Under load, the overhead of connection establishment consumes a significant percentage of request latency. More critically, without HTTP/1.1, upstream keepalive is non-functional — NGINX cannot reuse connections regardless of the keepalive setting in the upstream block, defeating the purpose of connection pooling entirely.",
    attack_type:    "Denial of Service Risk / Performance Degradation",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks proxy_http_version value when proxy_pass is present. Flags if missing or set to 1.0.",
    reference:      "CIS NGINX Benchmark v2.1.0 §7.1.1",
  },

  {
    id:             "3.2.2",
    title:          "Upstream block without keepalive",
    severity:       "medium",
    category:       "Reverse Proxy",
    description:    "An upstream{} block exists without a keepalive directive. NGINX opens a new TCP connection per proxied request.",
    check:          (c) => {
      const hasUpstream = /^\s*upstream\s+\w+\s*\{/im.test(c);
      if (!hasUpstream) return false;
      return !/keepalive\s+\d+/i.test(c);
    },
    remediation:    "Add keepalive to upstream block. Pair with proxy_http_version 1.1 and proxy_set_header Connection empty string.",
    config_fix: `upstream backend {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}`,
    why_it_matters: "Without upstream keepalive, each request creates and destroys a TCP connection to the backend. Under sustained load (hundreds of req/s), the Linux kernel's ephemeral port range (typically ~28,000 ports) exhausts. New connections then fail with EADDRINUSE or ETIMEDOUT, producing 502 Bad Gateway responses. This is a latent production incident that only manifests during traffic spikes — exactly when you can least afford it.",
    attack_type:    "Denial of Service Risk / Resource Exhaustion",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Detects upstream block without keepalive directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §7.1.2",
  },

  {
    id:             "3.2.3",
    title:          "Required proxy headers not forwarded",
    severity:       "medium",
    category:       "Reverse Proxy",
    description:    "proxy_pass is present but X-Forwarded-For or X-Forwarded-Proto headers are not forwarded to the upstream.",
    check:          (c) => {
      if (!/proxy_pass\s+/i.test(c)) return false;
      return !(/proxy_set_header\s+X-Forwarded-For\s+/i.test(c)) ||
             !(/proxy_set_header\s+X-Forwarded-Proto\s+/i.test(c));
    },
    remediation:    "Add all standard proxy headers to every proxy location block.",
    config_fix: `proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;`,
    why_it_matters: "Without X-Forwarded-For, the backend application sees 127.0.0.1 for every request. All IP-based security controls — rate limiting, geo-blocking, fraud detection, audit logging — silently receive the proxy address instead of the real client. Without X-Forwarded-Proto, the backend cannot distinguish HTTP from HTTPS requests, causing HTTPS-aware redirect loops, insecure cookie generation (missing Secure flag), and CSRF token mismatches.",
    attack_type:    "Security Control Bypass / IP Spoofing Risk",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks for X-Forwarded-For and X-Forwarded-Proto proxy_set_header directives when proxy_pass is present.",
    reference:      "CIS NGINX Benchmark v2.1.0 §7.1.3",
  },

  // ══ LOW ═══════════════════════════════════════════════════════════════════

  {
    id:             "4.1.1",
    title:          "No rate limiting configured",
    severity:       "low",
    category:       "Access Control",
    description:    "No limit_req_zone or limit_req directives detected. All endpoints accept unlimited requests per client.",
    check:          (c) => !hasDirective(c, "limit_req_zone") && !hasDirective(c, "limit_req"),
    remediation:    "Define a rate limit zone in http{} and apply it to authentication and API endpoints. Use burst to allow short spikes without dropping legitimate requests.",
    config_fix: `# In http{} block:
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# In location:
location /api/ {
    limit_req zone=api burst=20 nodelay;
}`,
    why_it_matters: "Without rate limiting, your login endpoint accepts 10,000+ password attempts per minute from a single IP. Modern credential stuffing tools like Sentry MBA and OpenBullet can test entire breach databases against unprotected login forms. Password reset endpoints with no rate limit enable account takeover of any user via email token enumeration. A $5/month VPS can sustain 50+ req/s indefinitely.",
    attack_type:    "Brute Force / Credential Stuffing / DoS",
    owasp_mapping:  "A07 Identification and Authentication Failures",
    confidence:     "high",
    detection_logic: "Checks for complete absence of limit_req_zone and limit_req directives.",
    reference:      "CIS NGINX Benchmark v2.1.0 §8.1.1",
  },

  {
    id:             "4.1.2",
    title:          "Gzip compression not enabled",
    severity:       "low",
    category:       "Performance",
    description:    "No gzip or brotli compression directive found. All text responses are served uncompressed.",
    check:          (c) => !hasDirective(c, "gzip") && !/brotli\s+on/i.test(c),
    remediation:    "Enable gzip in the http block. Set gzip_types to cover text-based content and gzip_min_length to avoid compressing already-small responses.",
    config_fix: `gzip            on;
gzip_vary       on;
gzip_min_length 1024;
gzip_types      text/plain text/css application/json application/javascript
                text/xml application/xml image/svg+xml;`,
    why_it_matters: "Uncompressed JavaScript bundles average 300–800KB. With gzip, the same files compress to 60–150KB — a 5–8x reduction. For mobile users on constrained connections, uncompressed responses directly increase page load time and data costs. At scale, the bandwidth cost of uncompressed responses is a significant infrastructure expense. This is not just a performance concern — slow sites have higher abandonment rates and lower conversion.",
    attack_type:    "Performance Degradation / Availability Risk",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks for absence of 'gzip on' or 'brotli on' directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §8.1.2",
  },

  {
    id:             "4.1.3",
    title:          "keepalive_timeout not configured or too low",
    severity:       "low",
    category:       "Performance",
    description:    "keepalive_timeout is absent or below 10 seconds. Clients must re-establish TCP connections frequently.",
    check:          (c) => {
      const val = getDirectiveValue(c, "keepalive_timeout");
      if (!val) return true;
      return parseInt(val) < 10;
    },
    remediation:    "Set keepalive_timeout to 15–65 seconds based on your traffic profile. Higher values benefit persistent clients; lower values free resources faster for short-lived sessions.",
    config_fix:     `keepalive_timeout 65;`,
    why_it_matters: "HTTP/1.1 clients expect to reuse TCP connections across multiple requests. With very short or absent keepalive, every resource on a page (CSS, JS, images, fonts, API calls) requires a new TCP handshake — adding 20–100ms of latency per resource depending on RTT. On a page with 20 resources, this can add 400ms–2s of unnecessary latency. This also increases server load from connection establishment overhead.",
    attack_type:    "Performance Degradation",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "medium",
    detection_logic: "Extracts keepalive_timeout value. Flags if absent or integer below 10.",
    reference:      "CIS NGINX Benchmark v2.1.0 §8.1.3",
  },

  {
    id:             "4.1.4",
    title:          "client_max_body_size not configured",
    severity:       "low",
    category:       "Resource Limits",
    description:    "client_max_body_size is not set. Default is 1MB. File upload endpoints silently return 413 for anything larger.",
    check:          (c) => !/client_max_body_size/i.test(c),
    remediation:    "Set client_max_body_size to match your application's maximum upload requirement. Scope tighter limits to specific locations if needed.",
    config_fix:     `client_max_body_size 50M;`,
    why_it_matters: "The 1MB default silently rejects file uploads without reaching the application layer — meaning application-level error handling never fires. Users receive a 413 error that the application cannot customize or log. This is consistently reported as a 'bug' by users during production incidents. Equally problematic: an unusually high limit without scoping can expose the server to upload-based resource exhaustion attacks.",
    attack_type:    "Application Malfunction / Denial of Service Risk",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks for absence of client_max_body_size directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §8.1.4",
  },

  {
    id:             "4.1.5",
    title:          "sendfile not enabled",
    severity:       "low",
    category:       "Performance",
    description:    "sendfile on is not configured. Static file responses copy data through userspace buffers.",
    check:          (c) => !/sendfile\s+on/i.test(c),
    remediation:    "Enable sendfile, tcp_nopush, and tcp_nodelay together for optimal static file performance.",
    config_fix: `sendfile    on;
tcp_nopush  on;
tcp_nodelay on;`,
    why_it_matters: "Without sendfile, the kernel copies file data to userspace memory for NGINX to send, then copies it back to kernel socket buffers. The sendfile syscall bypasses this by transferring data directly from the file descriptor to the socket within the kernel — zero-copy I/O. For static file serving at scale, this reduces CPU utilization significantly and increases throughput. tcp_nopush and tcp_nodelay reduce the number of TCP packets needed for the response.",
    attack_type:    "Performance Degradation",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks for absence of 'sendfile on' directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §8.1.5",
  },

  {
    id:             "4.1.6",
    title:          "Permissions-Policy header not configured",
    severity:       "low",
    category:       "Security Headers",
    description:    "No Permissions-Policy header found. Browser features like camera, microphone, and geolocation are unrestricted.",
    check:          (c) => !hasHeader(c, "Permissions-Policy") && !hasHeader(c, "Feature-Policy"),
    remediation:    "Add Permissions-Policy disabling browser APIs not used by your application.",
    config_fix:     `add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;`,
    why_it_matters: "Without Permissions-Policy, any cross-origin script or iframe on your page can request access to the camera, microphone, or geolocation — prompting the user with a browser permission dialog that appears to come from your site. Malicious third-party scripts (via supply chain attacks, ad injection, or XSS) can silently request these capabilities. This is particularly relevant after supply chain attacks like the Polyfill.io compromise affected hundreds of thousands of sites.",
    attack_type:    "Browser Feature Abuse / Supply Chain Risk",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks for absence of Permissions-Policy or Feature-Policy header.",
    reference:      "W3C Permissions Policy Spec",
  },

  {
    id:             "4.1.7",
    title:          "ssl_session_cache not configured",
    severity:       "low",
    category:       "Transport Security",
    description:    "An HTTPS listener was detected but ssl_session_cache is not configured. Each TLS connection requires a full handshake.",
    check:          (c) => /listen\s+443/i.test(c) && !/ssl_session_cache/i.test(c),
    remediation:    "Configure a shared TLS session cache to allow session resumption for returning clients.",
    config_fix: `ssl_session_cache   shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;`,
    why_it_matters: "A full TLS 1.2 handshake adds 1–2 RTT of latency before the first HTTP request. For mobile users with 100–200ms RTT, this is 200–400ms of overhead on every new connection. TLS session caching allows resumption with a single RTT. At scale, the CPU cost of RSA key operations without session reuse becomes significant. Setting ssl_session_tickets off forces use of server-side cache, which can be invalidated on key rotation.",
    attack_type:    "Performance Degradation",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "medium",
    detection_logic: "Checks for HTTPS listener without ssl_session_cache directive.",
    reference:      "CIS NGINX Benchmark v2.1.0 §4.1.6",
  },
];