import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PostgreSQL Hardening Checker — Security Audit Tool",
  description:
    "Paste your postgresql.conf and pg_hba.conf and get a structured security audit. Detects listen_addresses wildcards, trust auth, disabled SSL, weak password hashing, missing audit logging, and more. Free, browser-only.",
  alternates: { canonical: "https://www.damonsec.com/tools/pg-hardening-checker" },
  openGraph: {
    title: "PostgreSQL Hardening Checker — damonsec.com",
    description:
      "PostgreSQL hardening audit for postgresql.conf and pg_hba.conf: network exposure, authentication, SSL, logging and resource limits. Findings link to config lines with fixes.",
    url: "https://www.damonsec.com/tools/pg-hardening-checker",
    type: "website",
    siteName: "damonsec.com",
  },
  twitter: {
    card: "summary",
    title: "PostgreSQL Hardening Checker — damonsec.com",
    description: "Paste postgresql.conf + pg_hba.conf → hardening score and findings with config fixes. Runs in the browser.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}