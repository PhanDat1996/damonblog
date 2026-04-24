// types.ts — AST + analysis types for NGINX config analyzer

// ─── AST TYPES ────────────────────────────────────────────────────────────────

export type NginxContextType =
  | "main"
  | "events"
  | "http"
  | "server"
  | "location"
  | "upstream"
  | "geo"
  | "map"
  | "if"
  | "limit_except"
  | "unknown";

export interface NginxDirective {
  name: string;
  values: string[];          // split params, e.g. ["443", "ssl", "http2"]
  rawValue: string;          // original text after directive name
  line: number;
  col: number;
  file: string;
  block?: NginxBlock;        // present if this directive opens a block
}

export interface NginxBlock {
  contextType: NginxContextType;
  contextLabel: string;      // e.g. "server", "location /api", "upstream backend"
  contextPath: string;       // e.g. "http > server > location /api"
  line: number;
  file: string;
  directives: NginxDirective[];
  parent?: NginxBlock;
}

export interface ParseResult {
  root: NginxBlock;
  errors: ParseError[];
  files: string[];
}

export interface ParseError {
  message: string;
  line: number;
  file: string;
}

// ─── FILE INPUT ───────────────────────────────────────────────────────────────

export interface ConfigFile {
  id: string;
  filename: string;
  content: string;
}

// ─── FINDINGS ─────────────────────────────────────────────────────────────────

export type Severity     = "critical" | "high" | "medium" | "low" | "info";
export type Confidence   = "high" | "medium" | "low";
export type AnalysisCategory =
  | "Security"
  | "Performance"
  | "Reverse Proxy"
  | "Reliability"
  | "Maintainability";

export interface Finding {
  id:             string;
  title:          string;
  category:       AnalysisCategory;
  severity:       Severity;
  confidence:     Confidence;
  filename:       string;
  line:           number;
  contextPath:    string;
  evidence:       string;
  whyItMatters:   string;
  recommendation: string;
  fixSnippet:     string;
  reference:      string;
}

// ─── SCORING ──────────────────────────────────────────────────────────────────

export type ScoreStatus = "excellent" | "good" | "needs-improvement" | "risky";

export interface CategoryScore {
  label:        AnalysisCategory;
  score:        number;
  penalty:      number;
  findingCount: number;
}

export interface AnalysisResult {
  overallScore:          number;
  status:                ScoreStatus;
  categoryScores:        Record<AnalysisCategory, CategoryScore>;
  findings:              Finding[];
  hasIncompleteAnalysis: boolean;
  incompleteReasons:     string[];
  parseErrors:           ParseError[];
  ast:                   ParseResult;
}

// ─── REQUEST SIMULATOR ────────────────────────────────────────────────────────

export interface SimulatorRequest {
  scheme: "http" | "https";
  host:   string;
  path:   string;
  method: string;
}

export type MatchConfidence = "definite" | "probable" | "uncertain";

export interface SimulatorResult {
  matched:           boolean;
  matchedServerBlock?: NginxBlock;
  matchedLocation?:  NginxBlock;
  serverName?:       string;
  listenPort?:       string;
  proxyPass?:        string;
  redirect?:         string;
  appliedHeaders:    string[];
  warnings:          string[];
  matchPath:         string[];
  confidence:        MatchConfidence;
}