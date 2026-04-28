// src/app/tools/nginx-hardening-checker/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NGINX Hardening Checker — Security Audit Tool",
  description:
    "Paste your NGINX config and get a structured security report — missing headers, TLS misconfigurations, information disclosure risks, and performance gaps. Free, browser-only.",
  alternates: {
    canonical: "https://www.damonsec.com/tools/nginx-hardening-checker",
  },
  openGraph: {
    title: "NGINX Hardening Checker — damonsec.com",
    description:
      "Structured NGINX security audit: TLS config, security headers, information disclosure, rate limiting, and more. Scored report with exact config fixes.",
    url: "https://www.damonsec.com/tools/nginx-hardening-checker",
    type: "website",
    siteName: "damonsec.com",
  },
  twitter: {
    card: "summary",
    title: "NGINX Hardening Checker — damonsec.com",
    description:
      "Paste NGINX config → security score + categorized findings with config fixes. Runs in browser.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}