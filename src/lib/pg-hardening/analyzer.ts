// lib/pg-hardening/analyzer.ts

import { parseHBA, parsePGConf } from "./parse.ts";
import { PG_RULES, type PGContext, type PGResult, type Severity } from "./rules.ts";

export type ScanStatus = "PASS" | "PARTIAL" | "FAIL" | "EMPTY";
export type RiskLabel  = "Excellent" | "Good" | "Needs Improvement" | "High Risk" | "No config";

export interface ScoreBreakdown {
  high: number; medium: number; low: number; passed: number; notApplicable: number;
}

export interface PGScanResult {
  results:    PGResult[];
  counts:     Record<Severity | "passed" | "notApplicable", number>;
  score:      number;
  status:     ScanStatus;
  riskLabel:  RiskLabel;
  message:    string;
  breakdown:  ScoreBreakdown;
  byCategory: Record<string, PGResult[]>;
  /** Which files were provided */
  hasPG:      boolean;
  hasHBA:     boolean;
}

export const PENALTY: Record<Severity, number> = { high: 10, medium: 5, low: 2 };

const STATUS_MESSAGES: Record<ScanStatus, string> = {
  FAIL:    "High-severity issues found. Fix these first.",
  PARTIAL: "No high-severity issues, but some hardening gaps remain.",
  PASS:    "No high or medium issues found by these checks.",
  EMPTY:   "Paste postgresql.conf and/or pg_hba.conf to scan them.",
};

function computeScore(b: ScoreBreakdown): number {
  let score = 100 - b.high * PENALTY.high - b.medium * PENALTY.medium - b.low * PENALTY.low;
  // Caps sit just below a label boundary, so any high issue rules out "Good"
  if      (b.high >= 3) score = Math.min(score, 39);
  else if (b.high === 2) score = Math.min(score, 49);
  else if (b.high === 1) score = Math.min(score, 69);
  return Math.max(0, score);
}

function computeStatus(b: ScoreBreakdown): ScanStatus {
  if (b.high > 0)   return "FAIL";
  if (b.medium > 0) return "PARTIAL";
  return "PASS";
}

function computeRiskLabel(score: number): RiskLabel {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Improvement";
  return "High Risk";
}

export function buildContext(pgConf: string, hbaConf: string): PGContext {
  const settings = parsePGConf(pgConf);
  const hba = parseHBA(hbaConf);
  return { hasPG: settings.size > 0, hasHBA: hba.length > 0, settings, hba };
}

export function scanConfigs(pgConf: string, hbaConf: string): PGScanResult {
  const ctx = buildContext(pgConf, hbaConf);

  const results: PGResult[] = PG_RULES.map((rule) => {
    let outcome: ReturnType<typeof rule.check> = { status: "n/a" };
    try { outcome = rule.check(ctx); } catch { /* rule error — treat as not applicable */ }
    return { rule, status: outcome.status, passed: outcome.status !== "fail", refs: outcome.refs ?? [], evidence: outcome.evidence };
  });

  const counts = { high: 0, medium: 0, low: 0, passed: 0, notApplicable: 0 };
  const byCategory: Record<string, PGResult[]> = {};
  for (const r of results) {
    if (r.status === "fail") counts[r.rule.severity]++;
    else if (r.status === "pass") counts.passed++;
    else counts.notApplicable++;
    (byCategory[r.rule.category] ??= []).push(r);
  }

  const empty = !ctx.hasPG && !ctx.hasHBA;
  const breakdown: ScoreBreakdown = { ...counts };
  const score  = empty ? 0 : computeScore(breakdown);
  const status = empty ? "EMPTY" : computeStatus(breakdown);

  return {
    results, counts, score, status,
    riskLabel: empty ? "No config" : computeRiskLabel(score),
    message:   STATUS_MESSAGES[status],
    breakdown, byCategory,
    hasPG: ctx.hasPG, hasHBA: ctx.hasHBA,
  };
}

export function generateQuickFix(results: PGResult[]): string {
  const order: Severity[] = ["high", "medium", "low"];
  const fixes = results
    .filter((r) => r.status === "fail")
    .sort((a, b) => order.indexOf(a.rule.severity) - order.indexOf(b.rule.severity))
    .map((r) => {
      const where = r.refs.slice(0, 3).map((x) => `${x.file}:${x.line}`).join(", ");
      return `# [${r.rule.id}] ${r.rule.title}${where ? ` (${where})` : ""}\n${r.rule.config_fix}`;
    })
    .join("\n\n");
  return fixes || "# No issues found — no fixes needed.";
}

export function generateHardenedPGConf(): string {
  return `# Hardened postgresql.conf baseline — damonsec.com PostgreSQL Hardening Checker
# Merge into your existing file; reload or restart PostgreSQL and check the log.

# Connections
listen_addresses = 'localhost'      # add the internal IP if applications connect over TCP
port             = 5432
max_connections  = 200

# Authentication
password_encryption = 'scram-sha-256'

# SSL
ssl                      = on
ssl_cert_file            = 'server.crt'
ssl_key_file             = 'server.key'
ssl_min_protocol_version = 'TLSv1.2'
ssl_ciphers              = 'HIGH:!aNULL:!MD5:!3DES'

# Timeouts
idle_in_transaction_session_timeout = '60s'
lock_timeout                        = '10s'

# Logging
logging_collector  = on
log_directory      = 'log'
log_filename       = 'postgresql-%Y-%m-%d.log'
log_rotation_age   = 1d
log_line_prefix    = '%m [%p] %q%u@%d %r '
log_connections    = on
log_disconnections = on
log_statement      = 'ddl'
log_lock_waits     = on

# Auditing (requires the pgaudit package and CREATE EXTENSION pgaudit)
shared_preload_libraries = 'pgaudit'
pgaudit.log              = 'ddl, role'

# Memory (size for your server)
shared_buffers       = 1GB
effective_cache_size = 3GB`;
}

export function generateHardenedHBAConf(): string {
  return `# Hardened pg_hba.conf baseline — damonsec.com PostgreSQL Hardening Checker
# First matching line wins. Replace appdb, appuser and the CIDR range.
#
# TYPE     DATABASE  USER      ADDRESS        METHOD

# Local socket: OS user must match the database role
local      all       postgres                 peer
local      all       all                      peer

# Loopback
host       all       all       127.0.0.1/32   scram-sha-256
host       all       all       ::1/128        scram-sha-256

# Application servers: SSL required, one role, one database
hostssl    appdb     appuser   10.0.1.0/24    scram-sha-256

# Everything else is rejected
host       all       all       0.0.0.0/0      reject
host       all       all       ::/0           reject`;
}
