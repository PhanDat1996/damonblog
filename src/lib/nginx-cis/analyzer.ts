// lib/nginx-cis/analyzer.ts
import { CIS_RULES, type CISResult, type Severity } from "./rules";

export type ScanStatus   = "PASS" | "PARTIAL" | "FAIL";
export type RiskLabel    = "Excellent" | "Good" | "Needs Improvement" | "High Risk";

export interface ScoreBreakdown {
  high:   number;
  medium: number;
  low:    number;
  passed: number;
}

export interface CISScanResult {
  results:    CISResult[];
  counts:     Record<Severity | "passed", number>;
  score:      number;
  status:     ScanStatus;
  riskLabel:  RiskLabel;
  message:    string;
  breakdown:  ScoreBreakdown;
  /** @deprecated use status */
  level:      "pass" | "partial" | "fail";
  byCategory: Record<string, CISResult[]>;
}

const PENALTY: Record<Severity, number> = { high: 10, medium: 5, low: 2 };

function computeScore(counts: ScoreBreakdown): number {
  // Base deduction
  let score =
    100 -
    counts.high   * PENALTY.high -
    counts.medium * PENALTY.medium -
    counts.low    * PENALTY.low;

  // High-severity cap — prevents misleading high scores when critical issues exist
  if (counts.high >= 3) score = Math.min(score, 40);
  else if (counts.high === 2) score = Math.min(score, 50);
  else if (counts.high === 1) score = Math.min(score, 70);

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
  FAIL:    "This configuration contains high-risk issues that should be fixed immediately.",
  PARTIAL: "This configuration is partially hardened but still has security gaps.",
  PASS:    "This configuration follows most security best practices.",
};

export function scanConfig(config: string): CISScanResult {
  const results: CISResult[] = CIS_RULES.map((rule) => {
    let passed = true;
    try { passed = !rule.check(config); } catch { /* skip */ }
    return { rule, passed };
  });

  const counts: Record<Severity | "passed", number> = { high: 0, medium: 0, low: 0, passed: 0 };
  const byCategory: Record<string, CISResult[]> = {};

  for (const r of results) {
    r.passed ? counts.passed++ : counts[r.rule.severity]++;
    (byCategory[r.rule.category] ??= []).push(r);
  }

  const breakdown: ScoreBreakdown = {
    high: counts.high, medium: counts.medium, low: counts.low, passed: counts.passed,
  };

  const score     = computeScore(breakdown);
  const status    = computeStatus(breakdown);
  const riskLabel = computeRiskLabel(score);

  return {
    results,
    counts,
    score,
    status,
    riskLabel,
    message:    STATUS_MESSAGES[status],
    breakdown,
    level:      status === "PASS" ? "pass" : status === "PARTIAL" ? "partial" : "fail",
    byCategory,
  };
}

export function levelLabel(level: CISScanResult["level"]): string {
  return { pass: "CIS Compliant", partial: "Partial Compliance", fail: "Non-Compliant" }[level];
}

export function generateHardenedConfig(): string {
  return `# ═══════════════════════════════════════════════════════
# CIS-Style Hardened NGINX Configuration
# Based on CIS-style NGINX hardening recommendations
# Tool: NGINX CIS Hardening Checker — damonsec.com
# Validate: nginx -t && nginx -T before applying
# ═══════════════════════════════════════════════════════

user              nginx;            # 2.1.1 — non-root worker process
worker_processes  auto;             # 2.2.1 — match available CPU cores
error_log         /var/log/nginx/error.log warn;

events {
    worker_connections 1024;
}

http {
    # ── Information Disclosure ─────────────────────────
    server_tokens off;              # 2.1.1 — suppress version in headers/errors

    # ── Performance ────────────────────────────────────
    sendfile          on;           # 4.1.5 — kernel zero-copy for static files
    tcp_nopush        on;
    tcp_nodelay       on;
    keepalive_timeout 65;           # 4.1.3
    client_max_body_size 50M;       # 4.1.4

    # ── Compression ────────────────────────────────────
    gzip            on;             # 4.1.2
    gzip_vary       on;
    gzip_min_length 1024;
    gzip_types      text/plain text/css application/json application/javascript
                    text/xml application/xml image/svg+xml;

    # ── Rate Limiting ──────────────────────────────────
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;  # 4.1.1

    # ── Logging ────────────────────────────────────────
    log_format main '$remote_addr [$time_local] "$request" $status '
                    'rt=$request_time urt=$upstream_response_time';
    access_log /var/log/nginx/access.log main;

    # ── Upstream Connection Pool ───────────────────────
    upstream backend {
        server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;               # 3.2.2 — connection reuse
    }

    # ── HTTP → HTTPS Redirect ──────────────────────────
    server {
        listen      80 default_server;
        server_name _;
        return 301  https://$host$request_uri;
    }

    # ── HTTPS Server ───────────────────────────────────
    server {
        listen      443 ssl http2;  # 2.1.4
        server_name example.com;

        # TLS Configuration ────────────────────────────
        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;           # 2.1.3
        ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;  # 2.1.7
        ssl_prefer_server_ciphers off;
        ssl_session_cache   shared:SSL:10m;             # 4.1.7
        ssl_session_timeout 1d;
        ssl_session_tickets off;
        ssl_stapling        on;
        ssl_stapling_verify on;
        resolver            8.8.8.8 1.1.1.1 valid=300s;

        # Security Headers ─────────────────────────────
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;  # 2.1.5
        add_header X-Frame-Options           "SAMEORIGIN" always;                           # 3.1.1
        add_header X-Content-Type-Options    "nosniff" always;                              # 3.1.2
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;      # 3.1.4
        add_header Content-Security-Policy   "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'" always;  # 3.1.3
        add_header Permissions-Policy        "geolocation=(), microphone=(), camera=(), payment=()" always;  # 4.1.6

        # Dotfile Protection ───────────────────────────
        location ~ /\\.(?!well-known) {                 # 2.1.6
            deny all;
            return 404;
        }

        # Application Proxy ────────────────────────────
        location / {
            limit_req zone=api burst=20 nodelay;        # 4.1.1

            proxy_pass         http://backend;
            proxy_http_version 1.1;                     # 3.2.1
            proxy_set_header   Connection         "";
            proxy_set_header   Host               $host;
            proxy_set_header   X-Real-IP          $remote_addr;
            proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;  # 3.2.3
            proxy_set_header   X-Forwarded-Proto  $scheme;

            proxy_connect_timeout  10s;
            proxy_send_timeout     60s;
            proxy_read_timeout     60s;
            proxy_next_upstream    error timeout http_502 http_503;
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
        }

        # Static Assets ────────────────────────────────
        location ~* \\.(jpg|jpeg|png|gif|ico|css|js|woff2?)$ {
            expires    1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        error_page 502 503 504 /50x.html;
        location = /50x.html { root /usr/share/nginx/html; internal; }
    }
}`;
}

export function generateQuickFix(results: CISResult[]): string {
  const fixes = results
    .filter((r) => !r.passed)
    .map((r) => `# Fix [${r.rule.id}] ${r.rule.title}\n${r.rule.config_fix}`)
    .join("\n\n");
  return fixes || "# No issues found — no fixes needed.";
}