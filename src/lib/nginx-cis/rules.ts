// lib/nginx-cis/rules.ts
// NGINX hardening rules — v4
// Rules run on the AST from the NGINX Config Analyzer parser, so comments are
// ignored, directive values are compared exactly, and NGINX inheritance
// (add_header, proxy_set_header, ssl_*) is respected.
//
// framework "cis": topic is covered by the CIS NGINX Benchmark.
// framework "best-practice": common operational hardening, not a CIS item.

import type { NginxBlock, NginxDirective, ParseResult } from "../../app/tools/nginx-config-analyzer/v2/types.ts";
import {
  getServerBlocks, getDirectives, getAllDirectivesDeep, getBlocksOfType,
  getEffectiveArrayDirectives, getEffectiveHeaders, headerName, hasHeader,
  hasCspFrameAncestors, findInheritedDirective, isReturnOnlyServer, isHttpsServer,
  isFullConfig, findUsedUpstream,
} from "../../app/tools/nginx-config-analyzer/v2/parser.ts";
import { directivesInScope, allBlocks, locationMatch } from "../../app/tools/nginx-config-analyzer/v2/rules.ts";

export type Severity   = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type Framework  = "cis" | "best-practice";
export type RuleStatus = "pass" | "fail" | "n/a";

/** A config line a result points at */
export interface SourceRef {
  line:  number;
  label: string;
}

export interface RuleOutcome {
  status:    RuleStatus;
  refs?:     SourceRef[];
  evidence?: string;
}

export interface ScanContext {
  ast:      ParseResult;
  root:     NginxBlock;
  /** Has http/events — a full nginx.conf rather than a conf.d snippet */
  full:     boolean;
  servers:  NginxBlock[];
  /** Servers that serve content (not a server-level return/redirect) */
  content:  NginxBlock[];
  https:    NginxBlock[];
  /** Blocks (server/location/if) with their own proxy_pass */
  proxies:  NginxBlock[];
}

export interface CISRule {
  id:              string;
  title:           string;
  severity:        Severity;
  category:        string;
  framework:       Framework;
  description:     string;
  check:           (ctx: ScanContext) => RuleOutcome;
  remediation:     string;
  config_fix:      string;
  why_it_matters:  string;
  attack_type:     string;
  owasp_mapping:   string;
  confidence:      Confidence;
  detection_logic: string;
  reference:       string;
}

export interface CISResult {
  rule:      CISRule;
  status:    RuleStatus;
  /** true for pass and n/a — kept for callers that only care about failures */
  passed:    boolean;
  refs:      SourceRef[];
  evidence?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS: RuleOutcome = { status: "pass" };
const NA:   RuleOutcome = { status: "n/a" };

function ref(at: NginxDirective | NginxBlock, label?: string): SourceRef {
  if ("contextLabel" in at) return { line: at.line, label: label ?? at.contextLabel };
  return { line: at.line, label: label ?? `${at.name} ${at.rawValue}`.trim() };
}

function fail(refs: SourceRef[], evidence?: string): RuleOutcome {
  return { status: "fail", refs, evidence };
}

function value(d: NginxDirective | null): string {
  return d?.rawValue.trim().toLowerCase() ?? "";
}

/** Where a directive applies to a server: inside it, or inherited from http/main */
function effective(server: NginxBlock, name: string): NginxDirective | null {
  return findInheritedDirective(server, name);
}

/** Blocks that hold settings for the whole http context (http, or root for snippets) */
function httpScopes(ctx: ScanContext): NginxBlock[] {
  const http = getBlocksOfType(ctx.root, "http");
  return http.length ? http : [ctx.root];
}

export function buildContext(ast: ParseResult): ScanContext {
  const servers = getServerBlocks(ast.root);
  const content = servers.filter((s) => !isReturnOnlyServer(s));
  return {
    ast,
    root:    ast.root,
    full:    isFullConfig(ast.root),
    servers,
    content,
    https:   servers.filter(isHttpsServer),
    proxies: content.flatMap((s) => allBlocks(s).filter((b) => getDirectives(b, "proxy_pass").length > 0)),
  };
}

function missingHeaderRule(header: string, extraOk?: (server: NginxBlock) => boolean) {
  return (ctx: ScanContext): RuleOutcome => {
    if (ctx.content.length === 0) return NA;
    const missing = ctx.content.filter((s) => !hasHeader(getEffectiveHeaders(s), header) && !(extraOk?.(s)));
    return missing.length ? fail(missing.map((s) => ref(s))) : PASS;
  };
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export const CIS_RULES: CISRule[] = [

  // ══ Information disclosure ════════════════════════════════════════════════

  {
    id: "DISC-1",
    title: "NGINX version disclosed (server_tokens not off)",
    severity: "medium",
    category: "Information Disclosure",
    framework: "cis",
    description: "server_tokens is on or not set. NGINX adds its version to the Server header and to default error pages.",
    check: (ctx) => {
      const scopes = ctx.servers.length ? ctx.servers : httpScopes(ctx);
      if (scopes.length === 0 || ctx.root.directives.length === 0) return NA;
      const bad = scopes.filter((s) => value(effective(s, "server_tokens")) !== "off");
      return bad.length
        ? fail(bad.map((s) => { const d = effective(s, "server_tokens"); return d ? ref(d) : ref(s); }))
        : PASS;
    },
    remediation: "Set server_tokens off in the http{} block.",
    config_fix: "server_tokens off;",
    why_it_matters: "The exact version lets anyone match your server against published CVEs without probing it. Internet scanners record the Server header for every host they see.",
    attack_type: "Reconnaissance / Fingerprinting",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Resolves server_tokens for each server block (own value or inherited from http/main). The NGINX default is on.",
    reference: "CIS NGINX Benchmark — server_tokens off",
  },

  {
    id: "DISC-2",
    title: "Directory listing enabled (autoindex on)",
    severity: "high",
    category: "Information Disclosure",
    framework: "best-practice",
    description: "autoindex on is set. Directories without an index file list their contents to anyone.",
    check: (ctx) => {
      const on = getAllDirectivesDeep(ctx.root, "autoindex").filter((d) => value(d) === "on");
      return on.length ? fail(on.map((d) => ref(d))) : PASS;
    },
    remediation: "Remove autoindex on, or limit it to the one location that needs it and protect that location.",
    config_fix: "autoindex off;",
    why_it_matters: "Listings expose backup files, database dumps and config files that were never linked from the site.",
    attack_type: "Information Disclosure",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Finds autoindex directives set to on (comments are ignored).",
    reference: "NGINX ngx_http_autoindex_module",
  },

  {
    id: "DISC-3",
    title: "Hidden files not blocked (.git, .env, .htaccess)",
    severity: "high",
    category: "Information Disclosure",
    framework: "cis",
    description: "A server reads files from disk but no location denies paths that start with a dot.",
    check: (ctx) => {
      const fileServers = ctx.content.filter((s) =>
        ["root", "alias", "try_files", "fastcgi_pass", "autoindex"].some((n) => directivesInScope(s, n).length > 0));
      if (fileServers.length === 0) return NA;
      const unprotected = fileServers.filter((s) => !getBlocksOfType(s, "location").some((loc) => {
        const { modifier, path } = locationMatch(loc);
        const blocksDotfiles =
          /\.(git|env|htaccess|htpasswd|svn|ds_store)/i.test(path) ||
          ((modifier === "~" || modifier === "~*") && /\/\\\./.test(path));
        const denies =
          getDirectives(loc, "deny").some((d) => value(d) === "all") ||
          getDirectives(loc, "return").some((d) => /^(403|404|444)$/.test(d.values[0] ?? ""));
        return blocksDotfiles && denies;
      }));
      return unprotected.length ? fail(unprotected.map((s) => ref(s))) : PASS;
    },
    remediation: "Deny every path segment that starts with a dot, except .well-known (used for ACME certificate validation).",
    config_fix: `location ~ /\\.(?!well-known) {
    deny all;
    return 404;
}`,
    why_it_matters: "A reachable .git directory gives away the full source history, and .env files usually hold database passwords and API keys. Scanners request these paths on every new host.",
    attack_type: "Credential Exposure / Source Code Disclosure",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "medium",
    detection_logic: "For servers that serve files (root, alias, try_files, fastcgi_pass), looks for a regex location matching /\\. or a named dotfile that denies or returns 403/404/444. Pure proxy servers are not applicable.",
    reference: "CIS NGINX Benchmark — hidden file serving disabled",
  },

  {
    id: "DISC-4",
    title: "Backend X-Powered-By header passed through",
    severity: "low",
    category: "Information Disclosure",
    framework: "cis",
    description: "Proxied responses keep the backend's X-Powered-By header, which names the framework and often its version.",
    check: (ctx) => {
      if (ctx.proxies.length === 0) return NA;
      const bad = ctx.proxies.filter((b) =>
        !getEffectiveArrayDirectives(b, "proxy_hide_header").some((d) => headerName(d) === "x-powered-by"));
      return bad.length ? fail(bad.map((b) => ref(getDirectives(b, "proxy_pass")[0]))) : PASS;
    },
    remediation: "Hide backend identification headers at the http or server level.",
    config_fix: "proxy_hide_header X-Powered-By;",
    why_it_matters: "Headers like X-Powered-By: Express or PHP/8.1 tell an attacker which framework and version to target.",
    attack_type: "Reconnaissance / Fingerprinting",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "For each block with proxy_pass, checks the effective proxy_hide_header list (with NGINX inheritance) for X-Powered-By.",
    reference: "CIS NGINX Benchmark — hide proxied backend headers",
  },

  // ══ Transport security ════════════════════════════════════════════════════

  {
    id: "TLS-1",
    title: "No HTTPS listener configured",
    severity: "high",
    category: "Transport Security",
    framework: "cis",
    description: "No server block listens with ssl. All traffic is plain HTTP.",
    check: (ctx) => {
      if (ctx.servers.length === 0) return NA;
      return ctx.https.length ? PASS : fail(ctx.servers.map((s) => ref(s)));
    },
    remediation: "Add a TLS server block. Let's Encrypt (certbot) issues free certificates.",
    config_fix: `server {
    listen 443 ssl;
    http2 on;
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
}`,
    why_it_matters: "Plain HTTP exposes credentials, cookies and API tokens to anyone on the network path, and lets them modify responses.",
    attack_type: "Credential Interception / Content Injection",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Looks for a listen directive with the ssl or quic parameter, or on port 443.",
    reference: "CIS NGINX Benchmark — TLS configuration",
  },

  {
    id: "TLS-2",
    title: "HTTP not redirected to HTTPS",
    severity: "medium",
    category: "Transport Security",
    framework: "cis",
    description: "HTTPS is configured, but a plain-HTTP server serves content instead of redirecting.",
    check: (ctx) => {
      if (ctx.https.length === 0) return NA;
      const plain = ctx.servers.filter((s) => !isHttpsServer(s));
      if (plain.length === 0) return PASS;
      const bad = plain.filter((s) => !getDirectives(s, "return").some((d) =>
        /^30[1278]$/.test(d.values[0] ?? "") && /https:\/\//.test(d.rawValue)));
      return bad.length ? fail(bad.map((s) => ref(s))) : PASS;
    },
    remediation: "Answer every plain-HTTP request with a permanent redirect to HTTPS.",
    config_fix: `server {
    listen 80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}`,
    why_it_matters: "Users who type the domain or follow an old http:// link stay on plain HTTP unless the server redirects them.",
    attack_type: "SSL Stripping / MITM",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "When an HTTPS server exists, each non-TLS server must have a server-level return 301/302/307/308 to an https:// URL.",
    reference: "CIS NGINX Benchmark — HTTP redirected to HTTPS",
  },

  {
    id: "TLS-3",
    title: "Legacy SSL/TLS versions enabled",
    severity: "high",
    category: "Transport Security",
    framework: "cis",
    description: "ssl_protocols enables SSLv3, TLSv1 or TLSv1.1.",
    check: (ctx) => {
      if (ctx.https.length === 0) return NA;
      const bad = ctx.https.flatMap((s) => directivesInScope(s, "ssl_protocols"))
        .filter((d) => d.values.some((v) => ["sslv2", "sslv3", "tlsv1", "tlsv1.1"].includes(v.toLowerCase())));
      return bad.length ? fail([...new Map(bad.map((d) => [d.line, ref(d)])).values()]) : PASS;
    },
    remediation: "Allow only TLS 1.2 and 1.3.",
    config_fix: "ssl_protocols TLSv1.2 TLSv1.3;",
    why_it_matters: "TLS 1.0 and 1.1 are deprecated by RFC 8996 and lack modern AEAD cipher suites. Keeping them allows downgrade attacks for no real compatibility gain.",
    attack_type: "Protocol Downgrade / MITM",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Compares each ssl_protocols value token exactly (TLSv1.2 is not treated as TLSv1).",
    reference: "CIS NGINX Benchmark — only modern TLS protocols / RFC 8996",
  },

  {
    id: "TLS-4",
    title: "Weak cipher suites enabled",
    severity: "high",
    category: "Transport Security",
    framework: "cis",
    description: "ssl_ciphers enables RC4, DES/3DES, NULL, EXPORT, anonymous or MD5 suites.",
    check: (ctx) => {
      if (ctx.https.length === 0) return NA;
      const bad = ctx.https.flatMap((s) => directivesInScope(s, "ssl_ciphers")).filter((d) => {
        const enabled = d.rawValue.replace(/["']/g, "").toUpperCase().split(":")
          .filter((c) => c && !c.startsWith("!") && !c.startsWith("-"));
        return enabled.some((c) => /RC4|(^|-)DES|3DES|NULL|EXPORT|ANON|MD5|ADH|AECDH/.test(c));
      });
      return bad.length ? fail([...new Map(bad.map((d) => [d.line, ref(d)])).values()]) : PASS;
    },
    remediation: "Use the Mozilla Intermediate cipher list and let clients pick the order.",
    config_fix: `ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;`,
    why_it_matters: "RC4 and 3DES have practical attacks (RC4 biases, Sweet32), and NULL or anonymous suites give no encryption or no authentication.",
    attack_type: "Cryptographic Attack",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Splits ssl_ciphers on ':' and checks only enabled entries; entries excluded with ! or - are ignored.",
    reference: "CIS NGINX Benchmark — weak ciphers disabled / Mozilla SSL Configuration Generator",
  },

  {
    id: "TLS-5",
    title: "Missing HSTS header on HTTPS server",
    severity: "high",
    category: "Transport Security",
    framework: "cis",
    description: "An HTTPS server sends no Strict-Transport-Security header.",
    check: (ctx) => {
      const servers = ctx.https.filter((s) => !isReturnOnlyServer(s));
      if (servers.length === 0) return NA;
      const bad = servers.filter((s) => !hasHeader(getEffectiveHeaders(s), "strict-transport-security"));
      return bad.length ? fail(bad.map((s) => ref(s))) : PASS;
    },
    remediation: "Send HSTS with max-age of at least one year from every HTTPS server. Add includeSubDomains once every subdomain serves HTTPS.",
    config_fix: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
    why_it_matters: "Without HSTS, the first request to the site can go over HTTP, which is the window SSL stripping uses.",
    attack_type: "SSL Stripping / MITM",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Checks the effective add_header list of each HTTPS content server, following NGINX inheritance.",
    reference: "CIS NGINX Benchmark — HSTS / RFC 6797",
  },

  {
    id: "TLS-6",
    title: "TLS session tickets enabled",
    severity: "low",
    category: "Transport Security",
    framework: "cis",
    description: "ssl_session_tickets is on (the default). Ticket keys that are not rotated weaken forward secrecy.",
    check: (ctx) => {
      if (ctx.https.length === 0) return NA;
      const bad = ctx.https.filter((s) => value(directivesInScope(s, "ssl_session_tickets")[0] ?? null) !== "off");
      return bad.length ? fail(bad.map((s) => ref(s))) : PASS;
    },
    remediation: "Disable session tickets and use a shared server-side session cache for resumption instead.",
    config_fix: `ssl_session_tickets off;
ssl_session_cache   shared:SSL:10m;
ssl_session_timeout 1d;`,
    why_it_matters: "NGINX does not rotate ticket keys by itself. Anyone who obtains the key can decrypt every recorded session that used it until the process restarts.",
    attack_type: "Forward Secrecy Weakening",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Resolves ssl_session_tickets for each HTTPS server; NGINX defaults to on.",
    reference: "CIS NGINX Benchmark — session resumption",
  },

  // ══ Security headers ══════════════════════════════════════════════════════

  {
    id: "HDR-1",
    title: "Missing X-Frame-Options or CSP frame-ancestors",
    severity: "medium",
    category: "Security Headers",
    framework: "cis",
    description: "Responses can be embedded in an iframe on any site.",
    check: missingHeaderRule("x-frame-options", (s) => hasCspFrameAncestors(getEffectiveHeaders(s))),
    remediation: "Send X-Frame-Options SAMEORIGIN, or a CSP with frame-ancestors.",
    config_fix: `add_header X-Frame-Options "SAMEORIGIN" always;`,
    why_it_matters: "Clickjacking overlays your page in an invisible frame so users click buttons they cannot see.",
    attack_type: "Clickjacking",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks the effective add_header list of each content server for X-Frame-Options or a CSP containing frame-ancestors.",
    reference: "CIS NGINX Benchmark — X-Frame-Options",
  },

  {
    id: "HDR-2",
    title: "Missing X-Content-Type-Options: nosniff",
    severity: "medium",
    category: "Security Headers",
    framework: "cis",
    description: "Browsers may guess content types instead of trusting Content-Type.",
    check: missingHeaderRule("x-content-type-options"),
    remediation: "Send X-Content-Type-Options nosniff on every response.",
    config_fix: `add_header X-Content-Type-Options "nosniff" always;`,
    why_it_matters: "If users can upload files, MIME sniffing can turn an uploaded 'image' into executable script.",
    attack_type: "MIME-Sniffing XSS",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks the effective add_header list of each content server.",
    reference: "CIS NGINX Benchmark — X-Content-Type-Options",
  },

  {
    id: "HDR-3",
    title: "Missing Content-Security-Policy",
    severity: "medium",
    category: "Security Headers",
    framework: "cis",
    description: "No Content-Security-Policy is sent, so the browser runs scripts from any source.",
    check: missingHeaderRule("content-security-policy", (s) => hasHeader(getEffectiveHeaders(s), "content-security-policy-report-only")),
    remediation: "Start with Content-Security-Policy-Report-Only, review the reports, then enforce.",
    config_fix: `add_header Content-Security-Policy "default-src 'self'; object-src 'none'; base-uri 'self'" always;`,
    why_it_matters: "CSP limits what an XSS bug can do: injected inline scripts and scripts from other hosts are blocked.",
    attack_type: "Cross-Site Scripting",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks the effective add_header list of each content server; Report-Only also counts.",
    reference: "CIS NGINX Benchmark — Content-Security-Policy",
  },

  {
    id: "HDR-4",
    title: "Missing Referrer-Policy",
    severity: "low",
    category: "Security Headers",
    framework: "cis",
    description: "No Referrer-Policy is sent. Browsers default to strict-origin-when-cross-origin, but older ones send the full URL.",
    check: missingHeaderRule("referrer-policy"),
    remediation: "Set Referrer-Policy explicitly.",
    config_fix: `add_header Referrer-Policy "strict-origin-when-cross-origin" always;`,
    why_it_matters: "URLs with tokens or IDs in the query string can leak to third-party sites through the Referer header.",
    attack_type: "Information Leakage",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks the effective add_header list of each content server.",
    reference: "CIS NGINX Benchmark — Referrer-Policy",
  },

  {
    id: "HDR-5",
    title: "Missing Permissions-Policy",
    severity: "low",
    category: "Security Headers",
    framework: "best-practice",
    description: "No Permissions-Policy is sent, so embedded content can request camera, microphone or location access.",
    check: missingHeaderRule("permissions-policy"),
    remediation: "Disable browser features the site does not use.",
    config_fix: `add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;`,
    why_it_matters: "A compromised third-party script or iframe cannot prompt for features that the policy disables.",
    attack_type: "Browser Feature Abuse",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks the effective add_header list of each content server.",
    reference: "W3C Permissions Policy",
  },

  {
    id: "HDR-6",
    title: "add_header in a location drops inherited security headers",
    severity: "high",
    category: "Security Headers",
    framework: "best-practice",
    description: "A server or location sets its own add_header, so security headers from the parent level are no longer sent for it.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      const security = ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"];
      const refs: SourceRef[] = [];
      for (const s of ctx.content) {
        for (const b of allBlocks(s)) {
          if (!b.parent || (b.contextType !== "server" && b.contextType !== "location")) continue;
          const own = getDirectives(b, "add_header");
          if (own.length === 0) continue;
          const lost = [...new Set(getEffectiveHeaders(b.parent).map(headerName)
            .filter((h) => security.includes(h) && !hasHeader(getEffectiveHeaders(b), h)))];
          if (lost.length) refs.push(ref(own[0], `${b.contextLabel}: drops ${lost.join(", ")}`));
        }
      }
      return refs.length ? fail(refs) : PASS;
    },
    remediation: "Repeat the security headers in that block (a shared include file keeps this manageable), or use add_header_inherit merge on NGINX 1.29.3+.",
    config_fix: `# snippets/security-headers.conf, included in every block that has its own add_header
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;`,
    why_it_matters: "A single add_header Cache-Control in a location silently removes HSTS and CSP for everything that location serves. The config looks hardened, but the responses are not.",
    attack_type: "Security Control Bypass",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Compares each block's effective add_header list with its parent's, using NGINX inheritance (a level inherits only if it declares none).",
    reference: "NGINX ngx_http_headers_module — add_header inheritance",
  },

  // ══ Request limits & access control ═══════════════════════════════════════

  {
    id: "ACC-1",
    title: "No request rate limiting",
    severity: "low",
    category: "Request Limits",
    framework: "cis",
    description: "No limit_req is applied anywhere, so every endpoint accepts unlimited requests per client.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      return getAllDirectivesDeep(ctx.root, "limit_req").length ? PASS : fail(ctx.content.map((s) => ref(s)));
    },
    remediation: "Define a zone in http{} and apply limit_req to login, API and other expensive endpoints.",
    config_fix: `# http {}
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# location
limit_req zone=api burst=20 nodelay;
limit_req_status 429;`,
    why_it_matters: "Login and password-reset endpoints without a limit allow brute force and credential stuffing at full line rate.",
    attack_type: "Brute Force / DoS",
    owasp_mapping: "A07 Identification and Authentication Failures",
    confidence: "high",
    detection_logic: "Looks for any limit_req directive.",
    reference: "CIS NGINX Benchmark — limit_req",
  },

  {
    id: "ACC-2",
    title: "No per-client connection limit",
    severity: "low",
    category: "Request Limits",
    framework: "cis",
    description: "No limit_conn is applied, so one client can hold an unlimited number of connections.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      return getAllDirectivesDeep(ctx.root, "limit_conn").length ? PASS : fail(ctx.content.map((s) => ref(s)));
    },
    remediation: "Define a connection zone in http{} and apply a per-IP limit.",
    config_fix: `# http {}
limit_conn_zone $binary_remote_addr zone=perip:10m;

# server {}
limit_conn perip 20;`,
    why_it_matters: "Slow clients that open many connections can use up worker_connections and starve real users.",
    attack_type: "Resource Exhaustion",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Looks for any limit_conn directive.",
    reference: "CIS NGINX Benchmark — limit_conn",
  },

  {
    id: "ACC-3",
    title: "Client timeouts left at the 60s default",
    severity: "low",
    category: "Request Limits",
    framework: "cis",
    description: "client_body_timeout and client_header_timeout are not lowered from 60 seconds.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      const bad = ctx.content.filter((s) => ["client_body_timeout", "client_header_timeout"].some((n) => {
        const d = directivesInScope(s, n)[0];
        return !d || parseInt(d.values[0] ?? "", 10) > 30;
      }));
      return bad.length ? fail(bad.map((s) => ref(s))) : PASS;
    },
    remediation: "Lower both timeouts so slow or stalled clients are dropped sooner.",
    config_fix: `client_body_timeout   10s;
client_header_timeout 10s;`,
    why_it_matters: "Slowloris-style attacks keep many connections open by sending headers or body bytes very slowly. Long timeouts make that cheap.",
    attack_type: "Slow HTTP DoS",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "medium",
    detection_logic: "Resolves both directives per content server; fails if missing or above 30s.",
    reference: "CIS NGINX Benchmark — timeouts",
  },

  {
    id: "ACC-4",
    title: "client_max_body_size not set",
    severity: "low",
    category: "Request Limits",
    framework: "cis",
    description: "Request body size relies on the 1 MB default instead of a value chosen for the application.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      const bad = ctx.content.filter((s) => directivesInScope(s, "client_max_body_size").length === 0);
      return bad.length ? fail(bad.map((s) => ref(s))) : PASS;
    },
    remediation: "Set client_max_body_size to what the application accepts; raise it only on upload locations.",
    config_fix: `client_max_body_size 1m;

location /upload/ {
    client_max_body_size 50m;
}`,
    why_it_matters: "An explicit limit documents the intended maximum and keeps large uploads confined to the endpoints that need them.",
    attack_type: "Resource Exhaustion",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks for client_max_body_size in each content server or inherited from http.",
    reference: "CIS NGINX Benchmark — client_max_body_size",
  },

  {
    id: "ACC-5",
    title: "HTTP methods not restricted",
    severity: "low",
    category: "Access Control",
    framework: "cis",
    description: "No server limits which HTTP methods it accepts.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      const restricted = (s: NginxBlock) =>
        getBlocksOfType(s, "limit_except").length > 0 ||
        getBlocksOfType(s, "if").some((b) => /\$request_method/.test(b.contextLabel) &&
          getDirectives(b, "return").some((d) => /^(403|405|444)$/.test(d.values[0] ?? "")));
      const bad = ctx.content.filter((s) => !restricted(s));
      return bad.length ? fail(bad.map((s) => ref(s))) : PASS;
    },
    remediation: "Reject methods the application does not use (TRACE, CONNECT, and often PUT/DELETE on static sites).",
    config_fix: `if ($request_method !~ ^(GET|HEAD|POST)$) {
    return 405;
}`,
    why_it_matters: "Unused methods widen the attack surface of the backend and of any module that handles them.",
    attack_type: "Attack Surface",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "medium",
    detection_logic: "Looks for limit_except, or an if on $request_method that returns 403/405/444, in each content server.",
    reference: "CIS NGINX Benchmark — approved HTTP methods",
  },

  // ══ Logging ═══════════════════════════════════════════════════════════════

  {
    id: "LOG-1",
    title: "Access logging disabled or not configured",
    severity: "low",
    category: "Logging",
    framework: "cis",
    description: "access_log is off for a server, or (in a full nginx.conf) never configured.",
    check: (ctx) => {
      if (ctx.content.length === 0) return NA;
      const off = ctx.content.filter((s) => value(effective(s, "access_log")) === "off");
      if (off.length) return fail(off.map((s) => ref(effective(s, "access_log")!)));
      if (ctx.full && getAllDirectivesDeep(ctx.root, "access_log").length === 0) return fail([ref(ctx.root, "http {}")]);
      return PASS;
    },
    remediation: "Log every server to a file that is collected, with a format that includes timing.",
    config_fix: `log_format main '$remote_addr [$time_local] "$request" $status rt=$request_time urt=$upstream_response_time';
access_log /var/log/nginx/access.log main;`,
    why_it_matters: "Without access logs there is no record to investigate an incident or abuse.",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "high",
    detection_logic: "Fails if the effective access_log of a content server is off, or if a full config has none at all.",
    reference: "CIS NGINX Benchmark — access logging",
  },

  {
    id: "LOG-2",
    title: "error_log not configured",
    severity: "low",
    category: "Logging",
    framework: "cis",
    description: "No error_log directive in a full nginx.conf.",
    check: (ctx) => {
      if (!ctx.full) return NA;
      return getAllDirectivesDeep(ctx.root, "error_log").length ? PASS : fail([{ line: 1, label: "main context" }]);
    },
    remediation: "Set error_log explicitly at notice or info level.",
    config_fix: "error_log /var/log/nginx/error.log notice;",
    why_it_matters: "Errors go to the compiled-in path otherwise, which may not be collected (especially in containers).",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "high",
    detection_logic: "Looks for any error_log directive when the input is a full nginx.conf.",
    reference: "CIS NGINX Benchmark — error logging",
  },

  // ══ Reverse proxy (best practice) ═════════════════════════════════════════

  {
    id: "PROXY-1",
    title: "Client IP and scheme not forwarded to the backend",
    severity: "medium",
    category: "Reverse Proxy",
    framework: "best-practice",
    description: "A proxied location does not send X-Forwarded-For (or X-Real-IP) and X-Forwarded-Proto.",
    check: (ctx) => {
      if (ctx.proxies.length === 0) return NA;
      const refs: SourceRef[] = [];
      for (const b of ctx.proxies) {
        const set = getEffectiveArrayDirectives(b, "proxy_set_header").map(headerName);
        const missing = [
          !set.some((h) => h === "x-forwarded-for" || h === "x-real-ip") && "X-Forwarded-For",
          !set.some((h) => h === "x-forwarded-proto" || h === "forwarded") && "X-Forwarded-Proto",
        ].filter(Boolean);
        if (missing.length) refs.push(ref(getDirectives(b, "proxy_pass")[0], `${b.contextLabel}: missing ${missing.join(", ")}`));
      }
      return refs.length ? fail(refs) : PASS;
    },
    remediation: "Set the forwarding headers at server level. A location with its own proxy_set_header must repeat them.",
    config_fix: `proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;`,
    why_it_matters: "The backend otherwise logs and rate-limits on the proxy's address, and cannot tell HTTPS from HTTP when building redirects and Secure cookies.",
    attack_type: "Security Control Bypass",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Checks the effective proxy_set_header list (with NGINX inheritance) of every block that has proxy_pass.",
    reference: "NGINX ngx_http_proxy_module — proxy_set_header",
  },

  {
    id: "PROXY-2",
    title: "Upstream keepalive set but proxy uses HTTP/1.0",
    severity: "low",
    category: "Reverse Proxy",
    framework: "best-practice",
    description: "An upstream has keepalive, but a location proxying to it does not set proxy_http_version 1.1 and an empty Connection header.",
    check: (ctx) => {
      const users = ctx.proxies.filter((b) => {
        const u = findUsedUpstream(ctx.root, getDirectives(b, "proxy_pass")[0].rawValue);
        return u && getDirectives(u, "keepalive").length > 0;
      });
      if (users.length === 0) return NA;
      const bad = users.filter((b) =>
        value(findInheritedDirective(b, "proxy_http_version")) !== "1.1" ||
        !getEffectiveArrayDirectives(b, "proxy_set_header").some((d) => headerName(d) === "connection"));
      return bad.length ? fail(bad.map((b) => ref(getDirectives(b, "proxy_pass")[0]))) : PASS;
    },
    remediation: "Use HTTP/1.1 and clear the Connection header so upstream connections can be reused.",
    config_fix: `proxy_http_version 1.1;
proxy_set_header   Connection "";`,
    why_it_matters: "With HTTP/1.0 every request opens a new upstream connection, so the keepalive pool is never used and ephemeral ports can run out under load.",
    attack_type: "Availability Risk",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Only applies to locations whose proxy_pass targets an upstream{} with keepalive.",
    reference: "NGINX ngx_http_upstream_module — keepalive",
  },

  // ══ Performance (best practice) ═══════════════════════════════════════════

  {
    id: "PERF-1",
    title: "Response compression not enabled",
    severity: "low",
    category: "Performance",
    framework: "best-practice",
    description: "gzip (or brotli) is not turned on for the http context.",
    check: (ctx) => {
      if (!ctx.full) return NA;
      const http = getBlocksOfType(ctx.root, "http");
      const bad = http.filter((h) => ![...getDirectives(h, "gzip"), ...getAllDirectivesDeep(h, "brotli")].some((d) => value(d) === "on"));
      return bad.length ? fail(bad.map((h) => ref(h, "http {}"))) : PASS;
    },
    remediation: "Enable gzip for text responses in http{}.",
    config_fix: `gzip            on;
gzip_vary       on;
gzip_min_length 1024;
gzip_types      text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;`,
    why_it_matters: "Text responses shrink several times over with gzip, which cuts transfer time and bandwidth.",
    attack_type: "Performance",
    owasp_mapping: "n/a",
    confidence: "high",
    detection_logic: "Checks that gzip is on (gzip off counts as disabled) in the http block.",
    reference: "NGINX ngx_http_gzip_module",
  },

  {
    id: "PERF-2",
    title: "sendfile not enabled",
    severity: "low",
    category: "Performance",
    framework: "best-practice",
    description: "sendfile is off, so static files are copied through user space.",
    check: (ctx) => {
      if (!ctx.full) return NA;
      const http = getBlocksOfType(ctx.root, "http");
      const bad = http.filter((h) => value(getDirectives(h, "sendfile")[0] ?? null) !== "on");
      return bad.length ? fail(bad.map((h) => ref(h, "http {}"))) : PASS;
    },
    remediation: "Enable sendfile together with tcp_nopush.",
    config_fix: `sendfile   on;
tcp_nopush on;`,
    why_it_matters: "sendfile serves static files with a kernel zero-copy path, which lowers CPU use.",
    attack_type: "Performance",
    owasp_mapping: "n/a",
    confidence: "high",
    detection_logic: "Checks that sendfile is on in the http block.",
    reference: "NGINX ngx_http_core_module — sendfile",
  },
];
