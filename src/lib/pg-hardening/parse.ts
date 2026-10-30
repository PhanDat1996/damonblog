// lib/pg-hardening/parse.ts
// Parsers for postgresql.conf and pg_hba.conf that follow PostgreSQL's own
// rules: comments start at an unquoted #, "=" is optional, and in
// postgresql.conf the last occurrence of a setting wins.

export interface PGSetting {
  name:  string;
  value: string;   // unquoted value
  raw:   string;   // value as written
  line:  number;   // 1-based
}

export interface HBAEntry {
  line:     number;
  type:     string;           // local | host | hostssl | hostnossl | hostgssenc | hostnogssenc
  database: string;
  user:     string;
  address:  string | null;    // null for local
  method:   string;
  raw:      string;
}

/** Remove an unquoted trailing # comment */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

export function parsePGConf(conf: string): Map<string, PGSetting> {
  const settings = new Map<string, PGSetting>();
  conf.split("\n").forEach((rawLine, i) => {
    const line = stripComment(rawLine).trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z_][\w.]*)\s*(?:=\s*|\s+)(.*)$/);
    if (!m) return;
    const name = m[1].toLowerCase();
    const raw = m[2].trim();
    const value = raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2
      ? raw.slice(1, -1).replace(/''/g, "'")
      : raw;
    // Later lines override earlier ones, exactly like PostgreSQL
    settings.set(name, { name, value, raw, line: i + 1 });
  });
  return settings;
}

/** Split a pg_hba line on whitespace, keeping "double quoted" tokens together */
function tokenize(line: string): string[] {
  return line.match(/"[^"]*"|\S+/g) ?? [];
}

export function parseHBA(hba: string): HBAEntry[] {
  const entries: HBAEntry[] = [];
  hba.split("\n").forEach((rawLine, i) => {
    const line = stripComment(rawLine).trim();
    if (!line) return;
    const t = tokenize(line);
    const type = t[0]?.toLowerCase();
    if (!type || type.startsWith("include")) return;
    if (type === "local") {
      if (t.length < 4) return;
      entries.push({ line: i + 1, type, database: t[1], user: t[2], address: null, method: t[3].toLowerCase(), raw: line });
      return;
    }
    if (!type.startsWith("host") || t.length < 5) return;
    // Address can be CIDR, hostname, keyword, or "IP MASK" (two tokens)
    const maskForm = /^[\d.]+$/.test(t[3]) && /^[\d.]+$/.test(t[4] ?? "");
    const address = maskForm ? `${t[3]} ${t[4]}` : t[3];
    const method = (maskForm ? t[5] : t[4])?.toLowerCase();
    if (!method) return;
    entries.push({ line: i + 1, type, database: t[1], user: t[2], address, method, raw: line });
  });
  return entries;
}

const LOOPBACK = new Set(["127.0.0.1/32", "::1/128", "localhost", "samehost", "127.0.0.1 255.255.255.255"]);

export function isLoopback(address: string | null): boolean {
  if (address === null) return true; // local socket
  const a = address.toLowerCase();
  return LOOPBACK.has(a) || /^127\.\d+\.\d+\.\d+\/(8|16|24|32)$/.test(a);
}

export function isWorldOpen(address: string | null): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return a === "all" || a === "0.0.0.0/0" || a === "::/0" || a === "0.0.0.0 0.0.0.0";
}

/** Is a boolean-ish setting turned on? (on/true/yes/1 and unique prefixes, like PostgreSQL) */
export function isOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return ["on", "true", "yes", "1", "t", "y"].includes(v);
}

export function isOff(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return ["off", "false", "no", "0", "f", "n", ""].includes(v);
}

/** Parse a memory setting to MB. Bare numbers are 8kB blocks for shared_buffers. */
export function toMB(value: string, bareUnitKB = 8): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(kB|MB|GB|TB)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch ((m[2] ?? "").toUpperCase()) {
    case "KB": return n / 1024;
    case "MB": return n;
    case "GB": return n * 1024;
    case "TB": return n * 1024 * 1024;
    default:   return (n * bareUnitKB) / 1024;
  }
}
