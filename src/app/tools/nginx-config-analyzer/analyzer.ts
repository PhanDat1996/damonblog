// src/app/tools/nginx-config-analyzer/analyzer.ts
// Full NGINX config static analysis engine — runs entirely in browser

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type AnalysisCategory =
  | "Security"
  | "Performance"
  | "Reverse Proxy"
  | "Reliability"
  | "Maintainability";
export type Confidence = "high" | "medium" | "low";
export type ScoreStatus = "excellent" | "good" | "needs-improvement" | "risky";

export interface Finding {
  id: string;
  title: string;
  category: AnalysisCategory;
  severity: Severity;
  confidence: Confidence;
  whyItMatters: string;
  evidence: string;
  recommendation: string;
  fixSnippet: string;
  reference: string;
}

export interface CategoryScore {
  label: AnalysisCategory;
  score: number;
  maxScore: number;
  penalty: number;
  findingCount: number;
}

export interface AnalysisResult {
  overallScore: number;
  status: ScoreStatus;
  categoryScores: Record<AnalysisCategory, CategoryScore>;
  findings: Finding[];
  hasIncompleteAnalysis: boolean;
  incompleteReasons: string[];
  context: AnalysisContext;
}

export interface AnalysisContext {
  hasHttps: boolean;
  hasProxyPass: boolean;
  hasUpstreamBlock: boolean;
  hasUpstreamKeepalive: boolean;
  hasWebSocket: boolean;
  hasIncludeDirectives: boolean;
  serverBlockCount: number;
  locationBlockCount: number;
  listenPorts: number[];
}

// ─── SEVERITY WEIGHTS ────────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 20,
  high: 12,
  medium: 7,
  low: 3,
  info: 0,
};

const CATEGORY_MAX_SCORES: Record<AnalysisCategory, number> = {
  Security: 100,
  Performance: 100,
  "Reverse Proxy": 100,
  Reliability: 100,
  Maintainability: 100,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function stripComments(config: string): string {
  return config
    .split("\n")
    .map((line) => line.replace(/\s*#.*$/, ""))
    .join("\n");
}

function hasDirective(config: string, directive: string): boolean {
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*${escaped}\\b`, "i").test(config);
}

function directiveValue(config: string, directive: string): string[] {
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`^\\s*${escaped}\\s+([^;\\n]+);`, "gim");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(config)) !== null) out.push(m[1].trim());
  return out;
}

function countPattern(config: string, pattern: RegExp): number {
  return (config.match(pattern) ?? []).length;
}

function extractServerBlocks(config: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let inServer = false;

  for (let i = 0; i < config.length; i++) {
    if (config[i] === "{") {
      depth++;
      if (depth === 1 && /server\s*$/.test(config.slice(Math.max(0, i - 30), i).trim())) {
        inServer = true;
        start = i;
      }
    } else if (config[i] === "}") {
      if (depth === 1 && inServer) {
        blocks.push(config.slice(start, i + 1));
        inServer = false;
        start = -1;
      }
      depth--;
    }
  }
  return blocks;
}

function hasHeaderValue(addHeaderLines: string[], headerName: string): boolean {
  return addHeaderLines.some((v) => v.toLowerCase().includes(headerName.toLowerCase()));
}

// ─── CONTEXT DETECTION ───────────────────────────────────────────────────────

function detectContext(config: string): AnalysisContext {
  const clean = stripComments(config);
  const listenMatches = [...config.matchAll(/listen\s+(\d+)/gi)];
  const listenPorts = [...new Set(listenMatches.map((m) => parseInt(m[1])))];

  const hasHttps =
    /listen\s+443\b/i.test(clean) ||
    /ssl\s+on/i.test(clean) ||
    /listen\s+\d+\s+ssl\b/i.test(clean);

  const hasProxyPass = /proxy_pass\s+/i.test(clean);
  const hasUpstreamBlock = /^\s*upstream\s+\w+\s*\{/im.test(clean);
  const hasUpstreamKeepalive = hasUpstreamBlock && /keepalive\s+\d+/i.test(clean);
  const hasWebSocket =
    /websocket/i.test(clean) ||
    /upgrade\s+\$http_upgrade/i.test(clean) ||
    /\/ws\b/i.test(clean) ||
    /\/socket/i.test(clean);
  const hasIncludeDirectives = /^\s*include\s+/im.test(clean);

  return {
    hasHttps,
    hasProxyPass,
    hasUpstreamBlock,
    hasUpstreamKeepalive,
    hasWebSocket,
    hasIncludeDirectives,
    serverBlockCount: countPattern(clean, /^\s*server\s*\{/gim),
    locationBlockCount: countPattern(clean, /^\s*location\s+/gim),
    listenPorts,
  };
}

// ─── RULE DEFINITIONS ────────────────────────────────────────────────────────

type RuleFn = (config: string, ctx: AnalysisContext) => Finding | null;

const SECURITY_RULES: RuleFn[] = [
  // HSTS — only flag if HTTPS is present
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    const headers = directiveValue(config, "add_header");
    if (hasHeaderValue(headers, "strict-transport-security")) return null;
    return {
      id: "sec-missing-hsts",
      title: "Missing HSTS header on HTTPS server block",
      category: "Security",
      severity: "high",
      confidence: "high",
      whyItMatters:
        "Without HSTS, browsers accept HTTP connections even when HTTPS is available, enabling SSL stripping attacks. Once set, HSTS is cached by browsers for the max-age duration.",
      evidence: "HTTPS listener detected but no add_header Strict-Transport-Security directive found.",
      recommendation:
        'Add inside your HTTPS server block: add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
      fixSnippet: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
      reference: "RFC 6797 — HTTP Strict Transport Security",
    };
  },

  // X-Frame-Options
  (config) => {
    const headers = directiveValue(config, "add_header");
    if (hasHeaderValue(headers, "x-frame-options") || hasHeaderValue(headers, "frame-ancestors")) return null;
    return {
      id: "sec-missing-xfo",
      title: "Missing X-Frame-Options header",
      category: "Security",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without X-Frame-Options or CSP frame-ancestors, your pages can be embedded in iframes on attacker-controlled sites — enabling clickjacking attacks.",
      evidence: "No add_header X-Frame-Options or Content-Security-Policy with frame-ancestors detected.",
      recommendation: 'Add: add_header X-Frame-Options "SAMEORIGIN" always;',
      fixSnippet: `add_header X-Frame-Options "SAMEORIGIN" always;`,
      reference: "OWASP Clickjacking Defense Cheat Sheet",
    };
  },

  // X-Content-Type-Options
  (config) => {
    const headers = directiveValue(config, "add_header");
    if (hasHeaderValue(headers, "x-content-type-options")) return null;
    return {
      id: "sec-missing-xcto",
      title: "Missing X-Content-Type-Options: nosniff",
      category: "Security",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without nosniff, browsers may interpret files as a different MIME type than declared, enabling MIME-confusion attacks and drive-by downloads.",
      evidence: "No add_header X-Content-Type-Options directive found.",
      recommendation: 'Add: add_header X-Content-Type-Options "nosniff" always;',
      fixSnippet: `add_header X-Content-Type-Options "nosniff" always;`,
      reference: "MDN Web Docs — X-Content-Type-Options",
    };
  },

  // CSP
  (config) => {
    const headers = directiveValue(config, "add_header");
    if (hasHeaderValue(headers, "content-security-policy")) return null;
    return {
      id: "sec-missing-csp",
      title: "Missing Content-Security-Policy header",
      category: "Security",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "CSP is the primary defense against XSS. Without it, injected scripts run with full page context. Even a basic policy (default-src 'self') reduces the attack surface significantly.",
      evidence: "No add_header Content-Security-Policy directive found.",
      recommendation:
        "Start with report-only mode: add_header Content-Security-Policy-Report-Only \"default-src 'self'\" always; then tighten over time.",
      fixSnippet: `# Start permissive, tighten incrementally\nadd_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;`,
      reference: "OWASP CSP Cheat Sheet",
    };
  },

  // server_tokens
  (config) => {
    const vals = directiveValue(config, "server_tokens");
    if (vals.some((v) => v.toLowerCase() === "off")) return null;
    return {
      id: "sec-server-tokens",
      title: "server_tokens not explicitly disabled",
      category: "Security",
      severity: "low",
      confidence: "high",
      whyItMatters:
        "Default is on — NGINX version leaks in every Server response header and error page body. This assists attackers in targeting version-specific CVEs.",
      evidence: vals.length ? `server_tokens set to: ${vals.join(", ")}` : "No server_tokens directive found (defaults to on).",
      recommendation: "Add server_tokens off; in the http{} block.",
      fixSnippet: `http {\n    server_tokens off;\n    # ...\n}`,
      reference: "NGINX security hardening best practices",
    };
  },

  // Legacy TLS
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    const protocols = directiveValue(config, "ssl_protocols").join(" ").toLowerCase();
    if (!protocols) return null;
    if (!/(tlsv1\b|tlsv1\.1\b)/.test(protocols)) return null;
    return {
      id: "sec-legacy-tls",
      title: "Legacy TLS versions enabled (TLS 1.0 / 1.1)",
      category: "Security",
      severity: "high",
      confidence: "high",
      whyItMatters:
        "TLS 1.0 and 1.1 are deprecated by RFC 8996 and vulnerable to BEAST, POODLE, and SWEET32 attacks. Will fail PCI-DSS, SOC 2, and most enterprise compliance audits.",
      evidence: `ssl_protocols configured as: ${protocols}`,
      recommendation: "Use only TLS 1.2 and 1.3.",
      fixSnippet: `ssl_protocols TLSv1.2 TLSv1.3;`,
      reference: "RFC 8996 — Deprecating TLS 1.0 and 1.1",
    };
  },

  // ssl_protocols missing on HTTPS
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    if (hasDirective(config, "ssl_protocols")) return null;
    return {
      id: "sec-ssl-protocols-missing",
      title: "ssl_protocols not explicitly configured",
      category: "Security",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without an explicit ssl_protocols directive, NGINX uses its compiled-in defaults which may include TLS 1.0/1.1 depending on version.",
      evidence: "HTTPS listener detected but no ssl_protocols directive found.",
      recommendation: "Explicitly set ssl_protocols to prevent relying on defaults.",
      fixSnippet: `ssl_protocols TLSv1.2 TLSv1.3;`,
      reference: "NGINX SSL module documentation",
    };
  },

  // Weak ciphers
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    const ciphers = directiveValue(config, "ssl_ciphers").join(" ").toUpperCase();
    if (!ciphers) return null;
    const weakPatterns = ["RC4", "MD5", "DES", "3DES", "NULL", "EXPORT", "ANON", "ADH", "AECDH"];
    const found = weakPatterns.filter((p) => ciphers.includes(p));
    if (found.length === 0) return null;
    return {
      id: "sec-weak-ciphers",
      title: "Weak cipher suites detected in ssl_ciphers",
      category: "Security",
      severity: "high",
      confidence: "high",
      whyItMatters:
        "Weak ciphers (RC4, MD5, DES, NULL, EXPORT) have known cryptographic vulnerabilities and should never be offered in TLS negotiations.",
      evidence: `Weak cipher patterns found: ${found.join(", ")} in ssl_ciphers value.`,
      recommendation: "Use Mozilla's modern or intermediate cipher list.",
      fixSnippet: `ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;\nssl_prefer_server_ciphers off;`,
      reference: "Mozilla SSL Configuration Generator",
    };
  },

  // ssl_prefer_server_ciphers
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    if (hasDirective(config, "ssl_prefer_server_ciphers")) return null;
    return {
      id: "sec-ssl-prefer-server-ciphers",
      title: "ssl_prefer_server_ciphers not set",
      category: "Security",
      severity: "low",
      confidence: "medium",
      whyItMatters:
        "For TLS 1.2, not setting this allows clients to choose cipher order, which may prefer weaker suites. For TLS 1.3 this is irrelevant, but explicit configuration avoids ambiguity.",
      evidence: "No ssl_prefer_server_ciphers directive found.",
      recommendation: "Set ssl_prefer_server_ciphers off; (recommended for TLS 1.3-forward configs).",
      fixSnippet: `ssl_prefer_server_ciphers off;`,
      reference: "Mozilla SSL Configuration Generator — Modern profile",
    };
  },

  // Rate limiting on sensitive paths
  (config) => {
    const hasRateLimit = hasDirective(config, "limit_req_zone") || hasDirective(config, "limit_req");
    const hasSensitivePaths = /location\s+[~*\s]*\/(login|auth|api|admin|wp-login|signin|signup)/i.test(config);
    if (!hasSensitivePaths) return null;
    if (hasRateLimit) return null;
    return {
      id: "sec-no-rate-limit",
      title: "Sensitive endpoints exposed without rate limiting",
      category: "Security",
      severity: "high",
      confidence: "medium",
      whyItMatters:
        "Login, API, and authentication endpoints without rate limiting are trivially brute-forced. Credential stuffing tools make 10,000+ attempts per minute.",
      evidence: "Location blocks for /login, /api, /auth, or /admin detected without limit_req directives.",
      recommendation:
        "Define a rate limit zone and apply it to sensitive locations.",
      fixSnippet: `# In http{} block:\nlimit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;\n\n# In sensitive location:\nlocation /login {\n    limit_req zone=auth burst=10 nodelay;\n    # ...\n}`,
      reference: "NGINX limit_req_zone documentation",
    };
  },

  // autoindex on
  (config) => {
    const vals = directiveValue(config, "autoindex");
    if (!vals.some((v) => v.toLowerCase() === "on")) return null;
    return {
      id: "sec-autoindex-on",
      title: "Directory listing enabled (autoindex on)",
      category: "Security",
      severity: "high",
      confidence: "high",
      whyItMatters:
        "autoindex on exposes your entire directory structure to anyone who requests a path without an index file. This can leak sensitive files, configs, and backup files.",
      evidence: "autoindex on directive detected.",
      recommendation: "Remove autoindex on or explicitly set autoindex off.",
      fixSnippet: `autoindex off;`,
      reference: "NGINX autoindex module — security implications",
    };
  },

  // Hidden files accessible
  (config) => {
    const hasDotfileProtection =
      /location\s+[~*]+\s+["']?\\?\.(git|env|htaccess|htpasswd)/i.test(config) ||
      /location\s+[~*]+\s+["']?\/\.\w/i.test(config);
    if (hasDotfileProtection) return null;
    return {
      id: "sec-dotfiles-exposed",
      title: "No protection against hidden file access (.git, .env, .htaccess)",
      category: "Security",
      severity: "critical",
      confidence: "medium",
      whyItMatters:
        "Without blocking access to dotfiles, .git directories expose full source history, .env files expose credentials and API keys, and .htaccess files can be read directly.",
      evidence: "No location block found blocking access to .git, .env, or .htaccess paths.",
      recommendation: "Add a location block to deny all access to hidden files.",
      fixSnippet: `location ~ /\\.(?!well-known) {\n    deny all;\n    return 404;\n}`,
      reference: "OWASP Configuration Security — Sensitive File Exposure",
    };
  },
];

const PERFORMANCE_RULES: RuleFn[] = [
  // gzip / brotli
  (config) => {
    if (hasDirective(config, "gzip") || /brotli\s+on/i.test(config)) return null;
    return {
      id: "perf-no-compression",
      title: "Response compression not enabled",
      category: "Performance",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Uncompressed text responses (HTML, CSS, JS, JSON) are typically 5–10x larger. Compression reduces bandwidth cost and Time to First Byte for all clients.",
      evidence: "No gzip or brotli compression directives found.",
      recommendation: "Enable gzip compression in the http{} block.",
      fixSnippet: `gzip on;\ngzip_vary on;\ngzip_min_length 1024;\ngzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;`,
      reference: "NGINX ngx_http_gzip_module documentation",
    };
  },

  // client_max_body_size
  (config) => {
    if (hasDirective(config, "client_max_body_size")) return null;
    return {
      id: "perf-client-body-size",
      title: "client_max_body_size not explicitly configured",
      category: "Performance",
      severity: "low",
      confidence: "high",
      whyItMatters:
        "Default is 1MB. File upload endpoints silently return 413 Request Entity Too Large for anything larger. This is one of the most common production surprises.",
      evidence: "No client_max_body_size directive found.",
      recommendation: "Set client_max_body_size to match your application's maximum upload requirement.",
      fixSnippet: `client_max_body_size 50M;  # adjust to match your app's max upload`,
      reference: "NGINX client_max_body_size documentation",
    };
  },

  // keepalive_timeout
  (config) => {
    if (hasDirective(config, "keepalive_timeout")) return null;
    return {
      id: "perf-keepalive-timeout",
      title: "keepalive_timeout not explicitly configured",
      category: "Performance",
      severity: "low",
      confidence: "medium",
      whyItMatters:
        "Without explicit keepalive tuning, connection management relies on compiled-in defaults. Too high wastes worker connections on idle clients; not set means unpredictable behavior under load.",
      evidence: "No keepalive_timeout directive found.",
      recommendation: "Set an explicit keepalive_timeout appropriate for your traffic profile.",
      fixSnippet: `keepalive_timeout 65;`,
      reference: "NGINX keepalive_timeout documentation",
    };
  },

  // worker_processes
  (config) => {
    const vals = directiveValue(config, "worker_processes");
    if (vals.some((v) => v.toLowerCase() === "auto")) return null;
    if (!vals.length) {
      return {
        id: "perf-worker-processes-missing",
        title: "worker_processes not configured",
        category: "Performance",
        severity: "medium",
        confidence: "medium",
        whyItMatters:
          "Without worker_processes, NGINX defaults to 1 worker regardless of CPU core count, underutilizing multi-core systems.",
        evidence: "No worker_processes directive found.",
        recommendation: "Set worker_processes auto; to automatically match CPU cores.",
        fixSnippet: `worker_processes auto;`,
        reference: "NGINX worker_processes documentation",
      };
    }
    const val = parseInt(vals[0]);
    if (val === 1) {
      return {
        id: "perf-worker-processes-one",
        title: "worker_processes set to 1 — not utilizing multiple CPU cores",
        category: "Performance",
        severity: "medium",
        confidence: "high",
        whyItMatters:
          "A single worker processes all connections serially relative to other workers. On multi-core systems, setting worker_processes auto utilizes all available cores.",
        evidence: `worker_processes ${val} detected.`,
        recommendation: "Use worker_processes auto;",
        fixSnippet: `worker_processes auto;`,
        reference: "NGINX worker_processes documentation",
      };
    }
    return null;
  },

  // worker_connections
  (config) => {
    const vals = directiveValue(config, "worker_connections");
    if (!vals.length) {
      return {
        id: "perf-worker-connections-missing",
        title: "worker_connections not configured",
        category: "Performance",
        severity: "medium",
        confidence: "medium",
        whyItMatters:
          "NGINX defaults to 512 worker_connections. Under moderate load this becomes a bottleneck — each worker hits its connection limit and new connections queue or are refused.",
        evidence: "No worker_connections directive found in events{} block.",
        recommendation: "Set worker_connections in the events{} block.",
        fixSnippet: `events {\n    worker_connections 1024;\n}`,
        reference: "NGINX worker_connections documentation",
      };
    }
    const val = parseInt(vals[0]);
    if (val < 512) {
      return {
        id: "perf-worker-connections-low",
        title: `worker_connections set too low (${val})`,
        category: "Performance",
        severity: "medium",
        confidence: "high",
        whyItMatters: `With worker_connections ${val}, each worker can handle at most ${val} simultaneous connections. Under production load this becomes a hard ceiling.`,
        evidence: `worker_connections ${val} detected.`,
        recommendation: "Increase to at least 1024 for production, 4096 for high-traffic deployments.",
        fixSnippet: `events {\n    worker_connections 1024;\n}`,
        reference: "NGINX events module documentation",
      };
    }
    return null;
  },

  // sendfile
  (config) => {
    if (hasDirective(config, "sendfile")) return null;
    return {
      id: "perf-sendfile-missing",
      title: "sendfile not enabled",
      category: "Performance",
      severity: "low",
      confidence: "medium",
      whyItMatters:
        "Without sendfile, NGINX copies file data through userspace buffers. sendfile uses the kernel's zero-copy mechanism, reducing CPU overhead for static file serving.",
      evidence: "No sendfile directive found.",
      recommendation: "Enable sendfile in the http{} block.",
      fixSnippet: `sendfile on;\ntcp_nopush on;\ntcp_nodelay on;`,
      reference: "NGINX sendfile documentation",
    };
  },

  // proxy_buffering disabled globally
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    const vals = directiveValue(config, "proxy_buffering");
    if (!vals.some((v) => v.toLowerCase() === "off")) return null;
    return {
      id: "perf-proxy-buffering-off",
      title: "proxy_buffering disabled globally",
      category: "Performance",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "With proxy_buffering off, NGINX sends upstream responses directly to clients as they arrive. For slow clients this keeps upstream connections open longer, reducing upstream throughput.",
      evidence: "proxy_buffering off detected at a global level.",
      recommendation:
        "Enable proxy_buffering globally and disable only for specific locations that require streaming (SSE, long-polling).",
      fixSnippet: `# In http{} or server{} block:\nproxy_buffering on;\nproxy_buffer_size 4k;\nproxy_buffers 8 4k;\n\n# Only disable for streaming endpoints:\nlocation /events {\n    proxy_buffering off;\n}`,
      reference: "NGINX proxy_buffering documentation",
    };
  },

  // proxy_read_timeout
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    const vals = directiveValue(config, "proxy_read_timeout");
    if (!vals.length) {
      return {
        id: "perf-proxy-read-timeout-missing",
        title: "proxy_read_timeout not configured",
        category: "Performance",
        severity: "medium",
        confidence: "high",
        whyItMatters:
          "Default is 60 seconds. Long-running backend operations (report generation, data exports, batch processing) will 504 before completing, even when the backend will eventually respond.",
        evidence: "proxy_pass detected but no proxy_read_timeout directive found.",
        recommendation: "Set proxy timeouts based on your backend's actual p99 latency.",
        fixSnippet: `proxy_connect_timeout 10s;\nproxy_send_timeout    60s;\nproxy_read_timeout    60s;  # increase for long-running operations`,
        reference: "NGINX proxy timeout documentation",
      };
    }
    return null;
  },

  // upstream keepalive missing when upstream block exists
  (config, ctx) => {
    if (!ctx.hasUpstreamBlock) return null;
    if (ctx.hasUpstreamKeepalive) return null;
    return {
      id: "perf-upstream-keepalive-missing",
      title: "upstream keepalive not configured",
      category: "Performance",
      severity: "high",
      confidence: "high",
      whyItMatters:
        "Without upstream keepalive, NGINX opens a new TCP connection for every proxied request. Under load this exhausts ephemeral ports (causing EADDRINUSE / ETIMEDOUT errors) and adds TCP handshake overhead to every request.",
      evidence: "upstream{} block detected without a keepalive directive.",
      recommendation:
        "Add keepalive to your upstream block and ensure proxy_http_version 1.1 and correct Connection header.",
      fixSnippet: `upstream backend {\n    server 127.0.0.1:3000;\n    keepalive 32;  # maintain up to 32 idle connections per worker\n}\n\nlocation / {\n    proxy_pass http://backend;\n    proxy_http_version 1.1;\n    proxy_set_header Connection "";\n}`,
      reference: "NGINX upstream keepalive documentation",
    };
  },

  // HTTP/2
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    if (/listen\s+443\s+ssl\s+http2/i.test(config) || /http2\s+on/i.test(config)) return null;
    return {
      id: "perf-no-http2",
      title: "HTTP/2 not enabled on TLS listener",
      category: "Performance",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "HTTP/2 provides multiplexing (multiple requests per connection), header compression, and server push. Without it, each resource requires a separate TCP connection or queues behind others on HTTP/1.1.",
      evidence: "HTTPS listener detected but http2 not enabled.",
      recommendation: "Add http2 to the listen directive or use the http2 directive (NGINX 1.25.1+).",
      fixSnippet: `# NGINX < 1.25.1:\nlisten 443 ssl http2;\n\n# NGINX >= 1.25.1:\nlisten 443 ssl;\nhttp2 on;`,
      reference: "NGINX HTTP/2 module documentation",
    };
  },
];

const REVERSE_PROXY_RULES: RuleFn[] = [
  // proxy_pass without Host header
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    if (/proxy_set_header\s+Host\s+/i.test(config)) return null;
    return {
      id: "rp-missing-host-header",
      title: "proxy_pass found without Host header forwarding",
      category: "Reverse Proxy",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without forwarding the Host header, the upstream receives the proxy's address as the host, not the original request hostname. This breaks virtual hosting, URL generation, and any host-based routing in the backend.",
      evidence: "proxy_pass detected without proxy_set_header Host.",
      recommendation: "Add proxy_set_header Host $host; to your proxy location.",
      fixSnippet: `proxy_set_header Host              $host;\nproxy_set_header X-Real-IP         $remote_addr;\nproxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;`,
      reference: "NGINX reverse proxy — header forwarding",
    };
  },

  // X-Real-IP
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    if (/proxy_set_header\s+X-Real-IP\s+/i.test(config)) return null;
    return {
      id: "rp-missing-x-real-ip",
      title: "Missing X-Real-IP header forwarding",
      category: "Reverse Proxy",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without X-Real-IP, the backend cannot access the original client IP for access logging, rate limiting, geo-targeting, or IP-based security rules.",
      evidence: "proxy_pass found without proxy_set_header X-Real-IP.",
      recommendation: "Add proxy_set_header X-Real-IP $remote_addr;",
      fixSnippet: `proxy_set_header X-Real-IP $remote_addr;`,
      reference: "NGINX reverse proxy best practices",
    };
  },

  // X-Forwarded-For
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    if (/proxy_set_header\s+X-Forwarded-For\s+/i.test(config)) return null;
    return {
      id: "rp-missing-xff",
      title: "Missing X-Forwarded-For header forwarding",
      category: "Reverse Proxy",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without X-Forwarded-For, backend applications see 127.0.0.1 for every request. IP-based rate limiting, fraud detection, and security audit logs are all silently broken.",
      evidence: "proxy_pass found without proxy_set_header X-Forwarded-For.",
      recommendation: "Add proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      fixSnippet: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
      reference: "MDN Web Docs — X-Forwarded-For",
    };
  },

  // X-Forwarded-Proto
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    if (/proxy_set_header\s+X-Forwarded-Proto\s+/i.test(config)) return null;
    return {
      id: "rp-missing-xfp",
      title: "Missing X-Forwarded-Proto header forwarding",
      category: "Reverse Proxy",
      severity: "low",
      confidence: "high",
      whyItMatters:
        "Without X-Forwarded-Proto, backend apps cannot determine if the original request was HTTP or HTTPS. This breaks HTTPS-aware redirect logic, secure cookie flags, and HSTS enforcement in the application layer.",
      evidence: "proxy_pass found without proxy_set_header X-Forwarded-Proto.",
      recommendation: "Add proxy_set_header X-Forwarded-Proto $scheme;",
      fixSnippet: `proxy_set_header X-Forwarded-Proto $scheme;`,
      reference: "RFC 7239 — Forwarded HTTP Extension",
    };
  },

  // proxy_http_version 1.1 for upstream keepalive
  (config, ctx) => {
    if (!ctx.hasUpstreamKeepalive) return null;
    if (/proxy_http_version\s+1\.1/i.test(config)) return null;
    return {
      id: "rp-proxy-http-version",
      title: "proxy_http_version 1.1 not set with upstream keepalive",
      category: "Reverse Proxy",
      severity: "high",
      confidence: "high",
      whyItMatters:
        "upstream keepalive requires HTTP/1.1 to work. Without proxy_http_version 1.1, NGINX uses HTTP/1.0 which closes connections after each request, defeating the keepalive configuration entirely.",
      evidence: "upstream keepalive detected but proxy_http_version 1.1 not set.",
      recommendation: "Add proxy_http_version 1.1; and proxy_set_header Connection \"\"; to proxy locations.",
      fixSnippet: `proxy_http_version 1.1;\nproxy_set_header Connection "";`,
      reference: "NGINX upstream keepalive — required directives",
    };
  },

  // WebSocket headers
  (config, ctx) => {
    if (!ctx.hasWebSocket) return null;
    const hasUpgrade = /proxy_set_header\s+Upgrade\s+/i.test(config);
    const hasConnection = /proxy_set_header\s+Connection\s+["']?Upgrade["']?/i.test(config);
    if (hasUpgrade && hasConnection) return null;
    return {
      id: "rp-websocket-headers",
      title: "WebSocket proxy location missing Upgrade/Connection headers",
      category: "Reverse Proxy",
      severity: "high",
      confidence: "medium",
      whyItMatters:
        "WebSocket connections require the Upgrade and Connection headers to be forwarded. Without them, the WebSocket handshake fails with a 400 or the connection degrades to regular HTTP.",
      evidence: "WebSocket-like path or Upgrade usage detected without proper proxy header forwarding.",
      recommendation: "Add the required WebSocket upgrade headers.",
      fixSnippet: `location /ws/ {\n    proxy_pass http://backend;\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade    $http_upgrade;\n    proxy_set_header Connection "upgrade";\n    proxy_set_header Host       $host;\n}`,
      reference: "NGINX WebSocket proxying documentation",
    };
  },
];

const RELIABILITY_RULES: RuleFn[] = [
  // error_log
  (config) => {
    if (hasDirective(config, "error_log")) return null;
    return {
      id: "rel-no-error-log",
      title: "No error_log directive configured",
      category: "Reliability",
      severity: "medium",
      confidence: "medium",
      whyItMatters:
        "Without an explicit error_log, NGINX writes errors to its compiled-in default path. In containers or non-standard environments, this may be inaccessible or silently discarded.",
      evidence: "No error_log directive found.",
      recommendation: "Explicitly configure error_log with an appropriate level.",
      fixSnippet: `error_log /var/log/nginx/error.log warn;`,
      reference: "NGINX error_log documentation",
    };
  },

  // access_log
  (config) => {
    if (hasDirective(config, "access_log")) return null;
    return {
      id: "rel-no-access-log",
      title: "No access_log directive configured",
      category: "Reliability",
      severity: "low",
      confidence: "medium",
      whyItMatters:
        "Access logs are the primary source of truth for debugging, incident investigation, and traffic analysis. Without them, you're blind to request patterns.",
      evidence: "No access_log directive found.",
      recommendation: "Configure access_log with a structured log format.",
      fixSnippet: `log_format main '$remote_addr - $remote_user [$time_local] "$request" '\n               '$status $body_bytes_sent "$http_referer" '\n               '"$http_user_agent" rt=$request_time uct=$upstream_connect_time uht=$upstream_header_time urt=$upstream_response_time';\n\naccess_log /var/log/nginx/access.log main;`,
      reference: "NGINX access_log documentation",
    };
  },

  // proxy_next_upstream
  (config, ctx) => {
    if (!ctx.hasProxyPass) return null;
    if (hasDirective(config, "proxy_next_upstream")) return null;
    return {
      id: "rel-no-proxy-next-upstream",
      title: "proxy_next_upstream not configured",
      category: "Reliability",
      severity: "low",
      confidence: "medium",
      whyItMatters:
        "Without proxy_next_upstream, a failing backend causes the error to go directly to the client. With it, NGINX automatically retries on the next available upstream server.",
      evidence: "proxy_pass detected but no proxy_next_upstream directive found.",
      recommendation: "Configure proxy_next_upstream to improve resilience during upstream failures.",
      fixSnippet: `proxy_next_upstream error timeout http_502 http_503 http_504;`,
      reference: "NGINX proxy_next_upstream documentation",
    };
  },

  // max_fails / fail_timeout on upstream servers
  (config, ctx) => {
    if (!ctx.hasUpstreamBlock) return null;
    const hasMaxFails = /max_fails\s*=/i.test(config);
    const hasFailTimeout = /fail_timeout\s*=/i.test(config);
    if (hasMaxFails && hasFailTimeout) return null;
    return {
      id: "rel-upstream-health",
      title: "Upstream server health check parameters not configured",
      category: "Reliability",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Without max_fails and fail_timeout, NGINX continues sending requests to a failed upstream server indefinitely. max_fails controls when a server is marked unhealthy; fail_timeout controls how long it stays that way.",
      evidence: "upstream{} block found without max_fails or fail_timeout on server entries.",
      recommendation: "Add max_fails and fail_timeout to upstream server definitions.",
      fixSnippet: `upstream backend {\n    server 10.0.0.1:3000 max_fails=3 fail_timeout=30s;\n    server 10.0.0.2:3000 max_fails=3 fail_timeout=30s;\n    keepalive 32;\n}`,
      reference: "NGINX upstream server parameters documentation",
    };
  },

  // No default_server
  (config) => {
    if (/default_server/i.test(config)) return null;
    if (countPattern(config, /^\s*server\s*\{/gim) <= 1) return null;
    return {
      id: "rel-no-default-server",
      title: "No default_server block defined with multiple server blocks",
      category: "Reliability",
      severity: "low",
      confidence: "medium",
      whyItMatters:
        "Without a default_server, NGINX uses the first server block as default. Requests to unmatched hostnames (e.g., direct IP access, scanners) are served by whichever server block appears first in config load order.",
      evidence: "Multiple server blocks detected but none designated as default_server.",
      recommendation: "Add a dedicated default_server block to handle unmatched requests.",
      fixSnippet: `# Catch-all for unmatched hostnames:\nserver {\n    listen 80 default_server;\n    listen [::]:80 default_server;\n    server_name _;\n    return 444;  # closes connection without response\n}`,
      reference: "NGINX server_name — default server",
    };
  },

  // No HTTP to HTTPS redirect
  (config, ctx) => {
    if (!ctx.hasHttps) return null;
    if (/listen\s+80\b/i.test(config) && /return\s+301\s+https:\/\//i.test(config)) return null;
    if (!/listen\s+80\b/i.test(config)) return null;
    return {
      id: "rel-no-http-redirect",
      title: "HTTP listener exists without redirect to HTTPS",
      category: "Reliability",
      severity: "medium",
      confidence: "high",
      whyItMatters:
        "Serving both HTTP and HTTPS without a redirect allows connections over unencrypted HTTP. Users who type the domain without https:// land on HTTP; bookmarks and cached links remain unencrypted.",
      evidence: "listen 80 and HTTPS listener detected, but no 301 redirect from HTTP to HTTPS.",
      recommendation: "Add a dedicated HTTP server block that redirects all traffic to HTTPS.",
      fixSnippet: `server {\n    listen 80;\n    listen [::]:80;\n    server_name example.com www.example.com;\n    return 301 https://$host$request_uri;\n}`,
      reference: "NGINX HTTP to HTTPS redirect",
    };
  },
];

const MAINTAINABILITY_RULES: RuleFn[] = [
  // Large config
  (config, ctx) => {
    if (ctx.serverBlockCount <= 5) return null;
    return {
      id: "maint-large-config",
      title: `Large configuration detected (${ctx.serverBlockCount} server blocks)`,
      category: "Maintainability",
      severity: "info",
      confidence: "high",
      whyItMatters:
        "Large monolithic configs are harder to audit, modify, and reason about. Splitting into per-site include files makes individual site configs independently testable.",
      evidence: `${ctx.serverBlockCount} server blocks detected in a single config.`,
      recommendation: "Consider splitting into per-site configs under /etc/nginx/conf.d/ or /etc/nginx/sites-enabled/.",
      fixSnippet: `# In nginx.conf:\nhttp {\n    include /etc/nginx/conf.d/*.conf;\n    include /etc/nginx/sites-enabled/*;\n}`,
      reference: "NGINX configuration organization best practices",
    };
  },

  // include directives — incomplete analysis warning
  (config, ctx) => {
    if (!ctx.hasIncludeDirectives) return null;
    return {
      id: "maint-include-directives",
      title: "include directives detected — analysis may be incomplete",
      category: "Maintainability",
      severity: "info",
      confidence: "high",
      whyItMatters:
        "This analyzer evaluates the pasted text as a single unit. include directives reference external files not available here. Findings may be missing or incorrect if critical directives are in included files.",
      evidence: "One or more include directives found in the config.",
      recommendation:
        "For complete analysis, manually concatenate included files or analyze each included file separately. Run nginx -T to get the full compiled config.",
      fixSnippet: `# Get full compiled config with all includes resolved:\nnginx -T | grep -v "^#" > /tmp/nginx-full.conf`,
      reference: "NGINX include directive documentation",
    };
  },
];

const ALL_RULES: RuleFn[] = [
  ...SECURITY_RULES,
  ...PERFORMANCE_RULES,
  ...REVERSE_PROXY_RULES,
  ...RELIABILITY_RULES,
  ...MAINTAINABILITY_RULES,
];

// ─── SCORING ─────────────────────────────────────────────────────────────────

function getScoreStatus(score: number): ScoreStatus {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs-improvement";
  return "risky";
}

function computeScores(findings: Finding[]): Record<AnalysisCategory, CategoryScore> {
  const categories: AnalysisCategory[] = [
    "Security",
    "Performance",
    "Reverse Proxy",
    "Reliability",
    "Maintainability",
  ];

  const result = {} as Record<AnalysisCategory, CategoryScore>;

  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat);
    const penalty = catFindings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
    const score = Math.max(0, 100 - penalty);
    result[cat] = {
      label: cat,
      score,
      maxScore: CATEGORY_MAX_SCORES[cat],
      penalty,
      findingCount: catFindings.length,
    };
  }

  return result;
}

// ─── MAIN ANALYZER ───────────────────────────────────────────────────────────

export function analyzeNginxConfig(rawConfig: string): AnalysisResult {
  if (!rawConfig.trim()) {
    const empty = {} as Record<AnalysisCategory, CategoryScore>;
    const cats: AnalysisCategory[] = ["Security", "Performance", "Reverse Proxy", "Reliability", "Maintainability"];
    for (const c of cats) empty[c] = { label: c, score: 0, maxScore: 100, penalty: 0, findingCount: 0 };
    return {
      overallScore: 0,
      status: "risky",
      categoryScores: empty,
      findings: [],
      hasIncompleteAnalysis: false,
      incompleteReasons: [],
      context: detectContext(""),
    };
  }

  const config = stripComments(rawConfig);
  const context = detectContext(rawConfig);
  const findings: Finding[] = [];

  for (const rule of ALL_RULES) {
    const finding = rule(config, context);
    if (finding) findings.push(finding);
  }

  const categoryScores = computeScores(findings);
  const totalPenalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
  const overallScore = Math.max(0, 100 - totalPenalty);

  const incompleteReasons: string[] = [];
  if (context.hasIncludeDirectives) {
    incompleteReasons.push("include directives detected — referenced files not analyzed");
  }

  return {
    overallScore,
    status: getScoreStatus(overallScore),
    categoryScores,
    findings,
    hasIncompleteAnalysis: incompleteReasons.length > 0,
    incompleteReasons,
    context,
  };
}

// ─── SAMPLE CONFIGS ──────────────────────────────────────────────────────────

export const SAMPLE_CONFIGS: Record<string, { label: string; config: string }> = {
  "basic-reverse-proxy": {
    label: "Basic reverse proxy",
    config: `server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}`,
  },
  "secure-https": {
    label: "Secure HTTPS server",
    config: `server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'self'" always;

    server_tokens off;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

upstream backend {
    server 127.0.0.1:3000;
    keepalive 32;
}`,
  },
  "bad-production": {
    label: "Bad production config",
    config: `server {
    listen 80;
    server_name _;
    autoindex on;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_buffering off;
    }

    location /admin {
        allow all;
        proxy_pass http://127.0.0.1:8080/admin;
    }
}`,
  },
  "websocket-proxy": {
    label: "WebSocket proxy",
    config: `upstream ws_backend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name ws.example.com;

    location /ws/ {
        proxy_pass http://ws_backend;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://ws_backend;
    }
}`,
  },
  "upload-heavy": {
    label: "Upload-heavy app",
    config: `server {
    listen 80;
    server_name upload.example.com;

    location /upload {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
    }
}`,
  },
};