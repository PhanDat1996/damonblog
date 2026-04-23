// src/app/tools/nginx-config-analyzer/layout.tsx
//
// Server component — handles metadata for this route.
// Keeps page.tsx as "use client" (Next.js App Router requirement:
// generateMetadata and "use client" cannot coexist in the same file).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NGINX Config Analyzer",
  description:
    "Paste your NGINX config and get instant findings across security hardening gaps, missing headers, broken proxy setups, upload limits, and SEO redirect issues. Free, runs in-browser.",
  openGraph: {
    title: "NGINX Config Analyzer — damonsec.com",
    description:
      "Detect security hardening gaps, performance issues, SEO redirect problems, and reverse proxy misconfigurations in any NGINX config. Free, browser-only.",
    url: "https://www.damonsec.com/tools/nginx-config-analyzer",
    siteName: "damonsec.com",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NGINX Config Analyzer — damonsec.com",
    description:
      "Paste your NGINX config → instant scored report. Security headers, TLS, proxy headers, rate limiting, gzip, SEO redirects. Runs in-browser.",
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