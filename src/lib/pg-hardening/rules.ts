// lib/pg-hardening/rules.ts
// PostgreSQL security rules — CIS-style, covers postgresql.conf + pg_hba.conf

export type Severity   = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export interface PGRule {
  id:              string;
  title:           string;
  severity:        Severity;
  category:        string;
  description:     string;
  check:           (pgConf: string, hbaConf: string) => boolean;
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
  rule:   PGRule;
  passed: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get directive value from postgresql.conf, ignoring comments */
export function getPGValue(conf: string, key: string): string | null {
  const lines = conf.split("\n");
  for (const line of lines) {
    const stripped = line.replace(/#.*$/, "").trim();
    const match = stripped.match(
      new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(.+)`, "i")
    );
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, "").trim();
  }
  return null;
}

/** Check if a directive is present and not commented out */
export function hasPGDirective(conf: string, key: string): boolean {
  return getPGValue(conf, key) !== null;
}

/** Get effective (non-commented) lines from pg_hba.conf */
export function getHBALines(hba: string): string[] {
  return hba
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l.length > 0);
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export const PG_RULES: PGRule[] = [

  // ══ HIGH ══════════════════════════════════════════════════════════════════

  {
    id:             "1.1",
    title:          "PostgreSQL listening on all interfaces (listen_addresses = '*')",
    severity:       "high",
    category:       "Network Exposure",
    description:    "listen_addresses is set to '*', meaning PostgreSQL accepts connections on every available network interface, including public-facing ones.",
    check:          (pg) => {
      const val = getPGValue(pg, "listen_addresses");
      return val !== null && (val === "*" || val.includes("*"));
    },
    remediation:    "Restrict listen_addresses to localhost or a specific internal IP. Use a connection pooler (PgBouncer) or VPN for remote access.",
    config_fix:     `listen_addresses = 'localhost'   # or specific internal IP: '10.0.0.5'`,
    why_it_matters: "With listen_addresses = '*', your PostgreSQL port (default 5432) is reachable from any network interface. If the host has a public IP and firewall rules are misconfigured, the database is directly internet-accessible. Combined with weak authentication, this is the primary vector for automated PostgreSQL attacks. Shodan currently indexes hundreds of thousands of publicly accessible PostgreSQL instances.",
    attack_type:    "Direct Database Exposure / Unauthorized Remote Access",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Checks listen_addresses value for '*' wildcard.",
    reference:      "CIS PostgreSQL Benchmark §3.2 / PostgreSQL listen_addresses docs",
  },

  {
    id:             "1.2",
    title:          "pg_hba.conf uses 'trust' authentication",
    severity:       "high",
    category:       "Authentication",
    description:    "One or more entries in pg_hba.conf use the 'trust' method, which allows connections without any password or credential verification.",
    check:          (_, hba) => {
      const lines = getHBALines(hba);
      return lines.some((l) => /\btrust\b/i.test(l));
    },
    remediation:    "Replace 'trust' with 'scram-sha-256' for all non-local connections. For local socket connections, use 'peer' (maps OS user to DB user) or 'md5' at minimum.",
    config_fix:     `# Replace in pg_hba.conf:
# Before:
host  all  all  0.0.0.0/0  trust

# After:
host  all  all  0.0.0.0/0  scram-sha-256`,
    why_it_matters: "The 'trust' method means anyone who can reach the PostgreSQL port (including from a compromised application server) can connect as any user — including superuser — with zero credentials. This is not a misconfiguration that requires exploitation skill; it requires only a TCP connection. In containerized environments where network segmentation is imperfect, a single compromised service can gain full database access instantly.",
    attack_type:    "Authentication Bypass / Privilege Escalation",
    owasp_mapping:  "A07 Identification and Authentication Failures",
    confidence:     "high",
    detection_logic: "Scans non-commented pg_hba.conf lines for the word 'trust' as an auth method.",
    reference:      "CIS PostgreSQL Benchmark §4.1 / PostgreSQL pg_hba.conf docs",
  },

  {
    id:             "1.3",
    title:          "SSL/TLS disabled (ssl = off)",
    severity:       "high",
    category:       "Encryption",
    description:    "SSL is explicitly disabled or not configured in postgresql.conf. All client-server communication is transmitted in plaintext.",
    check:          (pg) => {
      const val = getPGValue(pg, "ssl");
      // Flag if explicitly off, or if not set at all (default depends on compile-time options)
      return val === null || val.toLowerCase() === "off" || val === "false" || val === "0";
    },
    remediation:    "Enable SSL and configure a valid server certificate. Use ssl_min_protocol_version to enforce TLS 1.2+.",
    config_fix:     `ssl = on
ssl_cert_file = '/etc/postgresql/server.crt'
ssl_key_file  = '/etc/postgresql/server.key'
ssl_ca_file   = '/etc/postgresql/root.crt'
ssl_min_protocol_version = 'TLSv1.2'`,
    why_it_matters: "Without SSL, all queries, results, credentials, and session data transit the network in plaintext. Any attacker with network access — including other services in the same cloud VPC — can perform passive capture of database traffic. This includes capturing authentication exchanges for offline cracking even when strong password auth is used. In multi-tenant cloud environments, this is a significant cross-tenant risk.",
    attack_type:    "Plaintext Credential Capture / Data Interception / MITM",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Checks ssl directive value. Flags if absent (default off on many systems) or explicitly set to off/false/0.",
    reference:      "CIS PostgreSQL Benchmark §6.1 / PostgreSQL SSL docs",
  },

  {
    id:             "1.4",
    title:          "Remote superuser login allowed in pg_hba.conf",
    severity:       "high",
    category:       "Privilege Management",
    description:    "pg_hba.conf allows remote connections for the 'postgres' superuser or 'all' users on addresses other than localhost/127.0.0.1.",
    check:          (_, hba) => {
      const lines = getHBALines(hba);
      return lines.some((l) => {
        // host or hostssl line with postgres or all user, non-local address
        if (!/^host/i.test(l)) return false;
        const parts = l.split(/\s+/);
        if (parts.length < 5) return false;
        const user    = parts[2];
        const address = parts[3];
        const isRemote = !["127.0.0.1/32", "::1/128", "localhost"].includes(address.toLowerCase());
        const isSuperUser = user === "postgres" || user === "all";
        return isRemote && isSuperUser;
      });
    },
    remediation:    "Block remote superuser access entirely. Superuser access should only be permitted via local socket (peer auth). Use a dedicated application user with minimal privileges for remote connections.",
    config_fix:     `# In pg_hba.conf — restrict superuser to local socket only:
local  all  postgres  peer

# Create an app user with limited privileges instead:
# CREATE USER appuser WITH PASSWORD 'strong_password';
# GRANT CONNECT ON DATABASE mydb TO appuser;`,
    why_it_matters: "Remote superuser access means a single compromised credential grants SUPERUSER-level control: reading any table in any database, executing arbitrary OS commands via COPY TO/FROM PROGRAM, creating and dropping databases, reading pg_authid (all hashed passwords), and bypassing all row-level security. This is equivalent to root access on the database host. The postgres superuser should never be reachable from a network connection.",
    attack_type:    "Superuser Escalation / OS Command Execution via COPY PROGRAM",
    owasp_mapping:  "A01 Broken Access Control",
    confidence:     "high",
    detection_logic: "Checks host/* entries in pg_hba.conf for postgres or all user with non-localhost addresses.",
    reference:      "CIS PostgreSQL Benchmark §4.3",
  },

  {
    id:             "1.5",
    title:          "pg_hba.conf contains 'host all all 0.0.0.0/0' (world-readable)",
    severity:       "high",
    category:       "Network Exposure",
    description:    "A pg_hba.conf rule grants access from all IPv4 addresses (0.0.0.0/0) to all databases and all users.",
    check:          (_, hba) => {
      const lines = getHBALines(hba);
      return lines.some((l) =>
        /^host\s+all\s+all\s+0\.0\.0\.0\/0/i.test(l) ||
        /^host\s+all\s+all\s+:+\/0/i.test(l) ||
        /^hostssl\s+all\s+all\s+0\.0\.0\.0\/0/i.test(l)
      );
    },
    remediation:    "Replace 0.0.0.0/0 with specific IP ranges or CIDR blocks for known application servers. Never use 0.0.0.0/0 in production.",
    config_fix:     `# Replace:
# host  all  all  0.0.0.0/0  scram-sha-256

# With specific app server IPs:
host  mydb  appuser  10.0.1.0/24  scram-sha-256`,
    why_it_matters: "An open 0.0.0.0/0 rule combined with any password-based auth means the database is accessible to the entire internet (assuming firewall allows port 5432). Even with strong passwords, this maximizes the attack surface for brute force and credential stuffing. Leaked application credentials (common in code repositories) immediately lead to database compromise when this rule is in place.",
    attack_type:    "Brute Force / Credential Stuffing / Unauthorized Access",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "high",
    detection_logic: "Regex match for 'host all all 0.0.0.0/0' or IPv6 equivalent in pg_hba.conf.",
    reference:      "CIS PostgreSQL Benchmark §4.2",
  },

  // ══ MEDIUM ════════════════════════════════════════════════════════════════

  {
    id:             "2.1",
    title:          "Weak password hashing (password_encryption = md5)",
    severity:       "medium",
    category:       "Authentication",
    description:    "password_encryption is set to md5. MD5-hashed passwords in pg_authid are trivially crackable with modern hardware and have precomputed rainbow tables.",
    check:          (pg) => {
      const val = getPGValue(pg, "password_encryption");
      return val !== null && val.toLowerCase() === "md5";
    },
    remediation:    "Set password_encryption = 'scram-sha-256' and update all user passwords to re-hash them with the new algorithm. Update pg_hba.conf auth methods from md5 to scram-sha-256.",
    config_fix:     `# In postgresql.conf:
password_encryption = 'scram-sha-256'

# Then reset all passwords to re-hash:
# ALTER USER username WITH PASSWORD 'new_password';

# In pg_hba.conf, change md5 to scram-sha-256:
host  all  all  10.0.0.0/8  scram-sha-256`,
    why_it_matters: "MD5 password hashing in PostgreSQL uses an unsalted MD5 of the password concatenated with the username. This means identical passwords for different users produce different hashes (good), but the hashes are still MD5 — a broken algorithm. Modern GPUs can compute 50+ billion MD5 hashes per second. A leaked pg_authid table (possible via SQL injection with superuser) can be cracked completely in minutes. SCRAM-SHA-256 uses PBKDF2 with 4096 iterations and is not crackable at scale.",
    attack_type:    "Offline Password Cracking / Credential Harvesting",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Checks password_encryption directive value for 'md5'.",
    reference:      "CIS PostgreSQL Benchmark §4.5 / RFC 7677 SCRAM-SHA-256",
  },

  {
    id:             "2.2",
    title:          "Log collection disabled (logging_collector = off)",
    severity:       "medium",
    category:       "Logging & Auditing",
    description:    "logging_collector is off or not configured. PostgreSQL is not writing logs to files, making incident investigation and compliance auditing impossible.",
    check:          (pg) => {
      const val = getPGValue(pg, "logging_collector");
      return val === null || val.toLowerCase() === "off" || val === "false" || val === "0";
    },
    remediation:    "Enable logging_collector and configure log retention. Set log_directory, log_filename, and log_rotation_age for structured log management.",
    config_fix:     `logging_collector = on
log_directory    = 'pg_log'
log_filename     = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000  # log queries > 1s`,
    why_it_matters: "Without logging, you have no audit trail for: failed authentication attempts (brute force), privilege escalations, schema changes (DROP TABLE), data exports (COPY TO), or long-running queries (DoS indicators). Compliance frameworks (SOC 2, PCI-DSS, HIPAA) require database audit logs. In an incident, absence of logs means inability to determine blast radius, attacker actions, or data accessed.",
    attack_type:    "Audit Evasion / Compliance Failure",
    owasp_mapping:  "A09 Security Logging and Monitoring Failures",
    confidence:     "high",
    detection_logic: "Checks logging_collector value. Flags if absent or set to off/false/0.",
    reference:      "CIS PostgreSQL Benchmark §7.1",
  },

  {
    id:             "2.3",
    title:          "No connection limit configured (max_connections default or very high)",
    severity:       "medium",
    category:       "Resource Management",
    description:    "max_connections is not set or left at a very high value without a corresponding connection pooler, leaving the database vulnerable to connection exhaustion attacks.",
    check:          (pg) => {
      const val = getPGValue(pg, "max_connections");
      if (!val) return true;
      const n = parseInt(val);
      return !isNaN(n) && n > 500;
    },
    remediation:    "Set max_connections to a value matching your hardware (typically 100–300). Deploy PgBouncer or pgpool-II for connection pooling to prevent exhaustion.",
    config_fix:     `max_connections = 100    # adjust to hardware capacity
# Deploy PgBouncer for connection pooling:
# pool_mode = transaction
# max_client_conn = 10000
# default_pool_size = 25`,
    why_it_matters: "Each PostgreSQL connection consumes 5–10MB of RAM. With max_connections = 1000, an attacker who opens 1000 idle connections (trivial with any PostgreSQL client) exhausts server RAM, causing OOM kills or preventing legitimate connections. This is a low-effort DoS against the database. Without a connection pooler, high max_connections also degrades query performance due to lock contention and context switching.",
    attack_type:    "Denial of Service / Resource Exhaustion",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "medium",
    detection_logic: "Checks max_connections value. Flags if absent or greater than 500.",
    reference:      "CIS PostgreSQL Benchmark §3.4",
  },

  {
    id:             "2.4",
    title:          "pg_hba.conf uses 'md5' authentication method",
    severity:       "medium",
    category:       "Authentication",
    description:    "One or more pg_hba.conf entries use 'md5' as the authentication method. MD5 auth is deprecated and vulnerable to replay attacks.",
    check:          (_, hba) => {
      const lines = getHBALines(hba);
      return lines.some((l) => /\bmd5\b/i.test(l) && /^host/i.test(l));
    },
    remediation:    "Upgrade all 'md5' entries to 'scram-sha-256'. Ensure password_encryption = 'scram-sha-256' is set and passwords are re-hashed.",
    config_fix:     `# In pg_hba.conf, replace md5 with scram-sha-256:
host  all  all  10.0.0.0/8  scram-sha-256

# In postgresql.conf:
password_encryption = 'scram-sha-256'`,
    why_it_matters: "The MD5 auth method in pg_hba.conf sends an MD5 challenge-response over the wire. While this prevents plaintext password transmission, the MD5 hash is vulnerable to offline cracking and the protocol doesn't provide channel binding — making it susceptible to MITM attacks even with SSL. PostgreSQL 14+ recommends SCRAM-SHA-256 which provides channel binding (prevents MITM even with compromised CA) and uses PBKDF2 for key derivation.",
    attack_type:    "Password Cracking / MITM Authentication Bypass",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Scans pg_hba.conf host lines for 'md5' auth method.",
    reference:      "CIS PostgreSQL Benchmark §4.5",
  },

  {
    id:             "2.5",
    title:          "Log duration not configured",
    severity:       "medium",
    category:       "Logging & Auditing",
    description:    "log_min_duration_statement is not set. Slow queries that may indicate SQL injection, data exfiltration, or DoS are not logged.",
    check:          (pg) => !hasPGDirective(pg, "log_min_duration_statement"),
    remediation:    "Set log_min_duration_statement to log queries exceeding a threshold. Start with 1000ms and tune based on your workload.",
    config_fix:     `log_min_duration_statement = 1000   # log queries taking > 1 second
log_checkpoints = on
log_connections = on
log_disconnections = on`,
    why_it_matters: "Unlogged slow queries hide SQL injection attacks that use time-based blind injection techniques (pg_sleep), large data exports via inefficient queries, and table scans from unauthorized data mining. Many compliance frameworks (PCI-DSS, SOC 2) require logging of all DDL and long-running queries. Without this, your SIEM receives no signal from the database layer.",
    attack_type:    "SQL Injection Concealment / Data Exfiltration Evasion",
    owasp_mapping:  "A09 Security Logging and Monitoring Failures",
    confidence:     "high",
    detection_logic: "Checks for absence of log_min_duration_statement directive.",
    reference:      "CIS PostgreSQL Benchmark §7.2",
  },

  {
    id:             "2.6",
    title:          "SSL minimum protocol version not set",
    severity:       "medium",
    category:       "Encryption",
    description:    "ssl_min_protocol_version is not configured, potentially allowing legacy TLS versions (TLS 1.0, 1.1) that are deprecated and vulnerable.",
    check:          (pg) => {
      const sslVal = getPGValue(pg, "ssl");
      const sslOn = sslVal && ["on", "true", "1"].includes(sslVal.toLowerCase());
      if (!sslOn) return false; // don't flag if SSL itself is off (already caught by 1.3)
      return !hasPGDirective(pg, "ssl_min_protocol_version");
    },
    remediation:    "Set ssl_min_protocol_version to TLSv1.2 or TLSv1.3 to prevent protocol downgrade attacks.",
    config_fix:     `ssl_min_protocol_version = 'TLSv1.2'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'`,
    why_it_matters: "Without ssl_min_protocol_version, PostgreSQL may accept TLS 1.0 and TLS 1.1 connections. These versions are vulnerable to BEAST, POODLE, and SWEET32 attacks, and deprecated by RFC 8996. In a network position between the app server and database, an attacker can force a downgrade to a weaker protocol version to enable decryption of session traffic.",
    attack_type:    "Protocol Downgrade / MITM Decryption",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "medium",
    detection_logic: "Checks for ssl_min_protocol_version when SSL is enabled.",
    reference:      "CIS PostgreSQL Benchmark §6.3 / RFC 8996",
  },

  // ══ LOW ═══════════════════════════════════════════════════════════════════

  {
    id:             "3.1",
    title:          "shared_buffers not configured or too low",
    severity:       "low",
    category:       "Performance & DoS Risk",
    description:    "shared_buffers is not set or below 128MB. Default shared_buffers (128kB on many builds) causes excessive disk I/O and degrades performance, increasing vulnerability to query-based DoS.",
    check:          (pg) => {
      const val = getPGValue(pg, "shared_buffers");
      if (!val) return true;
      // Parse value — support MB/GB/kB suffixes
      const match = val.match(/^(\d+)\s*(kB|MB|GB|TB)?$/i);
      if (!match) return false;
      const n = parseInt(match[1]);
      const unit = (match[2] || "kB").toUpperCase();
      const mb = unit === "GB" ? n * 1024 : unit === "MB" ? n : unit === "TB" ? n * 1024 * 1024 : n / 1024;
      return mb < 128;
    },
    remediation:    "Set shared_buffers to 25% of total RAM. For a 4GB system, use 1GB. For 16GB, use 4GB.",
    config_fix:     `shared_buffers = 256MB          # start with 25% of RAM
effective_cache_size = 1GB    # 50-75% of RAM
work_mem = 4MB                # per-sort/hash operation`,
    why_it_matters: "Low shared_buffers causes all queries to go to disk instead of memory. In high-concurrency scenarios, this means a small number of simultaneous complex queries can saturate I/O and effectively DoS the database for all other users. Properly sized shared_buffers also reduces the window during which buffer data is evicted (and re-fetched from disk), reducing predictability of timing side-channels.",
    attack_type:    "Query-based Denial of Service",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "medium",
    detection_logic: "Parses shared_buffers value including unit suffix. Flags if absent or below 128MB equivalent.",
    reference:      "CIS PostgreSQL Benchmark §3.5 / PostgreSQL tuning docs",
  },

  {
    id:             "3.2",
    title:          "log_statement not configured",
    severity:       "low",
    category:       "Logging & Auditing",
    description:    "log_statement is not set or set to 'none'. DDL statements (CREATE, DROP, ALTER) and potentially dangerous queries are not logged.",
    check:          (pg) => {
      const val = getPGValue(pg, "log_statement");
      return val === null || val.toLowerCase() === "none";
    },
    remediation:    "Set log_statement to 'ddl' to log all DDL statements, or 'all' for complete query logging (use with caution on high-traffic systems).",
    config_fix:     `log_statement = 'ddl'    # log CREATE, DROP, ALTER, etc.
# Or for full audit:
# log_statement = 'all'   # WARNING: high volume, use carefully`,
    why_it_matters: "Without DDL logging, you cannot detect: unauthorized table drops (destructive attacks), schema modifications that introduce backdoors (malicious trigger creation), GRANT/REVOKE operations that escalate privileges, and CREATE EXTENSION commands that load malicious code. In a post-compromise forensic analysis, absence of DDL logs prevents reconstruction of what the attacker changed.",
    attack_type:    "Schema Tampering / Privilege Escalation via DDL",
    owasp_mapping:  "A09 Security Logging and Monitoring Failures",
    confidence:     "high",
    detection_logic: "Checks log_statement value. Flags if absent or set to 'none'.",
    reference:      "CIS PostgreSQL Benchmark §7.3",
  },

  {
    id:             "3.3",
    title:          "log_connections not enabled",
    severity:       "low",
    category:       "Logging & Auditing",
    description:    "log_connections is off or not set. Successful connection events are not logged, making it impossible to track who connected to the database.",
    check:          (pg) => {
      const val = getPGValue(pg, "log_connections");
      return val === null || val.toLowerCase() === "off" || val === "false" || val === "0";
    },
    remediation:    "Enable both log_connections and log_disconnections to create a complete session audit trail.",
    config_fix:     `log_connections    = on
log_disconnections = on
log_hostname       = on   # resolve client hostnames`,
    why_it_matters: "Without connection logging, you cannot identify: which accounts are being accessed and from where, unexpected connections from unknown IP addresses indicating credential compromise, connection patterns that suggest credential stuffing (many failed attempts), and sessions from decommissioned application servers. PCI-DSS and SOC 2 Type II require logging of all database access.",
    attack_type:    "Intrusion Detection Evasion / Compliance Failure",
    owasp_mapping:  "A09 Security Logging and Monitoring Failures",
    confidence:     "high",
    detection_logic: "Checks log_connections value. Flags if absent or off.",
    reference:      "CIS PostgreSQL Benchmark §7.4",
  },

  {
    id:             "3.4",
    title:          "pg_hba.conf allows 'password' (plaintext) authentication",
    severity:       "low",
    category:       "Authentication",
    description:    "pg_hba.conf contains entries using 'password' method, which transmits passwords in cleartext over the wire (even with SSL, this is a weaker method than scram-sha-256).",
    check:          (_, hba) => {
      const lines = getHBALines(hba);
      return lines.some((l) => /\bpassword\b/i.test(l) && /^host/i.test(l));
    },
    remediation:    "Replace all 'password' auth method entries with 'scram-sha-256'.",
    config_fix:     `# In pg_hba.conf, replace 'password' with 'scram-sha-256':
host  all  all  10.0.0.0/8  scram-sha-256`,
    why_it_matters: "The 'password' method in pg_hba.conf sends the password in cleartext (base64 encoded, not encrypted). Without SSL, this is trivially captured. Even with SSL, 'password' does not support channel binding, which means MITM attacks on the TLS layer can intercept credentials. SCRAM-SHA-256 performs a zero-knowledge proof of password knowledge — the actual password never traverses the network.",
    attack_type:    "Cleartext Credential Interception",
    owasp_mapping:  "A02 Cryptographic Failures",
    confidence:     "high",
    detection_logic: "Scans pg_hba.conf host lines for 'password' auth method.",
    reference:      "CIS PostgreSQL Benchmark §4.4",
  },

  {
    id:             "3.5",
    title:          "log_line_prefix not configured",
    severity:       "low",
    category:       "Logging & Auditing",
    description:    "log_line_prefix is not configured. Log entries lack timestamps, process IDs, and user context, making log correlation and forensic analysis difficult.",
    check:          (pg) => !hasPGDirective(pg, "log_line_prefix"),
    remediation:    "Configure log_line_prefix to include timestamp, user, database, host, and process ID for each log entry.",
    config_fix:     `log_line_prefix = '%m [%p] %q%u@%d '
# %m = timestamp with milliseconds
# %p = process ID
# %q = stop here in non-session processes
# %u = user name
# %d = database name`,
    why_it_matters: "Without structured log prefixes, correlating log events across a forensic timeline is manual and error-prone. When investigating a breach, you need to know: which user executed each query, from which database, at what exact timestamp, and under which process. Without this context, log files are essentially useless for incident response and SIEM ingestion.",
    attack_type:    "Forensic Analysis Impediment",
    owasp_mapping:  "A09 Security Logging and Monitoring Failures",
    confidence:     "high",
    detection_logic: "Checks for absence of log_line_prefix directive.",
    reference:      "CIS PostgreSQL Benchmark §7.5",
  },

  {
    id:             "3.6",
    title:          "idle_in_transaction_session_timeout not set",
    severity:       "low",
    category:       "Resource Management",
    description:    "idle_in_transaction_session_timeout is not configured. Sessions that open a transaction and go idle indefinitely hold locks and consume connections.",
    check:          (pg) => !hasPGDirective(pg, "idle_in_transaction_session_timeout"),
    remediation:    "Set idle_in_transaction_session_timeout to terminate sessions that have been idle inside a transaction for too long.",
    config_fix:     `idle_in_transaction_session_timeout = 60000  # 60 seconds in ms
statement_timeout = 30000                       # 30 second query timeout`,
    why_it_matters: "An attacker with partial database access can open a transaction on a high-contention table and leave it idle indefinitely, blocking all other writes to that table (table-level lock). Without idle_in_transaction_session_timeout, this is an effective DoS that requires no special privileges beyond INSERT/UPDATE access on any table. Combined with an abandoned connection from a compromised app server, this can cause indefinite database unavailability.",
    attack_type:    "Lock-based Denial of Service",
    owasp_mapping:  "A05 Security Misconfiguration",
    confidence:     "medium",
    detection_logic: "Checks for absence of idle_in_transaction_session_timeout directive.",
    reference:      "CIS PostgreSQL Benchmark §3.6",
  },
];