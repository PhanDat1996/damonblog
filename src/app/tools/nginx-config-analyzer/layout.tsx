// src/app/tools/nginx-config-analyzer/layout.tsx
//
// Server component — handles metadata for this route.
// Keeps page.tsx as "use client" (Next.js App Router requirement:
// generateMetadata and "use client" cannot coexist in the same file).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NGINX Config Analyzer — Security, Performance & Reliability Audit",
  description:
    "Paste any NGINX config and get a scored audit across 30+ rules — security headers, TLS, upstream keepalive, proxy headers, rate limiting, and reliability checks. Free, runs in-browser.",
  openGraph: {
    title: "NGINX Config Analyzer — damonsec.com",
    description:
      "Scored NGINX config audit: security, performance, reverse proxy, and reliability. 30+ context-aware rules. No data sent anywhere.",
    url: "https://www.damonsec.com/tools/nginx-config-analyzer",
    siteName: "damonsec.com",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NGINX Config Analyzer — damonsec.com",
    description:
      "Paste your NGINX config → scored audit across security, performance, reverse proxy, reliability. 30+ rules. Browser-only.",
  },
  alternates: {
    canonical: "https://www.damonsec.com/tools/nginx-config-analyzer",
  },
};

export default function NginxAnalyzerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}