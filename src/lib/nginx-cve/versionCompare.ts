// lib/nginx-cve/versionCompare.ts
// Semantic version comparison utilities for NGINX version strings

/**
 * Parse a version string like "1.24.0" into numeric parts.
 * Handles: "1.24.0", "1.24", "1.24.0.1"
 */
export function parseVersion(version: string): number[] {
  return version
    .trim()
    .split(".")
    .map((part) => parseInt(part.replace(/\D.*/, ""), 10))
    .filter((n) => !isNaN(n));
}

/**
 * Compare two version strings.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return  1;
  }
  return 0;
}

export function isLessThan(version: string, target: string): boolean {
  return compareVersions(version, target) === -1;
}

export function isLessOrEqual(version: string, target: string): boolean {
  return compareVersions(version, target) <= 0;
}

export function isGreaterThan(version: string, target: string): boolean {
  return compareVersions(version, target) === 1;
}

export function isGreaterOrEqual(version: string, target: string): boolean {
  return compareVersions(version, target) >= 0;
}

export function versionsEqual(a: string, b: string): boolean {
  return compareVersions(a, b) === 0;
}

/**
 * Normalize raw NGINX version input.
 * Handles:
 *   "1.24.0"
 *   "nginx/1.24.0"
 *   "nginx version: nginx/1.24.0"
 *   "nginx version: nginx/1.24.0 (Ubuntu)"
 *   "nginx/1.24.0 built by gcc..."
 *   "Server: nginx/1.24.0"
 *   "  1.24.0  " (plain with whitespace)
 */
export function extractVersion(input: string): string | null {
  const cleaned = input.trim();
  if (!cleaned) return null;

  // Pattern: nginx/X.Y.Z (most common formats)
  const slashMatch = cleaned.match(/nginx\/(\d+\.\d+(?:\.\d+)*)/i);
  if (slashMatch) return slashMatch[1];

  // Pattern: plain version string X.Y.Z
  const plainMatch = cleaned.match(/^(\d+\.\d+(?:\.\d+)*)$/);
  if (plainMatch) return plainMatch[1];

  // Pattern: version: nginx/X.Y.Z or version nginx/X.Y.Z
  const versionColonMatch = cleaned.match(/version:?\s+nginx\/(\d+\.\d+(?:\.\d+)*)/i);
  if (versionColonMatch) return versionColonMatch[1];

  // Pattern: any X.Y.Z surrounded by non-digit chars
  const anyVersionMatch = cleaned.match(/\b(\d+\.\d+\.\d+)\b/);
  if (anyVersionMatch) return anyVersionMatch[1];

  return null;
}

/**
 * Validate that a version string looks like a real NGINX version.
 * NGINX versions are typically X.Y.Z where X is 0 or 1.
 */
export function isValidNginxVersion(version: string): boolean {
  const parts = parseVersion(version);
  if (parts.length < 2) return false;
  if (parts[0] > 2) return false; // NGINX major is 0 or 1 historically
  if (parts[1] > 99) return false;
  return true;
}

/**
 * Get the "branch" of an NGINX version: mainline (odd minor) or stable (even minor)
 */
export function getNginxBranch(version: string): "mainline" | "stable" | "legacy" {
  const parts = parseVersion(version);
  if (parts.length < 2) return "legacy";
  const minor = parts[1];
  // NGINX 1.x: odd minor = mainline, even minor = stable
  // Starting from 1.25.x, mainline moves faster
  if (minor >= 25) return minor % 2 === 1 ? "mainline" : "stable";
  return minor % 2 === 1 ? "mainline" : "stable";
}