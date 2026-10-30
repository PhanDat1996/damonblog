// lib/nginx-cve/types.ts

/** Severity as published by nginx.org */
export type AdvisorySeverity = "major" | "medium" | "low";

export interface VersionSpan {
  from: string;
  to:   string;   // inclusive
}

/** One entry of https://nginx.org/en/security_advisories.html */
export interface Advisory {
  id:            string;          // CVE id (or CORE-… for the one non-CVE entry)
  title:         string;
  severity:      AdvisorySeverity;
  advisoryUrl:   string | null;
  /** "1.30.6" means 1.30.6+ is fixed (nginx.org lists one entry per branch) */
  notVulnerable: string[];
  vulnerable:    VersionSpan[];
  windowsOnly:   boolean;
}
