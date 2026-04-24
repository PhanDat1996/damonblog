// samples.ts — sample configs for the analyzer
import type { ConfigFile } from "./types";

export const SAMPLE_CONFIGS: Record<string, { label: string; files: ConfigFile[] }> = {
  "basic-reverse-proxy": {
    label: "Basic reverse proxy",
    files: [{
      id: "main",
      filename: "nginx.conf",
      content: `server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}`,
    }],
  },

  "bad-production": {
    label: "Bad production config",
    files: [{
      id: "main",
      filename: "nginx.conf",
      content: `server {
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
    }],
  },

  "secure-https": {
    label: "Secure HTTPS server",
    files: [{
      id: "main",
      filename: "nginx.conf",
      content: `worker_processes auto;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 1024;
}

http {
    server_tokens off;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript;

    log_format main '$remote_addr - [$time_local] "$request" $status rt=$request_time urt=$upstream_response_time';
    access_log /var/log/nginx/access.log main;

    upstream backend {
        server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    server {
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
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;

        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Security-Policy "default-src 'self'" always;

        client_max_body_size 50M;
        keepalive_timeout 65;

        proxy_connect_timeout 10s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
        proxy_next_upstream   error timeout http_502 http_503;

        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location ~ /\\.(?!well-known) {
            deny all;
            return 404;
        }

        error_page 502 503 504 /50x.html;
        location = /50x.html { root /usr/share/nginx/html; internal; }
    }
}`,
    }],
  },

  "websocket-proxy": {
    label: "WebSocket proxy",
    files: [{
      id: "main",
      filename: "nginx.conf",
      content: `upstream ws_backend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name ws.example.com;

    location /ws/ {
        proxy_pass http://ws_backend;
        proxy_set_header Host $host;
        # Missing: Upgrade and Connection headers
    }

    location / {
        proxy_pass http://ws_backend;
    }
}`,
    }],
  },

  "upload-heavy": {
    label: "Upload-heavy app",
    files: [{
      id: "main",
      filename: "nginx.conf",
      content: `server {
    listen 80;
    server_name upload.example.com;

    location /upload {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        # Missing client_max_body_size — will 413 anything > 1MB
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
    }
}`,
    }],
  },

  "upstream-lb": {
    label: "Upstream load balancing",
    files: [{
      id: "main",
      filename: "nginx.conf",
      content: `upstream api_backend {
    # Missing: max_fails, fail_timeout, keepalive
    server 10.0.0.1:3000;
    server 10.0.0.2:3000;
    server 10.0.0.3:3000;
}

server {
    listen 80;
    server_name api.example.com;

    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Missing: proxy_http_version 1.1 for keepalive
    }
}`,
    }],
  },

  "multi-file": {
    label: "Multi-file with includes",
    files: [
      {
        id: "main",
        filename: "nginx.conf",
        content: `worker_processes auto;
error_log /var/log/nginx/error.log;

events {
    worker_connections 1024;
}

http {
    server_tokens off;
    include /etc/nginx/conf.d/api.conf;
    include /etc/nginx/conf.d/www.conf;
}`,
      },
      {
        id: "api",
        filename: "conf.d/api.conf",
        content: `upstream api {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    keepalive 16;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`,
      },
      {
        id: "www",
        filename: "conf.d/www.conf",
        content: `server {
    listen 443 ssl http2;
    server_name www.example.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    root /var/www/html;
    index index.html;
}`,
      },
    ],
  },
};

// ─── EXPORT HELPERS ───────────────────────────────────────────────────────────

import type { AnalysisResult } from "./types";

const CAT_ICONS: Record<string, string> = {
  Security: "🛡", Performance: "⚡", "Reverse Proxy": "🔀", Reliability: "📡", Maintainability: "🔧",
};

export function exportJson(result: AnalysisResult, domain: string): string {
  return JSON.stringify({
    tool: "nginx-config-analyzer",
    version: "2.0",
    analyzed_domain: domain || null,
    generated_at: new Date().toISOString(),
    overall_score: result.overallScore,
    status: result.status,
    category_scores: result.categoryScores,
    findings: result.findings,
    incomplete_analysis: result.hasIncompleteAnalysis,
    incomplete_reasons: result.incompleteReasons,
    parse_errors: result.parseErrors,
  }, null, 2);
}

export function exportMarkdown(result: AnalysisResult, domain: string): string {
  const lines: string[] = [
    `# NGINX Config Analysis Report`,
    ``,
    `**Domain:** ${domain || "N/A"}  `,
    `**Score:** ${result.overallScore}/100 — ${result.status}  `,
    `**Generated:** ${new Date().toLocaleString()}`,
    `**Findings:** ${result.findings.length} total`,
    ``,
    `## Category Scores`,
    ``,
    `| Category | Score | Findings |`,
    `|---|---|---|`,
    ...Object.values(result.categoryScores).map(
      (c) => `| ${CAT_ICONS[c.label] ?? ""} ${c.label} | ${c.score}/100 | ${c.findingCount} |`
    ),
    ``,
    `## Findings`,
    ``,
    ...result.findings.map((f, i) => [
      `### ${i + 1}. ${f.title}`,
      ``,
      `**Severity:** \`${f.severity}\` | **Category:** ${f.category} | **Confidence:** ${f.confidence}  `,
      `**File:** ${f.filename || "N/A"}:${f.line} | **Context:** ${f.contextPath}`,
      ``,
      `**Why it matters:** ${f.whyItMatters}`,
      ``,
      `**Evidence:** ${f.evidence}`,
      ``,
      `**Recommendation:** ${f.recommendation}`,
      ``,
      "```nginx",
      f.fixSnippet,
      "```",
      ``,
      `*Ref: ${f.reference}*`,
      ``,
    ].join("\n")),
  ];
  return lines.join("\n");
}

export function exportPatch(result: AnalysisResult): string {
  return result.findings
    .filter((f) => f.severity !== "info")
    .map((f) => `# Fix [${f.severity.toUpperCase()}]: ${f.title}\n# File: ${f.filename}:${f.line}\n${f.fixSnippet}`)
    .join("\n\n");
}