// scoring.ts — scoring engine
import type { Finding, AnalysisCategory, CategoryScore, ScoreStatus, AnalysisResult } from "./types.ts";
import type { ParseResult } from "./types.ts";
import { ALL_RULES } from "./rules.ts";

const SEVERITY_WEIGHTS = { critical: 20, high: 12, medium: 7, low: 3, info: 0 } as const;
const CONFIDENCE_FACTOR = { high: 1, medium: 0.75, low: 0.5 } as const;

// Overall score is a weighted average of category scores, so one category with
// many findings can't drive the total to zero on its own.
const CATEGORY_WEIGHTS: Record<AnalysisCategory, number> = {
  "Security":        0.35,
  "Reverse Proxy":   0.2,
  "Performance":     0.2,
  "Reliability":     0.15,
  "Maintainability": 0.1,
};

// Severe findings and syntax errors cap the overall status regardless of how
// clean the rest is (a config that fails nginx -t can't be "excellent").
const SCORE_CAPS = { syntax: 49, critical: 49, high: 64 } as const;

function penaltyOf(f: Finding): number {
  return Math.round(SEVERITY_WEIGHTS[f.severity] * CONFIDENCE_FACTOR[f.confidence]);
}
const ALL_CATEGORIES: AnalysisCategory[] = ["Security", "Performance", "Reverse Proxy", "Reliability", "Maintainability"];

function getStatus(score: number): ScoreStatus {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs-improvement";
  return "risky";
}

export function runAnalysis(ast: ParseResult): AnalysisResult {
  const findings: Finding[] = [];

  for (const rule of ALL_RULES) {
    try { rule(ast, findings); } catch { /* rule error — continue */ }
  }

  const categoryScores = {} as Record<AnalysisCategory, CategoryScore>;
  for (const cat of ALL_CATEGORIES) {
    const catFindings = findings.filter((f) => f.category === cat);
    const penalty = catFindings.reduce((s, f) => s + penaltyOf(f), 0);
    categoryScores[cat] = { label: cat, score: Math.max(0, 100 - penalty), penalty, findingCount: catFindings.length };
  }

  let overallScore = Math.round(ALL_CATEGORIES.reduce((s, cat) => s + categoryScores[cat].score * CATEGORY_WEIGHTS[cat], 0));
  if (ast.errors.some((e) => e.kind === "syntax")) overallScore = Math.min(overallScore, SCORE_CAPS.syntax);
  if (findings.some((f) => f.severity === "critical")) overallScore = Math.min(overallScore, SCORE_CAPS.critical);
  else if (findings.some((f) => f.severity === "high")) overallScore = Math.min(overallScore, SCORE_CAPS.high);

  const incompleteReasons = ast.errors.filter((e) => e.kind === "include").map((e) => e.message);

  return {
    overallScore,
    status: getStatus(overallScore),
    categoryScores,
    findings,
    hasIncompleteAnalysis: incompleteReasons.length > 0,
    incompleteReasons,
    parseErrors: ast.errors,
    ast,
  };
}