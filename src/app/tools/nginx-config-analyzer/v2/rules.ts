// rules.ts — scope-aware rule engine

import type { Finding, AnalysisCategory, Severity, Confidence } from "./types";
import type { NginxBlock, ParseResult } from "./types";
import {
  getBlocksOfType,
  getServerBlocks,
  getChildBlocks,
  getDirectives,
  getDirectiveValue,
  getAllDirectivesDeep,
  getEffectiveHeaders,
  hasHeader,
  isHttpsServer,
  hasProxyPass,
  getUpstreamBlocks,
  upstreamHasKeepalive,
  findUsedUpstream,
  getListenPorts,
  getServerNames,
} from "./parser";

// ─── RULE TYPE ────────────────────────────────────────────────────────────────

type RuleFn = (ast: ParseResult, findings: Finding[]) => void;

// ─── FINDING BUILDER ─────────────────────────────────────────────────────────

let _findingCounter = 0;

function finding(
  id: string,
  title: string,
  category: AnalysisCategory,
  severity: Severity,
  confidence: Confidence,
  block: NginxBlock,
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

// ─── SECURITY RULES ──────────────────────────────────────────────────────────

const ruleHsts: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    const headers = getEffectiveHeaders(server);
    if (!hasHeader(headers, "strict-transport-security")) {
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
  for (const server of getServerBlocks(ast.root)) {
    const headers = getEffectiveHeaders(server);
    if (!hasHeader(headers, "x-frame-options") && !hasHeader(headers, "frame-ancestors")) {
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
  for (const server of getServerBlocks(ast.root)) {
    const headers = getEffectiveHeaders(server);
    if (!hasHeader(headers, "x-content-type-options")) {
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
  for (const server of getServerBlocks(ast.root)) {
    const headers = getEffectiveHeaders(server);
    if (!hasHeader(headers, "content-security-policy")) {
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
    const dirs = getAllDirectivesDeep(server, "ssl_protocols");
    for (const d of dirs) {
      const v = d.rawValue.toLowerCase();
      if (/tlsv1\b/.test(v) || /tlsv1\.1\b/.test(v)) {
        findings.push(finding(
          "sec-legacy-tls", "Legacy TLS versions enabled (TLS 1.0 / 1.1)",
          "Security", "high", "high", server,
          `ssl_protocols configured as: ${d.rawValue} (file: ${d.file}:${d.line})`,
          "TLS 1.0 and 1.1 are deprecated by RFC 8996. Vulnerable to BEAST, POODLE, SWEET32. Fails PCI-DSS and SOC 2 audits.",
          "Use only TLS 1.2 and 1.3.",
          `ssl_protocols TLSv1.2 TLSv1.3;`,
          "RFC 8996 — Deprecating TLSv1.0 and TLSv1.1"
        ));
      }
    }
  }
};

const ruleSslProtocolsMissing: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    const dirs = getAllDirectivesDeep(server, "ssl_protocols");
    if (dirs.length === 0) {
      findings.push(finding(
        "sec-ssl-protocols-missing", "ssl_protocols not explicitly configured on HTTPS server",
        "Security", "medium", "high", server,
        "HTTPS listener detected but no ssl_protocols directive found.",
        "Without explicit ssl_protocols, NGINX uses compiled-in defaults which may include TLS 1.0/1.1 depending on version.",
        "Explicitly configure ssl_protocols to avoid relying on defaults.",
        `ssl_protocols TLSv1.2 TLSv1.3;`,
        "NGINX SSL module documentation"
      ));
    }
  }
};

const ruleWeakCiphers: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!isHttpsServer(server)) continue;
    const dirs = getAllDirectivesDeep(server, "ssl_ciphers");
    for (const d of dirs) {
      const v = d.rawValue.toUpperCase();
      const weak = ["RC4", "MD5", "DES", "3DES", "NULL", "EXPORT", "ANON", "ADH", "AECDH"].filter((p) => v.includes(p));
      if (weak.length) {
        findings.push(finding(
          "sec-weak-ciphers", "Weak cipher suites in ssl_ciphers",
          "Security", "high", "high", server,
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
    const dirs = getAllDirectivesDeep(server, "ssl_session_cache");
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
        "Security", "high", "high", block,
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
  for (const server of getServerBlocks(ast.root)) {
    const locationBlocks = getChildBlocks(server, "location");
    const hasDotfileProtection = locationBlocks.some((loc) => {
      const label = loc.contextLabel.toLowerCase();
      return /\.(git|env|htaccess|htpasswd|svn|DS_Store)/.test(label) ||
        (label.includes("~") && label.includes("\\."));
    });
    if (!hasDotfileProtection) {
      findings.push(finding(
        "sec-dotfiles", "No protection against .git/.env/.htaccess exposure",
        "Security", "critical", "medium", server,
        "No location block found protecting dotfile paths.",
        ".git exposes full source history, .env exposes credentials and API keys. These are indexed by scanners within minutes of going online.",
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
  // For each location that has proxy_pass, check required headers
  function checkLocations(block: NginxBlock) {
    for (const d of block.directives) {
      if (d.block) checkLocations(d.block);
    }

    if (block.contextType !== "location" && block.contextType !== "server") return;

    const proxyPassDirs = getDirectives(block, "proxy_pass");
    if (proxyPassDirs.length === 0) return;

    const allHeaders = getAllDirectivesDeep(block, "proxy_set_header");
    const headerNames = allHeaders.map((d) => d.rawValue.toLowerCase());

    const required = [
      { name: "Host", id: "rp-host", sev: "medium" as Severity, msg: "Backend receives proxy address as Host instead of original hostname — breaks virtual hosting and URL generation." },
      { name: "X-Real-IP", id: "rp-x-real-ip", sev: "medium" as Severity, msg: "Backend cannot see original client IP for logging, rate limiting, or geo-targeting." },
      { name: "X-Forwarded-For", id: "rp-xff", sev: "medium" as Severity, msg: "Backend sees 127.0.0.1 for all requests. IP-based security controls silently fail." },
      { name: "X-Forwarded-Proto", id: "rp-xfp", sev: "low" as Severity, msg: "Backend cannot distinguish HTTP from HTTPS requests — breaks redirect logic and secure cookie handling." },
    ];

    for (const req of required) {
      if (!headerNames.some((h) => h.startsWith(req.name.toLowerCase()))) {
        findings.push(finding(
          req.id, `Missing proxy_set_header ${req.name}`,
          "Reverse Proxy", req.sev, "high", block,
          `proxy_pass found at ${proxyPassDirs[0].file}:${proxyPassDirs[0].line} without proxy_set_header ${req.name}.`,
          req.msg,
          `Add: proxy_set_header ${req.name} ${"Host" === req.name ? "$host" : "X-Real-IP" === req.name ? "$remote_addr" : "X-Forwarded-For" === req.name ? "$proxy_add_x_forwarded_for" : "$scheme"};`,
          `proxy_set_header Host              $host;\nproxy_set_header X-Real-IP         $remote_addr;\nproxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;`,
          "NGINX reverse proxy header forwarding"
        ));
      }
    }
  }
  checkLocations(ast.root);
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
          "Reverse Proxy", "high", "high", parentBlock,
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
        "Performance", "high", "high", upstream,
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

    const isWs =
      /\/ws\b|\/socket|websocket/i.test(block.contextLabel) ||
      getAllDirectivesDeep(block, "proxy_set_header").some((d) => d.rawValue.toLowerCase().includes("upgrade"));

    if (!isWs) return;

    const headers = getAllDirectivesDeep(block, "proxy_set_header");
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
  const proxyPassDirs = getAllDirectivesDeep(ast.root, "proxy_pass");
  for (const d of proxyPassDirs) {
    if (d.rawValue.includes("$") && !d.rawValue.includes("$scheme") && !d.rawValue.includes("$host")) {
      const parentBlock = findParentBlock(ast.root, d.file, d.line) ?? ast.root;
      const resolverDirs = getAllDirectivesDeep(parentBlock, "resolver");
      if (resolverDirs.length === 0) {
        findings.push(finding(
          "rp-proxy-pass-variable", "proxy_pass uses variable without resolver directive",
          "Reverse Proxy", "high", "medium", parentBlock,
          `proxy_pass uses variable: ${d.rawValue} at ${d.file}:${d.line} but no resolver found.`,
          "When proxy_pass contains variables, NGINX requires a resolver directive to perform DNS lookups at request time. Without it, NGINX cannot start.",
          "Add a resolver directive in the http or server block.",
          `resolver 8.8.8.8 8.8.4.4 valid=300s;\nresolver_timeout 5s;`,
          "NGINX proxy_pass with variables documentation"
        ));
      }
    }
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
          "Reverse Proxy", "medium", "high", block,
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
      "Performance", "medium", "high", ast.root,
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
        "Performance", "medium", "high", events,
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
    const hasHttp2 =
      listenDirs.some((d) => d.rawValue.toLowerCase().includes("http2")) ||
      getDirectives(server, "http2").some((d) => d.rawValue.toLowerCase() === "on");
    if (!hasHttp2) {
      findings.push(finding(
        "perf-http2", "HTTP/2 not enabled on TLS listener",
        "Performance", "medium", "high", server,
        `HTTPS server block at ${server.file}:${server.line} without HTTP/2.`,
        "HTTP/2 provides multiplexing, header compression, and lower latency. Without it, each resource requires separate HTTP/1.1 negotiation.",
        "Add http2 to the listen directive or use http2 directive (NGINX 1.25.1+).",
        `# NGINX < 1.25.1:\nlisten 443 ssl http2;\n\n# NGINX >= 1.25.1:\nlisten 443 ssl;\nhttp2 on;`,
        "NGINX HTTP/2 module documentation"
      ));
    }
  }
};

const ruleProxyTimeouts: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!hasProxyPass(server)) continue;
    const proxyReadTimeout = getAllDirectivesDeep(server, "proxy_read_timeout");
    if (proxyReadTimeout.length === 0) {
      findings.push(finding(
        "perf-proxy-read-timeout", "proxy_read_timeout not configured",
        "Performance", "medium", "high", server,
        `Server block at ${server.file}:${server.line} uses proxy_pass without proxy_read_timeout.`,
        "Default is 60s. Long-running backend operations (exports, reports) 504 before completing even when the backend will eventually respond.",
        "Set proxy timeouts based on backend p99 latency.",
        `proxy_connect_timeout  10s;\nproxy_send_timeout     60s;\nproxy_read_timeout     60s;`,
        "NGINX proxy timeout documentation"
      ));
    }
  }
};

// ─── RELIABILITY RULES ───────────────────────────────────────────────────────

const ruleErrorLog: RuleFn = (ast, findings) => {
  const dirs = getAllDirectivesDeep(ast.root, "error_log");
  if (dirs.length === 0) {
    findings.push(finding(
      "rel-error-log", "No error_log directive configured",
      "Reliability", "medium", "medium", ast.root,
      "No error_log directive found anywhere in config.",
      "Without explicit error_log, NGINX writes errors to compiled-in default. In containers, this may be inaccessible.",
      "Explicitly configure error_log.",
      `error_log /var/log/nginx/error.log warn;`,
      "NGINX error_log documentation"
    ));
  }
};

const ruleAccessLog: RuleFn = (ast, findings) => {
  const dirs = getAllDirectivesDeep(ast.root, "access_log");
  if (dirs.length === 0) {
    findings.push(finding(
      "rel-access-log", "No access_log directive configured",
      "Reliability", "low", "medium", ast.root,
      "No access_log directive found.",
      "Access logs are the primary source for debugging, traffic analysis, and incident investigation.",
      "Configure access_log with a structured format including upstream timing.",
      `log_format main '$remote_addr - [$time_local] "$request" $status rt=$request_time uct=$upstream_connect_time urt=$upstream_response_time';\naccess_log /var/log/nginx/access.log main;`,
      "NGINX access_log documentation"
    ));
  }
};

const ruleUpstreamHealth: RuleFn = (ast, findings) => {
  for (const upstream of getUpstreamBlocks(ast.root)) {
    const serverDirs = getDirectives(upstream, "server");
    for (const s of serverDirs) {
      const v = s.rawValue.toLowerCase();
      const hasMaxFails   = /max_fails\s*=/.test(v);
      const hasFailTimeout = /fail_timeout\s*=/.test(v);
      if (!hasMaxFails || !hasFailTimeout) {
        findings.push(finding(
          "rel-upstream-health", "Upstream server missing max_fails/fail_timeout",
          "Reliability", "medium", "high", upstream,
          `upstream server '${s.rawValue}' at ${s.file}:${s.line} missing health check parameters.`,
          "Without max_fails and fail_timeout, NGINX continues sending requests to a failed upstream server indefinitely.",
          "Add max_fails and fail_timeout to upstream server definitions.",
          `upstream backend {\n    server 10.0.0.1:3000 max_fails=3 fail_timeout=30s;\n    server 10.0.0.2:3000 max_fails=3 fail_timeout=30s;\n    keepalive 32;\n}`,
          "NGINX upstream server parameters"
        ));
        break; // one finding per upstream
      }
    }
  }
};

const ruleProxyNextUpstream: RuleFn = (ast, findings) => {
  for (const server of getServerBlocks(ast.root)) {
    if (!hasProxyPass(server)) continue;
    const dirs = getAllDirectivesDeep(server, "proxy_next_upstream");
    if (dirs.length === 0) {
      findings.push(finding(
        "rel-proxy-next-upstream", "proxy_next_upstream not configured",
        "Reliability", "low", "medium", server,
        `Proxy server at ${server.file}:${server.line} without proxy_next_upstream.`,
        "Without proxy_next_upstream, a failing backend sends the error directly to the client with no automatic retry.",
        "Configure proxy_next_upstream for automatic failover.",
        `proxy_next_upstream error timeout http_502 http_503 http_504;`,
        "NGINX proxy_next_upstream documentation"
      ));
    }
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
  for (const server of getServerBlocks(ast.root)) {
    if (!hasProxyPass(server)) continue;
    const errorPages = getAllDirectivesDeep(server, "error_page");
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
    if (err.message.includes("not provided")) {
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

// ─── RULE REGISTRY ────────────────────────────────────────────────────────────

export const ALL_RULES: RuleFn[] = [
  // Security
  ruleHsts,
  ruleXFrameOptions,
  ruleXContentTypeOptions,
  ruleCsp,
  ruleServerTokens,
  ruleLegacyTls,
  ruleSslProtocolsMissing,
  ruleWeakCiphers,
  ruleSslSessionCache,
  ruleAutoindex,
  ruleDotfileExposure,
  ruleHttpToHttpsRedirect,
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
  ruleIncludeWarning,
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