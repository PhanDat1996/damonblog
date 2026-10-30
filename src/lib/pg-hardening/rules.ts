// lib/pg-hardening/rules.ts
// PostgreSQL hardening rules — v2, for postgresql.conf + pg_hba.conf.
// Settings are resolved like PostgreSQL does (last occurrence wins, unset =
// built-in default), and pg_hba.conf is parsed into columns so a user named
// "trust_app" or a reject line is not mistaken for an auth method.
//
// framework "cis": topic covered by the CIS PostgreSQL Benchmark.
// framework "best-practice": common operational hardening, not a CIS item.

import { isLoopback, isOff, isOn, isWorldOpen, toMB, type HBAEntry, type PGSetting } from "./parse.ts";

export type Severity   = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type Framework  = "cis" | "best-practice";
export type RuleStatus = "pass" | "fail" | "n/a";
export type ConfigFile = "postgresql.conf" | "pg_hba.conf";

export interface SourceRef {
  file:  ConfigFile;
  line:  number;
  label: string;
}

export interface RuleOutcome {
  status:    RuleStatus;
  refs?:     SourceRef[];
  evidence?: string;
}

export interface PGContext {
  /** postgresql.conf was provided (non-empty after comments) */
  hasPG:    boolean;
  /** pg_hba.conf was provided */
  hasHBA:   boolean;
  settings: Map<string, PGSetting>;
  hba:      HBAEntry[];
}

export interface PGRule {
  id:              string;
  title:           string;
  severity:        Severity;
  category:        string;
  framework:       Framework;
  file:            ConfigFile | "both";
  description:     string;
  check:           (ctx: PGContext) => RuleOutcome;
  remediation:     string;
  config_fix:      string;
  why_it_matters:  string;
  attack_type:     string;
  owasp_mapping:   string;
  confidence:      Confidence;
  detection_logic: string;
  reference:       string;
}

export interface PGResult {
  rule:      PGRule;
  status:    RuleStatus;
  /** true for pass and n/a */
  passed:    boolean;
  refs:      SourceRef[];
  evidence?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS: RuleOutcome = { status: "pass" };
const NA:   RuleOutcome = { status: "n/a" };

function settingRef(s: PGSetting): SourceRef {
  return { file: "postgresql.conf", line: s.line, label: `${s.name} = ${s.raw}` };
}

function hbaRef(e: HBAEntry, note?: string): SourceRef {
  return { file: "pg_hba.conf", line: e.line, label: note ? `${e.raw} (${note})` : e.raw };
}

/** Fails at the setting's line if it exists, else at line 1 of postgresql.conf */
function settingFail(ctx: PGContext, name: string, label?: string): RuleOutcome {
  const s = ctx.settings.get(name);
  return { status: "fail", refs: [s ? settingRef(s) : { file: "postgresql.conf", line: 1, label: label ?? `${name} not set (default)` }] };
}

function hbaRule(match: (e: HBAEntry) => boolean, note?: (e: HBAEntry) => string) {
  return (ctx: PGContext): RuleOutcome => {
    if (!ctx.hasHBA) return NA;
    const bad = ctx.hba.filter(match);
    return bad.length ? { status: "fail", refs: bad.map((e) => hbaRef(e, note?.(e))) } : PASS;
  };
}

const allows = (e: HBAEntry) => e.method !== "reject";
const isNetwork = (e: HBAEntry) => e.type !== "local";

function sslOn(ctx: PGContext): boolean {
  return isOn(ctx.settings.get("ssl")?.value);
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export const PG_RULES: PGRule[] = [

  // ══ Network exposure ══════════════════════════════════════════════════════

  {
    id: "NET-1",
    title: "PostgreSQL listens on all interfaces",
    severity: "high",
    category: "Network Exposure",
    framework: "cis",
    file: "postgresql.conf",
    description: "listen_addresses is '*', '0.0.0.0' or '::', so the server accepts TCP connections on every interface, including public ones.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const s = ctx.settings.get("listen_addresses");
      if (!s) return PASS; // default: localhost
      const addrs = s.value.split(",").map((a) => a.trim());
      return addrs.some((a) => a === "*" || a === "0.0.0.0" || a === "::") ? { status: "fail", refs: [settingRef(s)] } : PASS;
    },
    remediation: "Listen only on localhost and the specific internal interface that applications use.",
    config_fix: `listen_addresses = 'localhost, 10.0.0.5'   # replace with the internal IP`,
    why_it_matters: "Port 5432 becomes reachable on every interface. If a firewall rule is ever wrong, the database is open to the internet, where scanners probe PostgreSQL constantly.",
    attack_type: "Unauthorized Remote Access",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Reads the last listen_addresses setting; unset means the default 'localhost'.",
    reference: "PostgreSQL docs — listen_addresses",
  },

  {
    id: "NET-2",
    title: "pg_hba.conf allows connections from any address",
    severity: "high",
    category: "Network Exposure",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A host line accepts clients from 0.0.0.0/0, ::/0 or 'all' with a method other than reject.",
    check: hbaRule((e) => isNetwork(e) && allows(e) && isWorldOpen(e.address)),
    remediation: "Limit every host line to the CIDR ranges of the application servers that need access.",
    config_fix: `# Before
host  all    all      0.0.0.0/0      scram-sha-256
# After
hostssl  appdb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "Any address that reaches the port can try to log in, so leaked or guessed credentials work from anywhere.",
    attack_type: "Brute Force / Unauthorized Access",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "high",
    detection_logic: "Parses pg_hba.conf columns; reject lines are ignored.",
    reference: "PostgreSQL docs — pg_hba.conf",
  },

  // ══ Authentication ════════════════════════════════════════════════════════

  {
    id: "AUTH-1",
    title: "trust authentication over the network",
    severity: "high",
    category: "Authentication",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A host line uses the trust method, so network clients connect without any password.",
    check: hbaRule((e) => isNetwork(e) && e.method === "trust" && !isLoopback(e.address)),
    remediation: "Use scram-sha-256 for every network connection.",
    config_fix: `hostssl  appdb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "Anyone who can open a TCP connection can log in as any user the line matches, including superusers.",
    attack_type: "Authentication Bypass",
    owasp_mapping: "A07 Identification and Authentication Failures",
    confidence: "high",
    detection_logic: "Checks the method column of non-loopback host lines for trust.",
    reference: "PostgreSQL docs — trust authentication",
  },

  {
    id: "AUTH-2",
    title: "trust authentication for local or loopback connections",
    severity: "medium",
    category: "Authentication",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A local or loopback line uses trust, so any OS user on the host can connect as any database user.",
    check: hbaRule((e) => e.method === "trust" && isLoopback(e.address)),
    remediation: "Use peer for local socket connections and scram-sha-256 for loopback TCP.",
    config_fix: `local  all  all                peer
host   all  all  127.0.0.1/32   scram-sha-256`,
    why_it_matters: "Any process on the server, such as a compromised web app, can become the postgres superuser without credentials.",
    attack_type: "Local Privilege Escalation",
    owasp_mapping: "A07 Identification and Authentication Failures",
    confidence: "high",
    detection_logic: "Checks the method column of local and loopback lines for trust.",
    reference: "PostgreSQL docs — trust authentication",
  },

  {
    id: "AUTH-3",
    title: "postgres superuser can log in over the network",
    severity: "high",
    category: "Authentication",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A host line for the postgres user accepts non-loopback addresses.",
    check: hbaRule((e) => isNetwork(e) && allows(e) && !isLoopback(e.address) &&
      e.user.split(",").some((u) => u.replace(/"/g, "").toLowerCase() === "postgres")),
    remediation: "Allow postgres only through the local socket with peer, and give applications their own least-privilege roles.",
    config_fix: `local  all  postgres  peer
# CREATE ROLE appuser LOGIN PASSWORD '...';
# GRANT CONNECT ON DATABASE appdb TO appuser;`,
    why_it_matters: "A superuser can read every table, read password hashes, and run OS commands through COPY ... PROGRAM. One leaked password then means full host compromise.",
    attack_type: "Privilege Escalation / Command Execution",
    owasp_mapping: "A01 Broken Access Control",
    confidence: "high",
    detection_logic: "Finds non-reject, non-loopback host lines whose user column includes postgres.",
    reference: "PostgreSQL docs — pg_hba.conf",
  },

  {
    id: "AUTH-4",
    title: "Network access granted to all roles",
    severity: "low",
    category: "Authentication",
    framework: "best-practice",
    file: "pg_hba.conf",
    description: "A non-loopback host line uses 'all' in the user column, which includes superuser roles.",
    check: hbaRule((e) => isNetwork(e) && allows(e) && !isLoopback(e.address) && !isWorldOpen(e.address) && e.user.toLowerCase() === "all"),
    remediation: "Name the roles (or a +group) that need network access.",
    config_fix: `hostssl  appdb  +app_users  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "Superusers and maintenance roles can then log in from the application network too, which widens what a leaked password can do.",
    attack_type: "Excessive Access",
    owasp_mapping: "A01 Broken Access Control",
    confidence: "medium",
    detection_logic: "Non-reject, non-loopback host lines with user 'all' (world-open lines are reported by NET-2 instead).",
    reference: "PostgreSQL docs — pg_hba.conf",
  },

  {
    id: "AUTH-5",
    title: "md5 authentication method in pg_hba.conf",
    severity: "medium",
    category: "Authentication",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A line uses md5. PostgreSQL deprecates MD5 passwords and plans to remove them.",
    check: hbaRule((e) => allows(e) && e.method === "md5"),
    remediation: "Switch the method to scram-sha-256 after re-setting passwords with password_encryption = 'scram-sha-256'.",
    config_fix: `password_encryption = 'scram-sha-256'   # postgresql.conf
# ALTER ROLE appuser PASSWORD '...';     # re-hash each password
hostssl  appdb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "An MD5 hash is enough to log in (no need to crack it), and stolen hashes are fast to brute-force offline. SCRAM avoids both.",
    attack_type: "Credential Theft / Pass-the-Hash",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Checks the method column for md5.",
    reference: "PostgreSQL docs — password authentication",
  },

  {
    id: "AUTH-6",
    title: "Cleartext password authentication",
    severity: "medium",
    category: "Authentication",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A line uses the password method, which sends the password in cleartext.",
    check: hbaRule((e) => allows(e) && e.method === "password"),
    remediation: "Use scram-sha-256.",
    config_fix: `hostssl  appdb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "Without SSL the password is readable on the wire; with SSL it is still exposed to anything that terminates or proxies the connection.",
    attack_type: "Credential Interception",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Checks the method column for password.",
    reference: "PostgreSQL docs — password authentication",
  },

  {
    id: "AUTH-7",
    title: "ident authentication over TCP",
    severity: "medium",
    category: "Authentication",
    framework: "cis",
    file: "pg_hba.conf",
    description: "A host line uses ident, which trusts the client machine's ident server.",
    check: hbaRule((e) => isNetwork(e) && allows(e) && e.method === "ident"),
    remediation: "Use scram-sha-256 (or cert) for TCP connections.",
    config_fix: `hostssl  appdb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "The ident answer comes from the client host, so anyone controlling that host or its network can claim any username.",
    attack_type: "Authentication Bypass",
    owasp_mapping: "A07 Identification and Authentication Failures",
    confidence: "high",
    detection_logic: "Checks the method column of host lines for ident.",
    reference: "PostgreSQL docs — ident authentication",
  },

  {
    id: "AUTH-8",
    title: "Passwords stored as MD5 (password_encryption = md5)",
    severity: "medium",
    category: "Authentication",
    framework: "cis",
    file: "postgresql.conf",
    description: "New and changed passwords are hashed with MD5.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const s = ctx.settings.get("password_encryption");
      return s && s.value.toLowerCase() === "md5" ? { status: "fail", refs: [settingRef(s)] } : PASS;
    },
    remediation: "Use scram-sha-256 (the default since PostgreSQL 14) and reset existing passwords.",
    config_fix: `password_encryption = 'scram-sha-256'`,
    why_it_matters: "MD5 password hashes are fast to crack and can be replayed with the md5 method.",
    attack_type: "Offline Password Cracking",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Reads the last password_encryption setting; unset means scram-sha-256 on PostgreSQL 14+.",
    reference: "PostgreSQL docs — password_encryption",
  },

  // ══ Encryption ════════════════════════════════════════════════════════════

  {
    id: "ENC-1",
    title: "SSL disabled",
    severity: "high",
    category: "Encryption",
    framework: "cis",
    file: "postgresql.conf",
    description: "ssl is off or not set (the default is off), so client connections are unencrypted.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      return sslOn(ctx) ? PASS : settingFail(ctx, "ssl", "ssl not set (default off)");
    },
    remediation: "Enable SSL with a server certificate.",
    config_fix: `ssl           = on
ssl_cert_file = 'server.crt'
ssl_key_file  = 'server.key'`,
    why_it_matters: "Queries, results and authentication exchanges cross the network in plaintext, readable by anything on the path.",
    attack_type: "Data Interception",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Reads the last ssl setting; unset means off.",
    reference: "PostgreSQL docs — SSL support",
  },

  {
    id: "ENC-2",
    title: "Remote connections allowed without SSL",
    severity: "medium",
    category: "Encryption",
    framework: "cis",
    file: "pg_hba.conf",
    description: "SSL is on, but host (or hostnossl) lines still accept non-loopback clients without SSL.",
    check: (ctx) => {
      if (!ctx.hasHBA || !ctx.hasPG || !sslOn(ctx)) return NA;
      return hbaRule((e) => (e.type === "host" || e.type === "hostnossl") && allows(e) && !isLoopback(e.address))(ctx);
    },
    remediation: "Use hostssl for every non-loopback line so clients must use SSL.",
    config_fix: `hostssl  appdb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "With 'host', a client that does not request SSL (or is downgraded by an attacker) connects in plaintext.",
    attack_type: "Downgrade / Data Interception",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "When ssl is on, flags non-reject, non-loopback lines of type host or hostnossl.",
    reference: "PostgreSQL docs — pg_hba.conf hostssl",
  },

  {
    id: "ENC-3",
    title: "Legacy TLS versions allowed",
    severity: "medium",
    category: "Encryption",
    framework: "cis",
    file: "postgresql.conf",
    description: "ssl_min_protocol_version is set to TLSv1 or TLSv1.1.",
    check: (ctx) => {
      if (!ctx.hasPG || !sslOn(ctx)) return NA;
      const s = ctx.settings.get("ssl_min_protocol_version");
      return s && ["tlsv1", "tlsv1.1"].includes(s.value.toLowerCase()) ? { status: "fail", refs: [settingRef(s)] } : PASS;
    },
    remediation: "Require TLS 1.2 or newer (the default since PostgreSQL 12).",
    config_fix: `ssl_min_protocol_version = 'TLSv1.2'`,
    why_it_matters: "TLS 1.0 and 1.1 are deprecated by RFC 8996 and allow weaker cipher suites.",
    attack_type: "Protocol Downgrade",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "high",
    detection_logic: "Reads ssl_min_protocol_version when ssl is on; unset means TLSv1.2 on PostgreSQL 12+.",
    reference: "PostgreSQL docs — ssl_min_protocol_version / RFC 8996",
  },

  {
    id: "ENC-4",
    title: "Weak TLS 1.2 cipher suites allowed",
    severity: "low",
    category: "Encryption",
    framework: "best-practice",
    file: "postgresql.conf",
    description: "ssl_ciphers allows MEDIUM, 3DES, RC4, NULL or EXPORT suites. The built-in default (HIGH:MEDIUM:+3DES:!aNULL) includes MEDIUM and 3DES.",
    check: (ctx) => {
      if (!ctx.hasPG || !sslOn(ctx)) return NA;
      const s = ctx.settings.get("ssl_ciphers");
      const enabled = (s?.value ?? "HIGH:MEDIUM:+3DES:!aNULL").toUpperCase().split(":")
        .filter((c) => c && !c.startsWith("!") && !c.startsWith("-"));
      const weak = enabled.some((c) => /^\+?(MEDIUM|3DES|RC4|NULL|EXPORT|DES|LOW)$|RC4|NULL|EXPORT/.test(c));
      return weak ? settingFail(ctx, "ssl_ciphers", "ssl_ciphers not set (default includes MEDIUM:+3DES)") : PASS;
    },
    remediation: "Restrict TLS 1.2 ciphers to strong suites. TLS 1.3 suites are not affected by this setting.",
    config_fix: `ssl_ciphers = 'HIGH:!aNULL:!MD5:!3DES'`,
    why_it_matters: "3DES is vulnerable to Sweet32 on long-lived connections, and MEDIUM suites are weaker than needed.",
    attack_type: "Cryptographic Weakness",
    owasp_mapping: "A02 Cryptographic Failures",
    confidence: "medium",
    detection_logic: "Splits ssl_ciphers on ':' and checks enabled entries; unset uses the built-in default.",
    reference: "PostgreSQL docs — ssl_ciphers",
  },

  // ══ Logging ═══════════════════════════════════════════════════════════════

  {
    id: "LOG-1",
    title: "Connection logging off",
    severity: "low",
    category: "Logging & Auditing",
    framework: "cis",
    file: "postgresql.conf",
    description: "log_connections or log_disconnections is off (both default to off).",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const missing = ["log_connections", "log_disconnections"].filter((n) => {
        const v = ctx.settings.get(n)?.value;
        return v === undefined || isOff(v);
      });
      if (missing.length === 0) return PASS;
      return {
        status: "fail",
        refs: missing.map((n) => { const s = ctx.settings.get(n); return s ? settingRef(s) : { file: "postgresql.conf" as const, line: 1, label: `${n} not set (default off)` }; }),
      };
    },
    remediation: "Log both connections and disconnections.",
    config_fix: `log_connections    = on
log_disconnections = on`,
    why_it_matters: "Without them there is no record of who connected, from where, or for how long, which is the first thing an incident investigation needs.",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "high",
    detection_logic: "Both settings must be set and not off (PostgreSQL 18 list values such as 'all' count as on).",
    reference: "PostgreSQL docs — log_connections",
  },

  {
    id: "LOG-2",
    title: "DDL statements not logged",
    severity: "low",
    category: "Logging & Auditing",
    framework: "cis",
    file: "postgresql.conf",
    description: "log_statement is none (the default), so schema and role changes leave no trace in the log.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const v = ctx.settings.get("log_statement")?.value.toLowerCase();
      return v && v !== "none" ? PASS : settingFail(ctx, "log_statement", "log_statement not set (default none)");
    },
    remediation: "Log at least DDL. Use pgAudit for finer control.",
    config_fix: `log_statement = 'ddl'`,
    why_it_matters: "CREATE, ALTER, DROP and GRANT are how an attacker adds backdoors or escalates privileges; without logs they cannot be reconstructed.",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "high",
    detection_logic: "Reads the last log_statement; unset means none.",
    reference: "PostgreSQL docs — log_statement",
  },

  {
    id: "LOG-3",
    title: "log_line_prefix lacks user and database",
    severity: "low",
    category: "Logging & Auditing",
    framework: "cis",
    file: "postgresql.conf",
    description: "log_line_prefix does not include %u (user) and %d (database). The default '%m [%p] ' has neither.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const v = ctx.settings.get("log_line_prefix")?.value ?? "%m [%p] ";
      return v.includes("%u") && v.includes("%d") ? PASS : settingFail(ctx, "log_line_prefix", "log_line_prefix not set (default '%m [%p] ')");
    },
    remediation: "Include timestamp, process, user, database and client in each line.",
    config_fix: `log_line_prefix = '%m [%p] %q%u@%d %r '`,
    why_it_matters: "Log lines that do not say which user and database they belong to cannot be tied to an account during an investigation.",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "high",
    detection_logic: "Checks the effective log_line_prefix for %u and %d.",
    reference: "PostgreSQL docs — log_line_prefix",
  },

  {
    id: "LOG-4",
    title: "pgAudit not loaded",
    severity: "low",
    category: "Logging & Auditing",
    framework: "cis",
    file: "postgresql.conf",
    description: "shared_preload_libraries does not include pgaudit.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const v = ctx.settings.get("shared_preload_libraries")?.value ?? "";
      return v.split(",").some((l) => l.trim().replace(/['"]/g, "").toLowerCase() === "pgaudit")
        ? PASS : settingFail(ctx, "shared_preload_libraries", "shared_preload_libraries has no pgaudit");
    },
    remediation: "Install the pgAudit extension, preload it, and choose which classes to log.",
    config_fix: `shared_preload_libraries = 'pgaudit'
pgaudit.log = 'ddl, role'
# then: CREATE EXTENSION pgaudit;`,
    why_it_matters: "log_statement records statement text only; pgAudit records object-level activity in a format meant for audit review.",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "medium",
    detection_logic: "Looks for pgaudit in shared_preload_libraries.",
    reference: "pgAudit project documentation",
  },

  {
    id: "LOG-5",
    title: "Log files not collected (logging_collector off)",
    severity: "low",
    category: "Logging & Auditing",
    framework: "cis",
    file: "postgresql.conf",
    description: "logging_collector is off (the default), so logs go to stderr only.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      return isOn(ctx.settings.get("logging_collector")?.value)
        ? PASS : settingFail(ctx, "logging_collector", "logging_collector not set (default off)");
    },
    remediation: "Turn on logging_collector, or make sure stderr is captured by systemd/journald or your container runtime.",
    config_fix: `logging_collector = on
log_directory     = 'log'
log_filename      = 'postgresql-%Y-%m-%d.log'
log_rotation_age  = 1d`,
    why_it_matters: "If stderr is not captured anywhere, the server's logs are lost.",
    attack_type: "Detection Gap",
    owasp_mapping: "A09 Security Logging and Monitoring Failures",
    confidence: "medium",
    detection_logic: "Reads the last logging_collector; unset means off. Managed services and containers often capture stderr instead.",
    reference: "PostgreSQL docs — logging_collector",
  },

  // ══ Resource limits (best practice) ═══════════════════════════════════════

  {
    id: "RES-1",
    title: "Idle transactions are never terminated",
    severity: "low",
    category: "Resource Limits",
    framework: "best-practice",
    file: "postgresql.conf",
    description: "idle_in_transaction_session_timeout is 0 (the default), so a session can hold locks indefinitely.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const v = ctx.settings.get("idle_in_transaction_session_timeout")?.value;
      return v && !/^0\s*(ms|s|min)?$/i.test(v.trim()) ? PASS
        : settingFail(ctx, "idle_in_transaction_session_timeout", "idle_in_transaction_session_timeout not set (default 0)");
    },
    remediation: "Terminate sessions that sit idle inside a transaction.",
    config_fix: `idle_in_transaction_session_timeout = '60s'`,
    why_it_matters: "A forgotten or abandoned transaction keeps row and table locks, blocks vacuum, and can stall other writers.",
    attack_type: "Availability Risk",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "medium",
    detection_logic: "Reads the last setting; unset or 0 disables the timeout.",
    reference: "PostgreSQL docs — idle_in_transaction_session_timeout",
  },

  {
    id: "RES-2",
    title: "max_connections set very high",
    severity: "low",
    category: "Resource Limits",
    framework: "best-practice",
    file: "postgresql.conf",
    description: "max_connections is above 500. Each connection is a backend process with its own memory.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const s = ctx.settings.get("max_connections");
      return s && parseInt(s.value, 10) > 500 ? { status: "fail", refs: [settingRef(s)] } : PASS;
    },
    remediation: "Keep max_connections near what the hardware supports and put a pooler such as PgBouncer in front for many clients.",
    config_fix: `max_connections = 200
# PgBouncer: pool_mode = transaction, default_pool_size = 25`,
    why_it_matters: "A burst of connections, from a bug or on purpose, can exhaust memory before the limit is reached.",
    attack_type: "Resource Exhaustion",
    owasp_mapping: "A05 Security Misconfiguration",
    confidence: "medium",
    detection_logic: "Flags an explicit max_connections above 500; the default is 100.",
    reference: "PostgreSQL docs — max_connections",
  },

  {
    id: "RES-3",
    title: "shared_buffers set below 128MB",
    severity: "low",
    category: "Resource Limits",
    framework: "best-practice",
    file: "postgresql.conf",
    description: "shared_buffers is explicitly set below the 128MB default.",
    check: (ctx) => {
      if (!ctx.hasPG) return NA;
      const s = ctx.settings.get("shared_buffers");
      if (!s) return PASS;
      const mb = toMB(s.value);
      return mb !== null && mb < 128 ? { status: "fail", refs: [settingRef(s)] } : PASS;
    },
    remediation: "Start around 25% of RAM on a dedicated database server.",
    config_fix: `shared_buffers = 1GB   # ~25% of RAM on a 4 GB server`,
    why_it_matters: "A small buffer cache sends most reads to disk, so a few heavy queries can saturate I/O for everyone.",
    attack_type: "Performance",
    owasp_mapping: "n/a",
    confidence: "medium",
    detection_logic: "Parses units (kB/MB/GB; bare numbers are 8kB pages); unset means the 128MB default.",
    reference: "PostgreSQL docs — shared_buffers",
  },
];
