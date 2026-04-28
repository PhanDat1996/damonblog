// lib/nginx-cve/cveAnalyzer.ts
import {
  NGINX_CVE_DATABASE,
  LATEST_STABLE_VERSION,
  LATEST_MAINLINE_VERSION,
  type NginxCVE,
  type CVESeverity,
} from "./database";
import {
  extractVersion,
  isValidNginxVersion,
  isLessThan,
  isLessOrEqual,
  isGreaterOrEqual,
  isGreaterThan,
  getNginxBranch,
} from "./versionCompare";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConditionStatus =
  | "not_applicable"      // CVE has no conditions
  | "condition_detected"  // config snippet matches the condition
  | "condition_not_found" // CVE has a condition but config doesn't trigger it
  | "no_config"           // no config provided to check

export interface CVEMatch {
  cve:              NginxCVE;
  conditionStatus:  ConditionStatus;
  effectiveSeverity: CVESeverity; // may be downgraded if condition not met
}

export type RiskStatus =
  | "vulnerable"          // 1+ CVE matched
  | "no_cve_matched"      // version in DB range but no CVEs hit
  | "unknown_version"     // could not parse
  | "invalid_version"     // parsed but doesn't look like NGINX
  | "up_to_date"          // no CVEs, version is current

export interface CveAnalysisResult {
  rawInput:       string;
  detectedVersion: string | null;
  isValid:        boolean;
  branch:         "mainline" | "stable" | "legacy" | null;
  riskStatus:     RiskStatus;
  matches:        CVEMatch[];
  highestSeverity: CVESeverity | null;
  totalMatched:   number;
  recommendation: string;
  upgradeTarget:  string | null;
}

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEV_RANK: Record<CVESeverity, number> = {
  Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0,
};

export function highestSeverity(severities: CVESeverity[]): CVESeverity | null {
  if (severities.length === 0) return null;
  return severities.reduce((a, b) => SEV_RANK[a] >= SEV_RANK[b] ? a : b);
}

// ─── Range check ──────────────────────────────────────────────────────────────

function versionInRange(version: string, cve: NginxCVE): boolean {
  if (cve.vulnerable_range.length === 0) return false;

  // Version matches if it satisfies ANY of the ranges
  return cve.vulnerable_range.some((range) => {
    let matches = true;

    if (range.greaterOrEqual && !isGreaterOrEqual(version, range.greaterOrEqual)) matches = false;
    if (range.greaterThan    && !isGreaterThan(version, range.greaterThan))       matches = false;
    if (range.lessThan       && !isLessThan(version, range.lessThan))             matches = false;
    if (range.lessOrEqual    && !isLessOrEqual(version, range.lessOrEqual))       matches = false;

    return matches;
  });
}

// ─── Condition check ─────────────────────────────────────────────────────────

function checkCondition(cve: NginxCVE, config: string): ConditionStatus {
  if (!cve.condition_check) return "not_applicable";
  if (!config.trim())       return "no_config";

  // Strip comments from config before checking
  const stripped = config
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .join("\n");

  const found = stripped.toLowerCase().includes(cve.condition_check.toLowerCase());
  return found ? "condition_detected" : "condition_not_found";
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeCVEs(rawInput: string, config: string = ""): CveAnalysisResult {
  const base: Omit<CveAnalysisResult, "riskStatus" | "matches" | "highestSeverity" | "totalMatched" | "recommendation" | "upgradeTarget"> = {
    rawInput,
    detectedVersion: null,
    isValid:         false,
    branch:          null,
  };

  // Step 1 — extract version
  const version = extractVersion(rawInput);
  if (!version) {
    return {
      ...base,
      riskStatus:      "unknown_version",
      matches:         [],
      highestSeverity: null,
      totalMatched:    0,
      recommendation:  "Could not extract a version number from the input. Try formats like: nginx/1.24.0, nginx version: nginx/1.24.0, or just 1.24.0",
      upgradeTarget:   null,
    };
  }

  if (!isValidNginxVersion(version)) {
    return {
      ...base,
      detectedVersion: version,
      riskStatus:      "invalid_version",
      matches:         [],
      highestSeverity: null,
      totalMatched:    0,
      recommendation:  `"${version}" does not look like a valid NGINX version. NGINX versions are in the format X.Y.Z (e.g., 1.24.0).`,
      upgradeTarget:   null,
    };
  }

  const branch = getNginxBranch(version);

  // Step 2 — run CVE checks
  const matches: CVEMatch[] = [];

  for (const cve of NGINX_CVE_DATABASE) {
    if (!versionInRange(version, cve)) continue;

    const conditionStatus = checkCondition(cve, config);

    // If condition check showed it's definitely NOT present in config, downgrade display
    const effectiveSeverity: CVESeverity =
      conditionStatus === "condition_not_found"
        ? "Info"        // still show, but flag as likely not exploitable
        : cve.severity;

    matches.push({ cve, conditionStatus, effectiveSeverity });
  }

  // Sort: Critical first, then by CVSS score
  matches.sort((a, b) => {
    const diff = SEV_RANK[b.cve.severity] - SEV_RANK[a.cve.severity];
    if (diff !== 0) return diff;
    return b.cve.cvss_score - a.cve.cvss_score;
  });

  const activeMatches   = matches.filter((m) => m.conditionStatus !== "condition_not_found");
  const allSeverities   = activeMatches.map((m) => m.cve.severity);
  const highSev         = highestSeverity(allSeverities);
  const totalMatched    = matches.length;

  // Step 3 — determine upgrade target
  const upgradeTarget = branch === "mainline" ? LATEST_MAINLINE_VERSION : LATEST_STABLE_VERSION;

  // Step 4 — risk status + recommendation
  let riskStatus: RiskStatus;
  let recommendation: string;

  if (matches.length === 0) {
    riskStatus     = "up_to_date";
    recommendation = `NGINX ${version} has no known CVEs in our local database. Verify with the official NGINX security advisories for the latest information.`;
  } else {
    riskStatus = "vulnerable";
    const conditionNote = matches.some((m) => m.conditionStatus === "condition_not_found")
      ? " Some findings are marked lower risk because the relevant configuration was not detected."
      : "";
    recommendation = `Upgrade to NGINX ${upgradeTarget} (${branch}) immediately.${conditionNote} ${matches.length} CVE${matches.length > 1 ? "s" : ""} affect version ${version}.`;
  }

  return {
    rawInput,
    detectedVersion: version,
    isValid:         true,
    branch,
    riskStatus,
    matches,
    highestSeverity: highSev,
    totalMatched,
    recommendation,
    upgradeTarget,
  };
}