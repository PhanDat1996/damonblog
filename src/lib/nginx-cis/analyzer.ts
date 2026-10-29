// lib/nginx-cis/analyzer.ts
import { parseConfigs } from "../../app/tools/nginx-config-analyzer/v2/parser.ts";
import type { ParseError } from "../../app/tools/nginx-config-analyzer/v2/types.ts";
import { CIS_RULES, buildContext, type CISResult, type Severity } from "./rules.ts";

export type ScanStatus = "PASS" | "PARTIAL" | "FAIL" | "EMPTY";
export type RiskLabel  = "Excellent" | "Good" | "Needs Improvement" | "High Risk" | "No config";

export interface ScoreBreakdown {
  high:          number;
  medium:        number;
  low:           number;
  passed:        number;
  notApplicable: number;
}

export interface CISScanResult {
  results:      CISResult[];
  counts:       Record<Severity | "passed" | "notApplicable", number>;
  score:        number;
  status:       ScanStatus;
  riskLabel:    RiskLabel;
  message:      string;
  breakdown:    ScoreBreakdown;
  byCategory:   Record<string, CISResult[]>;
  syntaxErrors: ParseError[];
  /** Input is a conf.d-style snippet (no http/events block) */
  snippet:      boolean;
}

export const PENALTY: Record<Severity, number> = { high: 10, medium: 5, low: 2 };

function computeScore(counts: ScoreBreakdown, hasSyntaxErrors: boolean): number {
  let score = 100 - counts.high * PENALTY.high - counts.medium * PENALTY.medium - counts.low * PENALTY.low;

  // High-severity cap — prevents misleading high scores when serious issues exist
  // (caps sit just below a label boundary, so any high issue rules out "Good")
  if (counts.high >= 3) score = Math.min(score, 39);
  else if (counts.high === 2) score = Math.min(score, 49);
  else if (counts.high === 1) score = Math.min(score, 69);
  if (hasSyntaxErrors) score = Math.min(score, 49);

  return Math.max(0, score);
}

function computeStatus(counts: ScoreBreakdown): ScanStatus {
  if (counts.high > 0)   return "FAIL";
  if (counts.medium > 0) return "PARTIAL";
  return "PASS";
}

function computeRiskLabel(score: number): RiskLabel {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Improvement";
  return "High Risk";
}

const STATUS_MESSAGES: Record<ScanStatus, string> = {
  FAIL:    "High-severity issues found. Fix these first.",
  PARTIAL: "No high-severity issues, but some hardening gaps remain.",
  PASS:    "No high or medium issues found by these checks.",
  EMPTY:   "Paste an NGINX configuration to scan it.",
};

export function scanConfig(config: string): CISScanResult {
  const ast = parseConfigs([{ id: "main", filename: "nginx.conf", content: config }]);
  const ctx = buildContext(ast);
  const syntaxErrors = ast.errors.filter((e) => e.kind === "syntax");

  const results: CISResult[] = CIS_RULES.map((rule) => {
    let outcome: ReturnType<typeof rule.check> = { status: "n/a" };
    try { outcome = rule.check(ctx); } catch { /* rule error — treat as not applicable */ }
    return { rule, status: outcome.status, passed: outcome.status !== "fail", refs: outcome.refs ?? [], evidence: outcome.evidence };
  });

  const counts = { high: 0, medium: 0, low: 0, passed: 0, notApplicable: 0 };
  const byCategory: Record<string, CISResult[]> = {};
  for (const r of results) {
    if (r.status === "fail") counts[r.rule.severity]++;
    else if (r.status === "pass") counts.passed++;
    else counts.notApplicable++;
    (byCategory[r.rule.category] ??= []).push(r);
  }

  const empty = ast.root.directives.length === 0;
  const breakdown: ScoreBreakdown = { ...counts };
  const score  = empty ? 0 : computeScore(breakdown, syntaxErrors.length > 0);
  const status = empty ? "EMPTY" : computeStatus(breakdown);

  return {
    results,
    counts,
    score,
    status,
    riskLabel: empty ? "No config" : computeRiskLabel(score),
    message:   STATUS_MESSAGES[status],
    breakdown,
    byCategory,
    syntaxErrors,
    snippet:   !empty && !ctx.full,
  };
}

export function generateHardenedConfig(): string {
  return `# Hardened NGINX baseline — damonsec.com NGINX Hardening Checker
# Replace example.com, certificate paths and the upstream address.
# Validate with: nginx -t && nginx -T

user              nginx;
worker_processes  auto;
error_log         /var/log/nginx/error.log notice;

events {
    worker_connections 1024;
}

http {
    # Information disclosure
    server_tokens off;
    proxy_hide_header X-Powered-By;

    # Performance
    sendfile          on;
    tcp_nopush        on;
    keepalive_timeout 65;

    gzip            on;
    gzip_vary       on;
    gzip_min_length 1024;
    gzip_types      text/plain text/css application/json application/javascript
                    text/xml application/xml image/svg+xml;

    # Request limits
    client_max_body_size  1m;
    client_body_timeout   10s;
    client_header_timeout 10s;
    limit_req_zone  $binary_remote_addr zone=api:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=perip:10m;

    # Logging
    log_format main '$remote_addr [$time_local] "$request" $status '
                    'rt=$request_time urt=$upstream_response_time';
    access_log /var/log/nginx/access.log main;

    upstream backend {
        server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # HTTP -> HTTPS
    server {
        listen      80 default_server;
        server_name _;
        return 301  https://$host$request_uri;
    }

    server {
        listen      443 ssl;
        http2       on;
        server_name example.com;

        # TLS
        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
        ssl_prefer_server_ciphers off;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;
        ssl_session_tickets off;

        # Security headers (repeat them in any location that sets its own add_header)
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options           "SAMEORIGIN" always;
        add_header X-Content-Type-Options    "nosniff" always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy   "default-src 'self'; object-src 'none'; base-uri 'self'" always;
        add_header Permissions-Policy        "geolocation=(), microphone=(), camera=(), payment=()" always;

        limit_conn perip 20;

        if ($request_method !~ ^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$) {
            return 405;
        }

        # Hidden files (.git, .env, ...) except ACME challenges
        location ~ /\\.(?!well-known) {
            deny all;
            return 404;
        }

        location / {
            limit_req zone=api burst=20 nodelay;
            limit_req_status 429;

            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Connection         "";
            proxy_set_header   Host               $host;
            proxy_set_header   X-Real-IP          $remote_addr;
            proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto  $scheme;
        }

        location /static/ {
            root /var/www;
        }
    }
}`;
}

export function generateQuickFix(results: CISResult[]): string {
  const fixes = results
    .filter((r) => r.status === "fail")
    .map((r) => {
      const where = r.refs.slice(0, 3).map((x) => `line ${x.line}`).join(", ");
      return `# [${r.rule.id}] ${r.rule.title}${where ? ` (${where})` : ""}\n${r.rule.config_fix}`;
    })
    .join("\n\n");
  return fixes || "# No issues found — no fixes needed.";
}
