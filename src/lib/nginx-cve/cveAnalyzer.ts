// lib/nginx-cve/cveAnalyzer.ts
// Matches an NGINX version against the nginx.org advisory list, then uses the
// config analyzer's parser to tell which advisories depend on features the
// pasted config actually enables.

import { ADVISORIES, LATEST_MAINLINE_VERSION, LATEST_STABLE_VERSION } from "./advisories.ts";
import type { Advisory, AdvisorySeverity } from "./types.ts";
import { compareVersions, extractVersion, isValidNginxVersion, parseVersion } from "./versionCompare.ts";
import { parseConfigs, getAllDirectivesDeep, getBlocksOfType } from "../../app/tools/nginx-config-analyzer/v2/parser.ts";
import type { NginxBlock } from "../../app/tools/nginx-config-analyzer/v2/types.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * always       — no special feature needed
 * detected     — the pasted config enables the feature
 * not_detected — a config was pasted and the feature is not in it
 * unknown      — no config pasted, so we cannot tell
 */
export type ConditionStatus = "always" | "detected" | "not_detected" | "unknown";

export interface CVEMatch {
  advisory:        Advisory;
  condition:       string | null;   // human-readable requirement, e.g. "HTTP/3 (listen ... quic)"
  conditionStatus: ConditionStatus;
  /** First fixed version in the reader's branch, or the latest releases */
  fixedIn:         string[];
}

export type Support = "mainline" | "stable" | "unsupported" | "newer";
export type RiskStatus = "vulnerable" | "possibly_vulnerable" | "no_known_cves" | "invalid";

export interface CveAnalysisResult {
  input:          string;
  version:        string | null;
  support:        Support | null;
  riskStatus:     RiskStatus;
  matches:        CVEMatch[];
  /** Matches that apply: always + detected */
  affecting:      CVEMatch[];
  /** Matches that depend on a feature we could not check (no config) */
  possible:       CVEMatch[];
  /** Matches ruled out by the pasted config */
  ruledOut:       CVEMatch[];
  highest:        AdvisorySeverity | null;
  upgradeTarget:  string | null;
  /** Set when the version string looks like a distribution package */
  distroNote:     string | null;
  configProvided: boolean;
  message:        string;
}

const SEVERITY_ORDER: AdvisorySeverity[] = ["major", "medium", "low"];

// ─── Version matching ─────────────────────────────────────────────────────────

const branchOf = (v: string) => parseVersion(v).slice(0, 2).join(".");

function inSpan(version: string, from: string, to: string): boolean {
  return compareVersions(version, from) >= 0 && compareVersions(version, to) <= 0;
}

/** nginx.org lists one fixed release per branch; a version is fixed if its branch has one at or below it */
function isFixed(version: string, notVulnerable: string[]): boolean {
  if (notVulnerable.length === 0) return false;
  const newest = [...notVulnerable].sort(compareVersions).at(-1)!;
  if (compareVersions(version, newest) >= 0) return true;
  return notVulnerable.some((nv) => branchOf(nv) === branchOf(version) && compareVersions(version, nv) >= 0);
}

export function isAffected(version: string, adv: Advisory): boolean {
  return adv.vulnerable.some((s) => inSpan(version, s.from, s.to)) && !isFixed(version, adv.notVulnerable);
}

function fixedInFor(version: string, adv: Advisory): string[] {
  const sameBranch = adv.notVulnerable.filter((nv) => branchOf(nv) === branchOf(version));
  return sameBranch.length ? sameBranch : adv.notVulnerable;
}

function supportOf(version: string): Support {
  if (compareVersions(version, LATEST_MAINLINE_VERSION) > 0) return "newer";
  if (branchOf(version) === branchOf(LATEST_MAINLINE_VERSION)) return "mainline";
  if (branchOf(version) === branchOf(LATEST_STABLE_VERSION)) return "stable";
  return "unsupported";
}

// ─── Feature detection on the pasted config ───────────────────────────────────

interface Feature {
  label:  string;
  detect: (cfg: ConfigFacts) => boolean;
}

interface ConfigFacts {
  root:      NginxBlock;
  has:       (name: string) => boolean;
  valueOf:   (name: string) => string[];
  listenHas: (token: string) => boolean;
}

function facts(config: string): ConfigFacts {
  const ast = parseConfigs([{ id: "cfg", filename: "nginx.conf", content: config }]);
  const valueOf = (name: string) => getAllDirectivesDeep(ast.root, name).map((d) => d.rawValue.trim().toLowerCase());
  return {
    root: ast.root,
    has: (name) => getAllDirectivesDeep(ast.root, name).length > 0,
    valueOf,
    listenHas: (token) => valueOf("listen").some((v) => v.split(/\s+/).includes(token)),
  };
}

const tls = (c: ConfigFacts) => c.listenHas("ssl") || c.listenHas("quic");
const on = (values: string[]) => values.some((v) => v !== "off");

const FEATURES: { match: RegExp; feature: Feature }[] = [
  { match: /HTTP\/3|QUIC|ngx_http_v3_module/i, feature: { label: "HTTP/3 (listen ... quic)", detect: (c) => c.listenHas("quic") || on(c.valueOf("http3")) } },
  { match: /HTTP\/2 request injection in the ngx_http_proxy_module|proxy_v2|grpc/i, feature: { label: "HTTP/2 to upstreams (grpc_pass or proxy_http_version 2)", detect: (c) => c.has("grpc_pass") || c.valueOf("proxy_http_version").includes("2") } },
  { match: /HTTP\/2/i, feature: { label: "HTTP/2 (listen ... http2 or http2 on)", detect: (c) => c.listenHas("http2") || on(c.valueOf("http2")) } },
  { match: /SPDY/i, feature: { label: "SPDY (listen ... spdy)", detect: (c) => c.listenHas("spdy") } },
  { match: /ngx_http_mp4_module|\bmp4\b/i, feature: { label: "mp4 module (mp4 directive)", detect: (c) => c.has("mp4") } },
  { match: /in stream/i, feature: { label: "stream {} with ssl_ocsp", detect: (c) => getBlocksOfType(c.root, "unknown").some((b) => b.contextLabel === "stream") && c.has("ssl_ocsp") } },
  { match: /OCSP/i, feature: { label: "OCSP (ssl_stapling or ssl_ocsp)", detect: (c) => on(c.valueOf("ssl_stapling")) || on(c.valueOf("ssl_ocsp")) } },
  { match: /\bresolver\b/i, feature: { label: "resolver directive", detect: (c) => c.has("resolver") } },
  { match: /\bdav\b|ngx_http_dav_module|WebDAV/i, feature: { label: "WebDAV (dav_methods)", detect: (c) => on(c.valueOf("dav_methods")) } },
  { match: /mail|SMTP|STARTTLS|CRAM-MD5|APOP|auth_http|XCLIENT/i, feature: { label: "mail {} proxy", detect: (c) => c.root.directives.some((d) => d.name === "mail") } },
  { match: /ngx_http_slice_module|\bslice\b/i, feature: { label: "slice directive", detect: (c) => c.has("slice") } },
  { match: /\bSSI\b|ngx_http_ssi_module/i, feature: { label: "SSI (ssi on)", detect: (c) => c.valueOf("ssi").includes("on") } },
  { match: /ngx_http_charset_module|\bcharset\b/i, feature: { label: "charset conversion (charset / source_charset)", detect: (c) => on(c.valueOf("charset")) || c.has("source_charset") } },
  { match: /ngx_http_(scgi|uwsgi)_module/i, feature: { label: "scgi_pass or uwsgi_pass", detect: (c) => c.has("scgi_pass") || c.has("uwsgi_pass") } },
  { match: /asynchronous file I\/O|\bAIO\b/i, feature: { label: "aio on / threads", detect: (c) => on(c.valueOf("aio")) } },
  { match: /SSL upstream/i, feature: { label: "TLS to upstreams (proxy_pass https://)", detect: (c) => c.valueOf("proxy_pass").some((v) => v.startsWith("https://")) || c.has("proxy_ssl_certificate") } },
  { match: /session tickets/i, feature: { label: "TLS with session tickets (default on)", detect: (c) => tls(c) && !c.valueOf("ssl_session_tickets").includes("off") } },
  { match: /SSL session reuse|renegotiation/i, feature: { label: "TLS listener (listen ... ssl)", detect: tls } },
  { match: /map and regex/i, feature: { label: "map {} with regex keys", detect: (c) => getBlocksOfType(c.root, "map").some((m) => m.directives.some((d) => d.name.replace(/^["']/, "").startsWith("~"))) } },
  { match: /alias with rewrite/i, feature: { label: "alias combined with rewrite", detect: (c) => c.has("alias") && c.has("rewrite") } },
  { match: /rewrite_module/i, feature: { label: "rewrite module (rewrite, set, if, return)", detect: (c) => ["rewrite", "set", "if", "return"].some(c.has) } },
];

function featureFor(adv: Advisory): Feature | null {
  if (adv.windowsOnly) return { label: "nginx for Windows only", detect: () => false };
  return FEATURES.find((f) => f.match.test(adv.title))?.feature ?? null;
}

// ─── Distribution packages ────────────────────────────────────────────────────

const DISTRO = /\b(ubuntu|debian|deb\d+u\d+|el[6-9]|rhel|red hat|centos|rocky|alma|amzn|amazon linux|alpine|suse|fedora|ppa)\b/i;

function distroNoteFor(input: string): string | null {
  const m = input.match(DISTRO);
  if (!m) return null;
  return `This looks like a distribution package (${m[1]}). Distributions often backport security fixes without changing the version number, so some of these advisories may already be patched. Check the package changelog (apt changelog nginx / rpm -q --changelog nginx) for the CVE IDs.`;
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeCVEs(rawInput: string, config = ""): CveAnalysisResult {
  const base = {
    input: rawInput, matches: [], affecting: [], possible: [], ruledOut: [],
    highest: null, upgradeTarget: null, configProvided: config.trim().length > 0,
  };
  const version = extractVersion(rawInput);
  if (!version || !isValidNginxVersion(version)) {
    return { ...base, version: null, support: null, riskStatus: "invalid", distroNote: null,
      message: "Could not find an NGINX version. Paste the output of nginx -v or a version like 1.30.6." };
  }

  const support = supportOf(version);
  const configFacts = base.configProvided ? facts(config) : null;
  const windowsBuild = /windows/i.test(rawInput);

  const matches: CVEMatch[] = ADVISORIES.filter((a) => isAffected(version, a)).map((advisory) => {
    const feature = featureFor(advisory);
    let conditionStatus: ConditionStatus = "always";
    if (advisory.windowsOnly) conditionStatus = windowsBuild ? "detected" : configFacts || DISTRO.test(rawInput) ? "not_detected" : "unknown";
    else if (feature) conditionStatus = configFacts ? (feature.detect(configFacts) ? "detected" : "not_detected") : "unknown";
    return { advisory, condition: feature?.label ?? null, conditionStatus, fixedIn: fixedInFor(version, advisory) };
  }).sort((a, b) => SEVERITY_ORDER.indexOf(a.advisory.severity) - SEVERITY_ORDER.indexOf(b.advisory.severity));

  const affecting = matches.filter((m) => m.conditionStatus === "always" || m.conditionStatus === "detected");
  const possible = matches.filter((m) => m.conditionStatus === "unknown");
  const ruledOut = matches.filter((m) => m.conditionStatus === "not_detected");
  const relevant = [...affecting, ...possible];
  const highest = SEVERITY_ORDER.find((s) => relevant.some((m) => m.advisory.severity === s)) ?? null;
  const upgradeTarget = support === "mainline" ? LATEST_MAINLINE_VERSION : LATEST_STABLE_VERSION;

  const riskStatus: RiskStatus = affecting.length ? "vulnerable" : possible.length ? "possibly_vulnerable" : "no_known_cves";
  const supportNote =
    support === "unsupported" ? ` The ${branchOf(version)} branch no longer gets security fixes.` :
    support === "newer" ? " This version is newer than the advisory list used here." : "";
  const message =
    riskStatus === "vulnerable"
      ? `${affecting.length} advisor${affecting.length === 1 ? "y applies" : "ies apply"} to ${version}${possible.length ? `, ${possible.length} more depend on features not checked` : ""}. Upgrade to ${upgradeTarget}.${supportNote}`
      : riskStatus === "possibly_vulnerable"
        ? `${possible.length} advisor${possible.length === 1 ? "y depends" : "ies depend"} on features this check could not see. Paste your config to narrow it down, or upgrade to ${upgradeTarget}.${supportNote}`
        : `No published advisory affects ${version}${ruledOut.length ? ` with this config (${ruledOut.length} ruled out)` : ""}.${supportNote}`;

  return {
    ...base, version, support, riskStatus, matches, affecting, possible, ruledOut, highest,
    upgradeTarget: riskStatus === "no_known_cves" && support !== "unsupported" ? null : upgradeTarget,
    distroNote: distroNoteFor(rawInput), message,
  };
}

export { ADVISORIES, LATEST_MAINLINE_VERSION, LATEST_STABLE_VERSION };
