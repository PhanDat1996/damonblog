// rules.ts — scope-aware rule engine

import type { Finding, AnalysisCategory, Severity, Confidence } from "./types.ts";
import type { NginxBlock, NginxDirective, ParseResult } from "./types.ts";
import {
  getBlocksOfType,
  getServerBlocks,
  getChildBlocks,
  getDirectives,
  getDirectiveValue,
  getAllDirectivesDeep,
  getEffectiveHeaders,
  getEffectiveArrayDirectives,
  getDeclaredHeadersInChain,
  headerName,
  hasHeader,
  hasCspFrameAncestors,
  findInheritedDirective,
  isReturnOnlyServer,
  isFullConfig,
  isHttpsServer,
  hasProxyPass,
  getUpstreamBlocks,
  upstreamHasKeepalive,
  findUsedUpstream,
  getListenPorts,
  getServerNames,
} from "./parser.ts";

// ─── RULE TYPE ────────────────────────────────────────────────────────────────

type RuleFn = (ast: ParseResult, findings: Finding[]) => void;

// ─── FINDING BUILDER ─────────────────────────────────────────────────────────

let _findingCounter = 0;

type SourceLocation = Pick<NginxBlock, "file" | "line" | "contextPath">;

/** Point a finding at a specific directive while keeping its block's context path */
function at(block: NginxBlock, d: NginxDirective): SourceLocation {
  return { file: d.file, line: d.line, contextPath: block.contextPath };
}

function finding(
  id: string,
  title: string,
  category: AnalysisCategory,
  severity: Severity,
  confidence: Confidence,
  block: SourceLocation,
  evidence: string,
  whyItMatters: string,
  recommendation: string,
  fixSnippet: string,
  reference: string
): Finding {
  return {
    id: `${id}-${_findingCounter++}`,
    title,
    category,
    severity,
    confidence,
    filename: block.file,
    line: block.line,
    contextPath: block.contextPath,
    evidence,
    whyItMatters,
    recommendation,
    fixSnippet,
    reference,
  };
}

// ─── SHARED HELPERS ──────────────────────────────────────────────────────────

/** Server blocks that actually serve content (not a server-level return/redirect) */
function contentServers(ast: ParseResult): NginxBlock[] {
  return getServerBlocks(ast.root).filter((s) => !isReturnOnlyServer(s));
}

/** Directives set inside the server (any depth) or inherited from http/main */
function directivesInScope(server: NginxBlock, name: string): NginxDirective[] {
  const deep = getAllDirectivesDeep(server, name);
  if (deep.length > 0) return deep;
  const inherited = server.parent ? findInheritedDirective(server.parent, name) : null;
  return inherited ? [inherited] : [];
}

/** All blocks below (and including) `block`, depth-first */
function allBlocks(block: NginxBlock): NginxBlock[] {
  const out: NginxBlock[] = [block];
  for (const d of block.directives) if (d.block) out.push(...allBlocks(d.block));
  return out;
}

/** Location path and modifier from a location block label */
function locationMatch(loc: NginxBlock): { modifier: string; path: string } {
  const parts = loc.contextLabel.replace(/^location\s+/, "").trim().split(/\s+/);
  if (parts.length >= 2 && ["=", "~", "~*", "^~"].includes(parts[0])) return { modifier: parts[0], path: parts.slice(1).join(" ") };
  return { modifier: "", path: parts.join(" ") };
}

/** Host part of a proxy_pass URL, e.g. "http://$arg_x/path" → "$arg_x" */
function proxyPassHost(d: NginxDirective): string {
  const url = (d.values[0] ?? "").replace(/^["']|["']$/g, "");
  // $request_uri, $uri, $is_args... always start the path, so cut the host there
  return url.replace(/^[a-z]+:\/\//i, "").split("/")[0].split(/\$(?=request_uri|uri|document_uri|is_args|args|query_string)/)[0];
}

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

/**
 * True when a header is absent from the effective set AND was never declared up
 * the chain. If it was declared in a parent but dropped by a closer add_header,
 * ruleHeaderInheritance reports it instead.
 */
function headerMissing(server: NginxBlock, name: string): boolean {
  return !hasHeader(getEffectiveHeaders(server), name) && !hasHeader(getDeclaredHeadersInChain(server), name);
}

// ─── SECURITY RULES ──────────────────────────────────────────────────────────

const ruleHsts: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    if (!isHttpsServer(server)) continue;
    if (headerMissing(server, "strict-transport-security")) {
      findings.push(finding(
        "sec-hsts", "Missing HSTS header on HTTPS server",
        "Security", "high", "high", server,
        `Server block at line ${server.line} listens on HTTPS but has no Strict-Transport-Security header.`,
        "Without HSTS, SSL stripping attacks can downgrade HTTPS connections to HTTP even with a valid certificate. Browsers cache HSTS for max-age seconds.",
        'Add inside the HTTPS server block: add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
        `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
        "RFC 6797 — HTTP Strict Transport Security"
      ));
    }
  }
};

const ruleXFrameOptions: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    const declared = getDeclaredHeadersInChain(server);
    if (headerMissing(server, "x-frame-options") && !hasCspFrameAncestors(declared)) {
      findings.push(finding(
        "sec-xfo", "Missing X-Frame-Options or CSP frame-ancestors",
        "Security", "medium", "high", server,
        "No X-Frame-Options or Content-Security-Policy frame-ancestors directive found.",
        "Pages can be embedded in iframes on attacker-controlled sites, enabling clickjacking attacks.",
        'Add: add_header X-Frame-Options "SAMEORIGIN" always;',
        `add_header X-Frame-Options "SAMEORIGIN" always;`,
        "OWASP Clickjacking Defense Cheat Sheet"
      ));
    }
  }
};

const ruleXContentTypeOptions: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    if (headerMissing(server, "x-content-type-options")) {
      findings.push(finding(
        "sec-xcto", "Missing X-Content-Type-Options: nosniff",
        "Security", "medium", "high", server,
        "No X-Content-Type-Options header found.",
        "Without nosniff, browsers may MIME-sniff responses, enabling content injection attacks.",
        'Add: add_header X-Content-Type-Options "nosniff" always;',
        `add_header X-Content-Type-Options "nosniff" always;`,
        "MDN Web Docs — X-Content-Type-Options"
      ));
    }
  }
};

const ruleCsp: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    if (headerMissing(server, "content-security-policy") && headerMissing(server, "content-security-policy-report-only")) {
      findings.push(finding(
        "sec-csp", "Missing Content-Security-Policy header",
        "Security", "medium", "high", server,
        "No Content-Security-Policy header found.",
        "CSP is the primary defense against XSS. Without it, injected scripts execute with full page context.",
        "Start with Content-Security-Policy-Report-Only, observe violations, then enforce.",
        `add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;`,
        "OWASP CSP Cheat Sheet"
      ));
    }
  }
};

const ruleHeaderInheritance: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    for (const block of allBlocks(server)) {
      if (!block.parent || getDirectives(block, "add_header").length === 0) continue;
      if (block.contextType !== "server" && block.contextType !== "location") continue;
      const inherited = getEffectiveHeaders(block.parent).filter((d) => SECURITY_HEADERS.includes(headerName(d)));
      const effective = getEffectiveHeaders(block);
      const lost = [...new Set(inherited.map(headerName).filter((h) => !hasHeader(effective, h)))];
      if (lost.length === 0) continue;
      const own = getDirectives(block, "add_header").map(headerName).join(", ");
      findings.push(finding(
        "sec-header-inheritance", `add_header in ${block.contextType} drops inherited security headers`,
        "Security", lost.some((h) => h === "strict-transport-security" || h === "content-security-policy") ? "high" : "medium", "high", at(block, getDirectives(block, "add_header")[0]),
        `'${block.contextLabel}' (${block.file}:${block.line}) sets its own add_header (${own}), so these headers from the parent level are no longer sent: ${lost.join(", ")}.`,
        "NGINX only inherits add_header from the parent level when the current level declares none. One add_header in a location (for example Cache-Control) silently removes HSTS, CSP and the other security headers for every response from that location.",
        "Repeat the security headers in this block, move them into a shared snippet included at each level, or on NGINX 1.29.3+ use add_header_inherit merge;.",
        `# Option 1: shared snippet\n# /etc/nginx/snippets/security-headers.conf\nadd_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\nadd_header X-Content-Type-Options "nosniff" always;\nadd_header X-Frame-Options "SAMEORIGIN" always;\n\n${block.contextLabel} {\n    include snippets/security-headers.conf;\n    # ...existing add_header lines\n}\n\n# Option 2 (NGINX 1.29.3+):\nadd_header_inherit merge;`,
        "NGINX ngx_http_headers_module — add_header inheritance"
      ));
    }
  }
};

const ruleHeadersWithoutAlways: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    const offending = getEffectiveHeaders(server)
      .filter((d) => SECURITY_HEADERS.includes(headerName(d)) && !d.values.some((v) => v.toLowerCase() === "always"));
    const missingAlways = [...new Set(offending.map(headerName))];
    if (missingAlways.length === 0) continue;
    findings.push(finding(
      "sec-header-always", "Security headers set without 'always'",
      "Security", "low", "high", at(server, offending[0]),
      `Without the always parameter: ${missingAlways.join(", ")}.`,
      "Without always, add_header only applies to 200, 201, 204, 206, 301, 302, 303, 304, 307 and 308 responses. Error pages (4xx/5xx) go out without the headers, which is where reflected content often lands.",
      "Append always to each security add_header.",
      missingAlways.map((h) => `add_header ${h} "..." always;`).join("\n"),
      "NGINX add_header — always parameter"
    ));
  }
};

const ruleServerTokens: RuleFn = (ast, findings) => {
  // Check at http level
  const httpBlocks = getBlocksOfType(ast.root, "http");
  const mainDirs = getDirectives(ast.root, "server_tokens");
  for (const http of httpBlocks) {
    const dirs = getDirectives(http, "server_tokens");
    const allDirs = [...mainDirs, ...dirs];
    if (!allDirs.some((d) => d.rawValue.toLowerCase().trim() === "off")) {
      findings.push(finding(
        "sec-server-tokens", "server_tokens not disabled",
        "Security", "low", "high", http,
        allDirs.length ? `server_tokens set to: ${allDirs.map((d) => d.rawValue).join(", ")}` : "No server_tokens directive found (defaults to on).",
        "NGINX version leaks in every Server response header and error page, helping attackers target CVEs.",
        "Add server_tokens off; in the http{} block.",
        `http {\n    server_tokens off;\n    # ...\n}`,
        "NGINX security hardening best practices"
      ));
    }
  }
};

const ruleLegacyTls: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    for (const d of directivesInScope(server, "ssl_protocols")) {
      const legacy = d.values.filter((v) => ["sslv2", "sslv3", "tlsv1", "tlsv1.1"].includes(v.toLowerCase()));
      if (legacy.length === 0) continue;
      findings.push(finding(
        "sec-legacy-tls", "Legacy TLS/SSL versions enabled",
        "Security", "high", "high", at(server, d),
        `ssl_protocols enables ${legacy.join(", ")} (${d.file}:${d.line}: ${d.rawValue})`,
        "SSLv3, TLS 1.0 and TLS 1.1 are deprecated by RFC 8996 and vulnerable to POODLE, BEAST and downgrade attacks. They also fail PCI DSS scans.",
        "Use only TLS 1.2 and 1.3.",
        `ssl_protocols TLSv1.2 TLSv1.3;`,
        "RFC 8996 — Deprecating TLSv1.0 and TLSv1.1"
      ));
    }
  }
};

const ruleSslProtocolsMissing: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    if (directivesInScope(server, "ssl_protocols").length === 0) {
      findings.push(finding(
        "sec-ssl-protocols-missing", "ssl_protocols not explicitly configured on HTTPS server",
        "Security", "low", "medium", server,
        "HTTPS listener detected but no ssl_protocols directive found in the server or http block.",
        "NGINX 1.23.4+ defaults to TLSv1.2 TLSv1.3, but older builds also enable TLSv1 and TLSv1.1. Setting it explicitly keeps behaviour the same across versions.",
        "Explicitly configure ssl_protocols to avoid relying on defaults.",
        `ssl_protocols TLSv1.2 TLSv1.3;`,
        "NGINX ngx_http_ssl_module — ssl_protocols"
      ));
    }
  }
};

const ruleWeakCiphers: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    const dirs = directivesInScope(server, "ssl_ciphers");
    for (const d of dirs) {
      const v = d.rawValue.toUpperCase();
      // Only enabled entries count: "!aNULL:!MD5" excludes them
      const enabled = v.split(":").filter((c) => c && !c.startsWith("!") && !c.startsWith("-"));
      const weak = ["RC4", "MD5", "DES", "3DES", "NULL", "EXPORT", "ANON", "ADH", "AECDH"].filter((p) => enabled.some((c) => c.includes(p)));
      if (weak.length) {
        findings.push(finding(
          "sec-weak-ciphers", "Weak cipher suites in ssl_ciphers",
          "Security", "high", "high", at(server, d),
          `Weak cipher patterns found: ${weak.join(", ")} in ssl_ciphers (${d.file}:${d.line})`,
          "Weak ciphers (RC4, MD5, DES, NULL, EXPORT) have known cryptographic vulnerabilities.",
          "Use Mozilla's modern cipher list.",
          `ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;\nssl_prefer_server_ciphers off;`,
          "Mozilla SSL Configuration Generator"
        ));
      }
    }
  }
};

const ruleSslSessionCache: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    const dirs = directivesInScope(server, "ssl_session_cache");
    if (dirs.length === 0) {
      findings.push(finding(
        "sec-ssl-session-cache", "ssl_session_cache not configured",
        "Security", "low", "medium", server,
        "No ssl_session_cache directive found on HTTPS server.",
        "Without session caching, each TLS connection requires a full handshake, increasing latency and CPU load.",
        "Configure ssl_session_cache for better TLS performance.",
        `ssl_session_cache shared:SSL:10m;\nssl_session_timeout 1d;\nssl_session_tickets off;`,
        "NGINX SSL performance optimization"
      ));
    }
  }
};

const ruleAutoindex: RuleFn = (ast, findings) => {
  const dirs = getAllDirectivesDeep(ast.root, "autoindex");
  for (const d of dirs) {
    if (d.rawValue.toLowerCase().trim() === "on") {
      const block = findParentBlock(ast.root, d.file, d.line) ?? ast.root;
      findings.push(finding(
        "sec-autoindex", "Directory listing enabled (autoindex on)",
        "Security", "high", "high", at(block, d),
        `autoindex on found at ${d.file}:${d.line}`,
        "Exposes entire directory structure to anyone requesting a path without an index file — leaks backup files, configs, and sensitive content.",
        "Remove autoindex on or set autoindex off explicitly.",
        `autoindex off;`,
        "NGINX autoindex module — security implications"
      ));
    }
  }
};

const ruleDotfileExposure: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    // Only servers that read files from disk can leak .git/.env themselves;
    // pure proxy_pass servers leave this to the backend.
    const servesFiles =
      ["root", "alias", "try_files", "fastcgi_pass", "autoindex"].some((n) => directivesInScope(server, n).length > 0);
    if (!servesFiles) continue;

    const hasDotfileProtection = getBlocksOfType(server, "location").some((loc) => {
      const { modifier, path } = locationMatch(loc);
      const blocksDotfiles =
        /\.(git|env|htaccess|htpasswd|svn|ds_store)/i.test(path) ||
        ((modifier === "~" || modifier === "~*") && /\/\\\./.test(path));
      const denies =
        getDirectives(loc, "deny").some((d) => d.rawValue.trim() === "all") ||
        getDirectives(loc, "return").some((d) => /^(403|404|444)$/.test(d.values[0] ?? ""));
      return blocksDotfiles && denies;
    });
    if (!hasDotfileProtection) {
      findings.push(finding(
        "sec-dotfiles", "No protection against .git/.env/.htaccess exposure",
        "Security", "high", "medium", server,
        "This server serves files from disk (root/alias/try_files/fastcgi) but no location denies hidden files.",
        ".git exposes full source history, .env exposes credentials and API keys. Scanners probe for them within minutes of a site going online.",
        "Add a deny-all block for hidden files.",
        `location ~ /\\.(?!well-known) {\n    deny all;\n    return 404;\n}`,
        "OWASP Configuration Security — Sensitive File Exposure"
      ));
    }
  }
};

const ruleHttpToHttpsRedirect: RuleFn = (ast, findings) => {
  const servers = getServerBlocks(ast.root);
  const hasHttps = servers.some(isHttpsServer);
  if (!hasHttps) return;

  const httpServers = servers.filter((s) => {
    const ports = getListenPorts(s);
    return ports.some((p) => p.includes("80") && !p.includes("ssl"));
  });

  for (const s of httpServers) {
    const hasRedirect =
      getAllDirectivesDeep(s, "return").some((d) => d.rawValue.includes("301") && d.rawValue.includes("https")) ||
      getAllDirectivesDeep(s, "rewrite").some((d) => d.rawValue.includes("https"));
    if (!hasRedirect) {
      findings.push(finding(
        "sec-no-http-redirect", "HTTP server block without HTTPS redirect",
        "Security", "medium", "high", s,
        `Server block on port 80 (${s.file}:${s.line}) without return 301 https redirect.`,
        "Serving HTTP alongside HTTPS without redirect allows unencrypted connections and splits SEO signals.",
        "Add return 301 https://$host$request_uri; to the HTTP server block.",
        `server {\n    listen 80;\n    server_name example.com;\n    return 301 https://$host$request_uri;\n}`,
        "NGINX HTTP to HTTPS redirect"
      ));
    }
  }
};

// ─── REVERSE PROXY RULES ─────────────────────────────────────────────────────

const ruleProxyHeaders: RuleFn = (ast, findings) => {
  const required = [
    { label: "Host", names: ["host"], sev: "medium" as Severity, value: "$host" },
    { label: "X-Forwarded-For", names: ["x-forwarded-for", "x-real-ip"], sev: "medium" as Severity, value: "$proxy_add_x_forwarded_for" },
    { label: "X-Forwarded-Proto", names: ["x-forwarded-proto", "forwarded"], sev: "low" as Severity, value: "$scheme" },
  ];

  for (const server of contentServers(ast)) {
    const gaps: { block: NginxBlock; missing: typeof required }[] = [];
    for (const block of allBlocks(server)) {
      if (getDirectives(block, "proxy_pass").length === 0) continue;
      const set = getEffectiveArrayDirectives(block, "proxy_set_header").map(headerName);
      const missing = required.filter((r) => !r.names.some((n) => set.includes(n)));
      if (missing.length) gaps.push({ block, missing });
    }
    if (gaps.length === 0) continue;

    const missingLabels = [...new Set(gaps.flatMap((g) => g.missing.map((m) => m.label)))];
    const severity: Severity = gaps.some((g) => g.missing.some((m) => m.sev === "medium")) ? "medium" : "low";
    const shadowed = gaps.some((g) => getDirectives(g.block, "proxy_set_header").length > 0 &&
      getEffectiveArrayDirectives(g.block.parent ?? g.block, "proxy_set_header").length > 0);
    findings.push(finding(
      "rp-forward-headers", `Proxied requests missing ${missingLabels.join(", ")}`,
      "Reverse Proxy", severity, "high", at(gaps[0].block, getDirectives(gaps[0].block, "proxy_pass")[0]),
      gaps.map((g) => `${g.block.contextLabel} (${g.block.file}:${g.block.line}): missing ${g.missing.map((m) => m.label).join(", ")}`).join("\n") +
        (shadowed ? "\nNote: a location that sets any proxy_set_header no longer inherits the ones from server/http." : ""),
      "Without Host the backend sees the upstream name instead of the requested hostname, which breaks virtual hosting and absolute URL generation. Without X-Forwarded-For/X-Real-IP it logs and rate-limits on the proxy address. Without X-Forwarded-Proto it cannot tell HTTPS from HTTP, which breaks redirects and Secure cookies.",
      "Set the forwarding headers once at server level. Locations that declare their own proxy_set_header must repeat them.",
      required.filter((r) => missingLabels.includes(r.label)).map((r) => `proxy_set_header ${r.label.padEnd(17)} ${r.value};`).join("\n"),
      "NGINX ngx_http_proxy_module — proxy_set_header"
    ));
  }
};

const ruleUpstreamKeepaliveConfig: RuleFn = (ast, findings) => {
  const upstreams = getUpstreamBlocks(ast.root);
  for (const upstream of upstreams) {
    if (!upstreamHasKeepalive(upstream)) continue;

    // Check that proxy locations using this upstream have correct HTTP version + Connection header
    const upstreamName = upstream.contextLabel.replace(/^upstream\s+/, "").trim();
    const proxyPassDirs = getAllDirectivesDeep(ast.root, "proxy_pass").filter((d) =>
      d.rawValue.includes(upstreamName)
    );

    for (const ppDir of proxyPassDirs) {
      const parentBlock = findParentBlock(ast.root, ppDir.file, ppDir.line);
      if (!parentBlock) continue;

      const httpVersionDirs = getDirectives(parentBlock, "proxy_http_version");
      if (!httpVersionDirs.some((d) => d.rawValue.trim() === "1.1")) {
        findings.push(finding(
          "rp-proxy-http-version", "proxy_http_version 1.1 not set — upstream keepalive will not function",
          "Reverse Proxy", "high", "high", at(parentBlock, ppDir),
          `upstream '${upstreamName}' has keepalive but proxy_http_version 1.1 is missing.`,
          "upstream keepalive requires HTTP/1.1. Without it, NGINX uses HTTP/1.0 which closes connections after each request, defeating keepalive entirely.",
          "Add proxy_http_version 1.1; and proxy_set_header Connection \"\";",
          `proxy_http_version 1.1;\nproxy_set_header Connection "";`,
          "NGINX upstream keepalive documentation"
        ));
      }
    }
  }
};

const ruleUpstreamKeepalive: RuleFn = (ast, findings) => {
  const upstreams = getUpstreamBlocks(ast.root);
  for (const upstream of upstreams) {
    if (!upstreamHasKeepalive(upstream)) {
      findings.push(finding(
        "perf-upstream-keepalive", "upstream block missing keepalive",
        "Performance", "medium", "high", upstream,
        `upstream block '${upstream.contextLabel}' at ${upstream.file}:${upstream.line} has no keepalive directive.`,
        "Without upstream keepalive, NGINX opens a new TCP connection per request. Under load, ephemeral ports exhaust causing EADDRINUSE/ETIMEDOUT errors before the upstream is overloaded.",
        "Add keepalive to upstream block and configure proxy_http_version 1.1.",
        `upstream backend {\n    server 127.0.0.1:3000;\n    keepalive 32;\n}\n\nlocation / {\n    proxy_pass http://backend;\n    proxy_http_version 1.1;\n    proxy_set_header Connection "";\n}`,
        "NGINX upstream keepalive documentation"
      ));
    }
  }
};

const ruleWebSocketHeaders: RuleFn = (ast, findings) => {
  function checkBlock(block: NginxBlock) {
    for (const d of block.directives) {
      if (d.block) checkBlock(d.block);
    }
    if (block.contextType !== "location") return;

    const headers = getEffectiveArrayDirectives(block, "proxy_set_header");
    const isWs =
      /\/ws\b|\/socket|websocket/i.test(block.contextLabel) ||
      headers.some((d) => d.rawValue.toLowerCase().includes("upgrade"));

    if (!isWs || getDirectives(block, "proxy_pass").length === 0) return;

    const hasUpgrade = headers.some((d) => d.rawValue.toLowerCase().startsWith("upgrade"));
    const hasConn    = headers.some((d) => d.rawValue.toLowerCase().startsWith("connection") && d.rawValue.toLowerCase().includes("upgrade"));

    if (!hasUpgrade || !hasConn) {
      findings.push(finding(
        "rp-websocket-headers", "WebSocket proxy missing Upgrade/Connection headers",
        "Reverse Proxy", "high", "medium", block,
        `Location '${block.contextLabel}' appears to proxy WebSocket but is missing required headers.`,
        "WebSocket connections require the Upgrade and Connection headers to be forwarded. Without them, the WebSocket handshake fails with 400.",
        "Add WebSocket upgrade headers to the location.",
        `location /ws/ {\n    proxy_pass http://backend;\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade    $http_upgrade;\n    proxy_set_header Connection "upgrade";\n    proxy_set_header Host       $host;\n}`,
        "NGINX WebSocket proxying documentation"
      ));
    }
  }
  checkBlock(ast.root);
};

const ruleProxyPassVariable: RuleFn = (ast, findings) => {
  for (const d of getAllDirectivesDeep(ast.root, "proxy_pass")) {
    if (!d.rawValue.includes("$")) continue;
    // With any variable in proxy_pass, NGINX resolves the host at request time
    // unless it is an IP, a unix socket or the name of an upstream{} block.
    const host = proxyPassHost(d);
    const staticHost = !host.includes("$");
    const hostName = host.replace(/:\d+$/, "");
    if (staticHost && (/^unix:/.test(host) || /^[\d.]+$|^\[/.test(hostName) ||
        getUpstreamBlocks(ast.root).some((u) => u.contextLabel.replace(/^upstream\s+/, "").trim() === hostName))) continue;
    const parentBlock = findParentBlock(ast.root, d.file, d.line) ?? ast.root;
    if (findInheritedDirective(parentBlock, "resolver")) continue;
    findings.push(finding(
      "rp-proxy-pass-variable", "proxy_pass uses variable without resolver directive",
      "Reverse Proxy", "high", staticHost ? "high" : "medium", at(parentBlock, d),
      `proxy_pass ${d.rawValue} at ${d.file}:${d.line} contains a variable, so its host is resolved per request, but no resolver is in scope.`,
      "When proxy_pass contains variables and the host is not an IP or an upstream{} name, NGINX resolves it at request time. Without a resolver every such request fails with 502 and 'no resolver defined to resolve' in error_log.",
      "Add a resolver directive in the http or server block, or point proxy_pass at an upstream{} block.",
      `resolver 127.0.0.53 valid=300s;  # or your VPC / cluster DNS\nresolver_timeout 5s;`,
      "NGINX ngx_http_proxy_module — proxy_pass with variables"
    ));
  }
};

const ruleProxyPassSsrf: RuleFn = (ast, findings) => {
  for (const d of getAllDirectivesDeep(ast.root, "proxy_pass")) {
    const host = proxyPassHost(d);
    const block = findParentBlock(ast.root, d.file, d.line) ?? ast.root;
    const requestControlled = host.match(/\$(arg_\w+|cookie_\w+|http_(?!host\b)\w+|request_body)\b/);
    const hostHeader = host.match(/\$(host|http_host)\b/);
    if (!requestControlled && !hostHeader) continue;
    const variable = (requestControlled ?? hostHeader)![0];
    findings.push(finding(
      "sec-proxy-ssrf", requestControlled ? "proxy_pass target controlled by the client (SSRF / open proxy)" : "proxy_pass target taken from the Host header",
      "Security", requestControlled ? "critical" : "high", requestControlled ? "high" : "medium", at(block, d),
      `proxy_pass ${d.rawValue} at ${d.file}:${d.line} builds the upstream host from ${variable}.`,
      requestControlled
        ? "Any client can choose where NGINX connects, including internal services and cloud metadata endpoints (169.254.169.254). This is a server-side request forgery and open proxy."
        : "If this server also answers unknown hostnames (default_server, server_name _ or a wildcard), a client can send any Host header and make NGINX connect to an arbitrary host.",
      "Proxy to a fixed upstream, or map allowed values to targets with map{} and reject everything else.",
      `map ${variable} $backend {\n    default        "";\n    app1           app1.internal:8080;\n    app2           app2.internal:8080;\n}\n\nlocation / {\n    if ($backend = "") { return 403; }\n    proxy_pass http://$backend;\n}`,
      "OWASP SSRF Prevention Cheat Sheet"
    ));
  }
};

const ruleAliasTraversal: RuleFn = (ast, findings) => {
  for (const loc of getBlocksOfType(ast.root, "location")) {
    const { modifier, path } = locationMatch(loc);
    if (modifier !== "" && modifier !== "^~") continue;
    if (path.endsWith("/")) continue;
    for (const a of getDirectives(loc, "alias")) {
      const target = a.values[0]?.replace(/^["']|["']$/g, "") ?? "";
      if (!target.endsWith("/")) continue;
      findings.push(finding(
        "sec-alias-traversal", "alias path traversal (location without trailing slash)",
        "Security", "high", "high", at(loc, a),
        `location ${path} has alias ${target} (${a.file}:${a.line}). A request for ${path}../ maps to ${target}../`,
        `Because the location prefix has no trailing slash but the alias does, GET ${path}../secret resolves to the parent of the alias directory. Attackers use this to read files next to the static directory, such as app source or .env.`,
        "Make both paths end with a slash (or neither).",
        `location ${path}/ {\n    alias ${target};\n}`,
        "NGINX alias off-by-slash (Orange Tsai, Black Hat 2018)"
      ));
    }
  }
};

const ruleCrlfInjection: RuleFn = (ast, findings) => {
  const checks: { name: string; applies: (d: NginxDirective) => boolean }[] = [
    { name: "return", applies: (d) => /^30[1278]$/.test(d.values[0] ?? "") || /^["']?https?:/.test(d.values[0] ?? "") },
    { name: "rewrite", applies: () => true },
    { name: "add_header", applies: () => true },
    { name: "proxy_set_header", applies: () => true },
  ];
  for (const check of checks) {
    for (const d of getAllDirectivesDeep(ast.root, check.name)) {
      if (!/\$(uri|document_uri)\b/.test(d.rawValue) || !check.applies(d)) continue;
      const block = findParentBlock(ast.root, d.file, d.line) ?? ast.root;
      findings.push(finding(
        "sec-crlf-uri", "Decoded $uri used in a header or redirect (CRLF injection)",
        "Security", "medium", "high", at(block, d),
        `${d.name} ${d.rawValue} at ${d.file}:${d.line}`,
        "$uri and $document_uri are URL-decoded, so %0d%0a in the request becomes a real line break. Used in a redirect or header, it lets an attacker inject headers such as Set-Cookie (HTTP response splitting).",
        "Use $request_uri (raw, still encoded) instead of $uri.",
        `${d.name} ${d.rawValue.replace(/\$(uri|document_uri)\b/g, "$request_uri")};`,
        "Detectify — Common NGINX misconfigurations (CRLF via $uri)"
      ));
    }
  }
};

const ruleIfInLocation: RuleFn = (ast, findings) => {
  for (const ifBlock of getBlocksOfType(ast.root, "if")) {
    if (ifBlock.parent?.contextType !== "location") continue;
    const unsafe = ifBlock.directives.filter((d) => {
      const n = d.name.toLowerCase();
      if (n === "return" || n === "set") return false;
      if (n === "rewrite") return /\blast\b/.test(d.rawValue);
      return true;
    });
    if (unsafe.length === 0) continue;
    findings.push(finding(
      "maint-if-in-location", "if inside location runs non-rewrite directives",
      "Maintainability", "low", "medium", ifBlock,
      `${ifBlock.contextLabel} at ${ifBlock.file}:${ifBlock.line} contains: ${unsafe.map((d) => d.name).join(", ")}`,
      "if creates an implicit nested location. Only return and rewrite ... last are reliably safe inside it; other directives (proxy_pass, add_header, try_files) can be skipped or behave unexpectedly.",
      "Move the condition into map{} and use the resulting variable, or keep only return / rewrite ... last inside if.",
      `map $http_x_flag $target {\n    default backend_a;\n    "on"    backend_b;\n}\n\nlocation / {\n    proxy_pass http://$target;\n}`,
      "NGINX wiki — If is Evil"
    ));
  }
};

const ruleSensitiveRateLimit: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    const sensitive = getBlocksOfType(server, "location").filter((loc) =>
      /(login|signin|sign-in|auth|token|password|passwd|otp|wp-login|xmlrpc)/i.test(locationMatch(loc).path)
    );
    const unprotected = sensitive.filter((loc) => !findInheritedDirective(loc, "limit_req"));
    if (unprotected.length === 0) continue;
    findings.push(finding(
      "sec-rate-limit", "No rate limiting on authentication endpoints",
      "Security", "low", "medium", unprotected[0],
      `Without limit_req: ${unprotected.map((l) => `${l.contextLabel} (${l.file}:${l.line})`).join(", ")}`,
      "Login, token and password endpoints without a request limit allow credential stuffing and brute force at line rate.",
      "Define a limit_req_zone in http{} and apply limit_req to these locations.",
      `# http {}\nlimit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;\n\n${unprotected[0].contextLabel} {\n    limit_req zone=auth burst=5 nodelay;\n    limit_req_status 429;\n    # ...\n}`,
      "NGINX ngx_http_limit_req_module"
    ));
  }
};

const ruleProxyBuffering: RuleFn = (ast, findings) => {
  const dirs = getAllDirectivesDeep(ast.root, "proxy_buffering");
  for (const d of dirs) {
    if (d.rawValue.toLowerCase().trim() === "off") {
      const block = findParentBlock(ast.root, d.file, d.line) ?? ast.root;
      // Only flag if at http/server level (not in a specific location)
      if (block.contextType === "http" || block.contextType === "server") {
        findings.push(finding(
          "rp-proxy-buffering-off", "proxy_buffering disabled globally",
          "Reverse Proxy", "medium", "high", at(block, d),
          `proxy_buffering off found at ${d.file}:${d.line} in ${block.contextType} context.`,
          "Globally disabling proxy_buffering holds upstream connections open while responding byte-by-byte to slow clients, reducing upstream throughput.",
          "Enable globally, disable only for specific streaming endpoints.",
          `# In http{} or server{}:\nproxy_buffering on;\nproxy_buffer_size 4k;\nproxy_buffers 8 4k;\n\n# For SSE/streaming locations only:\nlocation /events {\n    proxy_buffering off;\n}`,
          "NGINX proxy_buffering documentation"
        ));
      }
    }
  }
};

// ─── PERFORMANCE RULES ───────────────────────────────────────────────────────

const ruleWorkerProcesses: RuleFn = (ast, findings) => {
  if (!isFullConfig(ast.root)) return;
  const dirs = getDirectives(ast.root, "worker_processes");
  if (dirs.length === 0) {
    findings.push(finding(
      "perf-worker-processes", "worker_processes not configured",
      "Performance", "medium", "medium", ast.root,
      "No worker_processes directive found in main context.",
      "Without worker_processes, NGINX defaults to 1 worker, underutilizing multi-core systems.",
      "Set worker_processes auto;",
      `worker_processes auto;`,
      "NGINX worker_processes documentation"
    ));
    return;
  }
  const val = dirs[0].rawValue.trim().toLowerCase();
  if (val !== "auto" && parseInt(val) === 1) {
    findings.push(finding(
      "perf-worker-processes-one", "worker_processes set to 1",
      "Performance", "medium", "high", at(ast.root, dirs[0]),
      `worker_processes ${val} — single worker regardless of CPU count.`,
      "On multi-core systems, a single worker limits throughput.",
      "Set worker_processes auto;",
      `worker_processes auto;`,
      "NGINX worker_processes documentation"
    ));
  }
};

const ruleWorkerConnections: RuleFn = (ast, findings) => {
  const eventBlocks = getBlocksOfType(ast.root, "events");
  for (const events of eventBlocks) {
    const dirs = getDirectives(events, "worker_connections");
    if (dirs.length === 0) {
      findings.push(finding(
        "perf-worker-connections", "worker_connections not configured",
        "Performance", "medium", "medium", events,
        "No worker_connections directive in events{} block.",
        "NGINX defaults to 512. Under moderate load this becomes a hard ceiling on concurrent connections.",
        "Set worker_connections 1024 or higher.",
        `events {\n    worker_connections 1024;\n}`,
        "NGINX events module documentation"
      ));
      return;
    }
    const val = parseInt(dirs[0].rawValue);
    if (!isNaN(val) && val < 512) {
      findings.push(finding(
        "perf-worker-connections-low", `worker_connections too low (${val})`,
        "Performance", "medium", "high", at(events, dirs[0]),
        `worker_connections ${val} detected.`,
        `Each worker handles at most ${val} concurrent connections — a hard ceiling under load.`,
        "Increase to at least 1024 for production.",
        `events {\n    worker_connections 1024;\n}`,
        "NGINX events module documentation"
      ));
    }
  }
};

const ruleGzip: RuleFn = (ast, findings) => {
  const httpBlocks = getBlocksOfType(ast.root, "http");
  for (const http of httpBlocks) {
    const gzip = getDirectives(http, "gzip");
    const brotli = getAllDirectivesDeep(http, "brotli");
    const hasCompression = gzip.some((d) => d.rawValue.toLowerCase() === "on") ||
                           brotli.some((d) => d.rawValue.toLowerCase() === "on");
    if (!hasCompression) {
      findings.push(finding(
        "perf-compression", "Response compression not enabled",
        "Performance", "medium", "high", http,
        "No gzip on or brotli on directive found in http{} block.",
        "Uncompressed text responses are typically 5-10x larger. Compression reduces TTFB and bandwidth for all users.",
        "Enable gzip compression in the http{} block.",
        `gzip on;\ngzip_vary on;\ngzip_min_length 1024;\ngzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;`,
        "NGINX ngx_http_gzip_module documentation"
      ));
    }
  }
};

const ruleClientMaxBodySize: RuleFn = (ast, findings) => {
  const httpBlocks = getBlocksOfType(ast.root, "http");
  for (const http of httpBlocks) {
    const dirs = getAllDirectivesDeep(http, "client_max_body_size");
    if (dirs.length === 0) {
      findings.push(finding(
        "perf-client-body-size", "client_max_body_size not configured",
        "Performance", "low", "high", http,
        "No client_max_body_size directive found.",
        "Default is 1MB. File upload endpoints silently return 413 for anything larger — common production surprise.",
        "Set client_max_body_size to match your app's max upload.",
        `client_max_body_size 50M;`,
        "NGINX client_max_body_size documentation"
      ));
    }
  }
};

const ruleSendfile: RuleFn = (ast, findings) => {
  const httpBlocks = getBlocksOfType(ast.root, "http");
  for (const http of httpBlocks) {
    const dirs = getDirectives(http, "sendfile");
    if (!dirs.some((d) => d.rawValue.toLowerCase() === "on")) {
      findings.push(finding(
        "perf-sendfile", "sendfile not enabled",
        "Performance", "low", "medium", http,
        "No sendfile on directive found.",
        "Without sendfile, NGINX copies file data through userspace. Sendfile uses kernel zero-copy, reducing CPU overhead for static files.",
        "Enable sendfile in http{} block.",
        `sendfile on;\ntcp_nopush on;\ntcp_nodelay on;`,
        "NGINX sendfile documentation"
      ));
    }
  }
};

const ruleHttp2: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    const listenDirs = getDirectives(server, "listen");
    const legacyListen = listenDirs.filter((d) => d.values.some((v) => v.toLowerCase() === "http2"));
    const hasHttp2 = legacyListen.length > 0 || directivesInScope(server, "http2").some((d) => d.rawValue.toLowerCase() === "on");
    if (!hasHttp2) {
      findings.push(finding(
        "perf-http2", "HTTP/2 not enabled on TLS listener",
        "Performance", "low", "high", server,
        `HTTPS server block at ${server.file}:${server.line} without HTTP/2.`,
        "HTTP/2 multiplexes requests over one connection and compresses headers, which lowers latency for pages with many assets.",
        "Enable HTTP/2 with the http2 directive (NGINX 1.25.1+).",
        `listen 443 ssl;\nhttp2 on;`,
        "NGINX ngx_http_v2_module"
      ));
    }
    for (const d of legacyListen) {
      findings.push(finding(
        "maint-listen-http2", "Deprecated 'listen ... http2' parameter",
        "Maintainability", "low", "medium", at(server, d),
        `listen ${d.rawValue} at ${d.file}:${d.line}`,
        "Since NGINX 1.25.1 the http2 parameter of listen is deprecated and logs a warning on every reload. It will be removed in a future release.",
        "On 1.25.1+ remove http2 from listen and add http2 on; to the server block. Keep the old form only if you run an older NGINX.",
        `listen ${d.values.filter((v) => v.toLowerCase() !== "http2").join(" ")};\nhttp2 on;`,
        "NGINX 1.25.1 changelog"
      ));
    }
  }
};

const ruleProxyTimeouts: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    if (!hasProxyPass(server)) continue;
    if (directivesInScope(server, "proxy_read_timeout").length === 0) {
      findings.push(finding(
        "perf-proxy-read-timeout", "proxy_read_timeout left at default (60s)",
        "Performance", "info", "high", server,
        `Server block at ${server.file}:${server.line} uses proxy_pass without proxy_read_timeout.`,
        "The 60s default suits most APIs. Endpoints that take longer (exports, reports, long polling) return 504 even though the backend would eventually answer.",
        "Only change it if some endpoints legitimately run longer than 60s, and scope it to those locations.",
        `location /reports/ {\n    proxy_read_timeout 300s;\n    proxy_pass http://backend;\n}`,
        "NGINX proxy_read_timeout documentation"
      ));
    }
  }
};

// ─── RELIABILITY RULES ───────────────────────────────────────────────────────

const ruleErrorLog: RuleFn = (ast, findings) => {
  if (!isFullConfig(ast.root)) return;
  const dirs = getAllDirectivesDeep(ast.root, "error_log");
  if (dirs.length === 0) {
    findings.push(finding(
      "rel-error-log", "No error_log directive configured",
      "Reliability", "low", "medium", ast.root,
      "No error_log directive found anywhere in config.",
      "Without explicit error_log, NGINX writes to the compiled-in path at level error. In containers that path may not be collected.",
      "Explicitly configure error_log.",
      `error_log /var/log/nginx/error.log warn;`,
      "NGINX error_log documentation"
    ));
  }
};

const ruleAccessLog: RuleFn = (ast, findings) => {
  if (!isFullConfig(ast.root)) return;
  const dirs = getAllDirectivesDeep(ast.root, "access_log");
  if (dirs.length === 0) {
    findings.push(finding(
      "rel-access-log", "access_log uses the default format",
      "Reliability", "info", "medium", ast.root,
      "No access_log directive found, so NGINX logs to logs/access.log in the combined format.",
      "The combined format has no request or upstream timing, which is what you need when debugging 502/504 and slow responses.",
      "Configure access_log with a format that includes upstream timing.",
      `log_format main '$remote_addr - [$time_local] "$request" $status rt=$request_time uct=$upstream_connect_time urt=$upstream_response_time';\naccess_log /var/log/nginx/access.log main;`,
      "NGINX access_log documentation"
    ));
  }
};

const ruleUpstreamHealth: RuleFn = (ast, findings) => {
  for (const upstream of getUpstreamBlocks(ast.root)) {
    const serverDirs = getDirectives(upstream, "server");
    if (serverDirs.length < 2) continue; // failover settings only matter with more than one server
    for (const s of serverDirs) {
      const v = s.rawValue.toLowerCase();
      const hasMaxFails   = /max_fails\s*=/.test(v);
      const hasFailTimeout = /fail_timeout\s*=/.test(v);
      if (!hasMaxFails || !hasFailTimeout) {
        findings.push(finding(
          "rel-upstream-health", "Upstream servers use default max_fails/fail_timeout",
          "Reliability", "info", "high", at(upstream, s),
          `upstream server '${s.rawValue}' at ${s.file}:${s.line} relies on max_fails=1 fail_timeout=10s.`,
          "With the defaults, one failed attempt takes a server out for 10s. That is often too eager on a flaky network and too short for a backend that is restarting.",
          "Set max_fails and fail_timeout explicitly to match how your backends fail and recover.",
          `upstream backend {\n    server 10.0.0.1:3000 max_fails=3 fail_timeout=30s;\n    server 10.0.0.2:3000 max_fails=3 fail_timeout=30s;\n    keepalive 32;\n}`,
          "NGINX upstream server parameters"
        ));
        break; // one finding per upstream
      }
    }
  }
};

const ruleProxyNextUpstream: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    const pools = getAllDirectivesDeep(server, "proxy_pass")
      .map((d) => findUsedUpstream(ast.root, d.rawValue))
      .filter((u): u is NginxBlock => !!u && getDirectives(u, "server").length > 1);
    if (pools.length === 0) continue;
    if (directivesInScope(server, "proxy_next_upstream").length > 0) continue;
    findings.push(finding(
      "rel-proxy-next-upstream", "proxy_next_upstream left at default",
      "Reliability", "info", "medium", server,
      `Server at ${server.file}:${server.line} load-balances across ${pools[0].contextLabel} without proxy_next_upstream.`,
      "The default (error timeout) retries the next server only on connection errors and timeouts. A backend that answers 502/503/504 during a deploy is not retried.",
      "Add the gateway error codes. Non-idempotent requests (POST) are not retried unless you add non_idempotent.",
      `proxy_next_upstream error timeout http_502 http_503 http_504;\nproxy_next_upstream_tries 2;`,
      "NGINX proxy_next_upstream documentation"
    ));
  }
};

const ruleDefaultServer: RuleFn = (ast, findings) => {
  const servers = getServerBlocks(ast.root);
  if (servers.length <= 1) return;
  const hasDefault = servers.some((s) =>
    getListenPorts(s).some((p) => p.includes("default_server"))
  );
  if (!hasDefault) {
    findings.push(finding(
      "rel-no-default-server", "No default_server block defined",
      "Reliability", "low", "medium", ast.root,
      `${servers.length} server blocks detected but none has default_server.`,
      "Without default_server, requests to unmatched hostnames (scanners, direct IP access) are handled by the first server block in config load order.",
      "Add a catch-all default_server block.",
      `server {\n    listen 80 default_server;\n    listen [::]:80 default_server;\n    server_name _;\n    return 444;\n}`,
      "NGINX server_name — default server"
    ));
  }
};

const ruleErrorPage: RuleFn = (ast, findings) => {
  for (const server of contentServers(ast)) {
    if (!hasProxyPass(server)) continue;
    const errorPages = directivesInScope(server, "error_page");
    const hasFallback = errorPages.some((d) => /502|503|504/.test(d.rawValue));
    if (!hasFallback) {
      findings.push(finding(
        "rel-error-page", "No error_page for 502/503/504 on proxy server",
        "Reliability", "low", "low", server,
        `Proxy server at ${server.file}:${server.line} has no error_page for gateway errors.`,
        "Without custom error pages, upstream failures show NGINX's default error page — poor UX and potentially reveals server info.",
        "Add custom error pages for common gateway errors.",
        `error_page 502 503 504 /50x.html;\nlocation = /50x.html {\n    root /usr/share/nginx/html;\n    internal;\n}`,
        "NGINX error_page documentation"
      ));
    }
  }
};

// ─── MAINTAINABILITY RULES ───────────────────────────────────────────────────

const ruleLargeConfig: RuleFn = (ast, findings) => {
  const servers = getServerBlocks(ast.root);
  if (servers.length > 8) {
    findings.push(finding(
      "maint-large-config", `Large configuration — ${servers.length} server blocks`,
      "Maintainability", "info", "high", ast.root,
      `${servers.length} server blocks detected in a single configuration.`,
      "Large monolithic configs are harder to audit, modify, and test independently.",
      "Split into per-site configs under conf.d/ or sites-enabled/.",
      `# In nginx.conf:\nhttp {\n    include /etc/nginx/conf.d/*.conf;\n    include /etc/nginx/sites-enabled/*;\n}`,
      "NGINX configuration organization best practices"
    ));
  }
};

const ruleManyRegexLocations: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    const locations = getChildBlocks(server, "location");
    const regexCount = locations.filter((l) => /^location\s+[~]/.test(l.contextLabel)).length;
    if (regexCount > 10) {
      findings.push(finding(
        "maint-many-regex-locations", `Many regex location blocks (${regexCount})`,
        "Maintainability", "info", "medium", server,
        `${regexCount} regex location blocks detected in server block at ${server.file}:${server.line}.`,
        "Regex locations are evaluated for every request in sequence. Many regex locations increase CPU time per request.",
        "Consider consolidating regex patterns or using prefix matches where possible.",
        `# Replace multiple regex locations with a single catch-all:\nlocation ~* \\.(jpg|jpeg|png|gif|ico|css|js)$ {\n    expires 1y;\n    add_header Cache-Control "public";\n}`,
        "NGINX location matching — performance implications"
      ));
    }
  }
};

const ruleUnusedUpstream: RuleFn = (ast, findings) => {
  const upstreams = getUpstreamBlocks(ast.root);
  const allProxyPass = getAllDirectivesDeep(ast.root, "proxy_pass").map((d) => d.rawValue);
  for (const upstream of upstreams) {
    const name = upstream.contextLabel.replace(/^upstream\s+/, "").trim();
    const used = allProxyPass.some((v) => v.includes(name));
    if (!used) {
      findings.push(finding(
        "maint-unused-upstream", `Upstream block '${name}' appears unused`,
        "Maintainability", "info", "medium", upstream,
        `No proxy_pass found referencing upstream '${name}'.`,
        "Unused upstream blocks add config complexity and may indicate stale configuration.",
        "Remove the upstream block if it's no longer needed.",
        `# Remove:\n# upstream ${name} { ... }`,
        "NGINX upstream cleanup"
      ));
    }
  }
};

// ─── INCLUDE WARNING ─────────────────────────────────────────────────────────

const ruleIncludeWarning: RuleFn = (ast, findings) => {
  for (const err of ast.errors) {
    if (err.kind === "include") {
      findings.push({
        id: `inc-missing-${Math.random()}`,
        title: `include target not provided: ${err.message.split("'")[1] ?? "unknown"}`,
        category: "Maintainability",
        severity: "info",
        confidence: "high",
        filename: err.file,
        line: err.line,
        contextPath: "main",
        evidence: err.message,
        whyItMatters: "Rules that depend on directives in included files may produce false positives or miss issues.",
        recommendation: "Add included files as additional tabs to get complete analysis.",
        fixSnippet: `# Run nginx -T to get the full compiled config:\nnginx -T | grep -v "^#" > /tmp/nginx-full.conf\n# Then paste that output for complete analysis`,
        reference: "NGINX include directive documentation",
      });
    }
  }
};

const ruleSnippetMode: RuleFn = (ast, findings) => {
  if (isFullConfig(ast.root) || getServerBlocks(ast.root).length === 0) return;
  findings.push(finding(
    "maint-snippet-mode", "Partial config: analyzing server blocks only",
    "Maintainability", "info", "high", ast.root,
    "No http{} or events{} block found, so this looks like a conf.d/sites-enabled file. Main and http level checks (worker_processes, logging, gzip, server_tokens) were skipped.",
    "Headers, TLS settings and proxy headers set in nginx.conf's http{} block are inherited by these servers but are not visible here, so some findings may already be covered.",
    "Paste the output of nginx -T for a complete analysis.",
    `nginx -T > /tmp/nginx-full.conf`,
    "NGINX -T (dump configuration)"
  ));
};

// ─── RULE REGISTRY ────────────────────────────────────────────────────────────

export const ALL_RULES: RuleFn[] = [
  // Security
  ruleHsts,
  ruleXFrameOptions,
  ruleXContentTypeOptions,
  ruleCsp,
  ruleHeaderInheritance,
  ruleHeadersWithoutAlways,
  ruleServerTokens,
  ruleLegacyTls,
  ruleSslProtocolsMissing,
  ruleWeakCiphers,
  ruleSslSessionCache,
  ruleAutoindex,
  ruleDotfileExposure,
  ruleHttpToHttpsRedirect,
  ruleProxyPassSsrf,
  ruleAliasTraversal,
  ruleCrlfInjection,
  ruleSensitiveRateLimit,
  // Reverse Proxy
  ruleProxyHeaders,
  ruleUpstreamKeepaliveConfig,
  ruleWebSocketHeaders,
  ruleProxyPassVariable,
  ruleProxyBuffering,
  // Performance
  ruleWorkerProcesses,
  ruleWorkerConnections,
  ruleGzip,
  ruleClientMaxBodySize,
  ruleSendfile,
  ruleHttp2,
  ruleProxyTimeouts,
  ruleUpstreamKeepalive,
  // Reliability
  ruleErrorLog,
  ruleAccessLog,
  ruleUpstreamHealth,
  ruleProxyNextUpstream,
  ruleDefaultServer,
  ruleErrorPage,
  // Maintainability
  ruleLargeConfig,
  ruleManyRegexLocations,
  ruleUnusedUpstream,
  ruleIfInLocation,
  ruleIncludeWarning,
  ruleSnippetMode,
];

// ─── HELPER: find parent block by file+line ───────────────────────────────────

function findParentBlock(root: NginxBlock, file: string, line: number): NginxBlock | null {
  let best: NginxBlock | null = null;

  function recurse(block: NginxBlock) {
    for (const d of block.directives) {
      if (d.block) {
        if (d.block.file === file && d.block.line <= line) {
          if (!best || d.block.line > best.line) best = d.block;
        }
        recurse(d.block);
      }
    }
  }
  recurse(root);
  return best;
}