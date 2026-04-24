// scoring.ts — scoring engine
import type { Finding, AnalysisCategory, CategoryScore, ScoreStatus, AnalysisResult } from "./types";
import type { ParseResult } from "./types";
import { ALL_RULES } from "./rules";

const SEVERITY_WEIGHTS = { critical: 20, high: 12, medium: 7, low: 3, info: 0 } as const;
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
    const penalty = catFindings.reduce((s, f) => s + SEVERITY_WEIGHTS[f.severity], 0);
    categoryScores[cat] = { label: cat, score: Math.max(0, 100 - penalty), penalty, findingCount: catFindings.length };
  }

  const totalPenalty = findings.reduce((s, f) => s + SEVERITY_WEIGHTS[f.severity], 0);
  const overallScore = Math.max(0, 100 - totalPenalty);
  const incompleteReasons = ast.errors.filter((e) => e.message.includes("not provided")).map((e) => e.message);

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