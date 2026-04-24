// simulator.ts — simplified NGINX request flow simulator
import type { SimulatorRequest, SimulatorResult, NginxBlock, MatchConfidence } from "./types";
import {
  getServerBlocks,
  getDirectives,
  getAllDirectivesDeep,
  getChildBlocks,
  getListenPorts,
  getServerNames,
  getEffectiveHeaders,
} from "./parser";
import type { ParseResult } from "./types";

// ─── SERVER MATCHING ──────────────────────────────────────────────────────────

function serverMatches(server: NginxBlock, req: SimulatorRequest): boolean {
  const ports = getListenPorts(server);
  const names = getServerNames(server);
  const targetPort = req.scheme === "https" ? "443" : "80";

  const portOk = ports.length === 0 || ports.some((p) => {
    const portPart = p.split(" ")[0].split(":").pop() ?? p;
    return portPart === targetPort || portPart === "80" || portPart === "443";
  });

  const nameOk =
    names.length === 0 ||
    names.includes("_") ||
    names.some((n) => n === req.host || (n.startsWith("*.") && req.host.endsWith(n.slice(1))));

  return portOk && nameOk;
}

// ─── LOCATION MATCHING ────────────────────────────────────────────────────────

type LocationMatch = { block: NginxBlock; priority: number; label: string };

function matchLocation(server: NginxBlock, path: string): NginxBlock | null {
  const locations = getChildBlocks(server, "location");
  const candidates: LocationMatch[] = [];

  for (const loc of locations) {
    const label = loc.contextLabel.replace(/^location\s+/, "").trim();

    // Parse modifier + pattern
    let modifier = "";
    let pattern  = label;
    if (label.startsWith("=")) { modifier = "="; pattern = label.slice(1).trim(); }
    else if (label.startsWith("^~")) { modifier = "^~"; pattern = label.slice(2).trim(); }
    else if (label.startsWith("~*")) { modifier = "~*"; pattern = label.slice(2).trim(); }
    else if (label.startsWith("~"))  { modifier = "~";  pattern = label.slice(1).trim(); }

    let matched = false;
    let priority = 0;

    if (modifier === "=") {
      matched = path === pattern;
      priority = 10000;
    } else if (modifier === "^~") {
      matched = path.startsWith(pattern);
      priority = 1000 + pattern.length;
    } else if (modifier === "~*") {
      try { matched = new RegExp(pattern, "i").test(path); } catch { matched = false; }
      priority = 100;
    } else if (modifier === "~") {
      try { matched = new RegExp(pattern).test(path); } catch { matched = false; }
      priority = 100;
    } else {
      matched = path.startsWith(pattern);
      priority = pattern.length;
    }

    if (matched) candidates.push({ block: loc, priority, label });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].block;
}

// ─── MAIN SIMULATOR ──────────────────────────────────────────────────────────

export function simulateRequest(ast: ParseResult, req: SimulatorRequest): SimulatorResult {
  const servers = getServerBlocks(ast.root);
  const matchedServers = servers.filter((s) => serverMatches(s, req));

  if (matchedServers.length === 0) {
    return {
      matched: false,
      appliedHeaders: [],
      warnings: ["No server block matched the request host/port combination."],
      matchPath: [],
      confidence: "uncertain",
    };
  }

  // Use first match (NGINX uses first matching server by default unless default_server)
  const server = matchedServers[0];
  const warnings: string[] = [];
  const matchPath: string[] = [`Matched server: ${server.contextLabel} (${server.file}:${server.line})`];

  if (matchedServers.length > 1) {
    warnings.push(`Multiple server blocks matched — using first one. Others: ${matchedServers.slice(1).map((s) => s.contextLabel).join(", ")}`);
  }

  // Check for redirect at server level
  const returnDirs = getDirectives(server, "return");
  for (const r of returnDirs) {
    if (r.rawValue.includes("301") || r.rawValue.includes("302")) {
      return {
        matched: true,
        matchedServerBlock: server,
        serverName: getServerNames(server)[0],
        listenPort: getListenPorts(server)[0],
        redirect: r.rawValue,
        appliedHeaders: [],
        warnings,
        matchPath: [...matchPath, `Redirect: return ${r.rawValue}`],
        confidence: "definite",
      };
    }
  }

  // Match location
  const matchedLocation = matchLocation(server, req.path);
  if (!matchedLocation) {
    warnings.push("No location block matched the request path. NGINX would return 404 or use root directive.");
  } else {
    matchPath.push(`Matched location: ${matchedLocation.contextLabel} (${matchedLocation.file}:${matchedLocation.line})`);
  }

  // Find proxy_pass
  const targetBlock = matchedLocation ?? server;
  const proxyPassDirs = getDirectives(targetBlock, "proxy_pass");
  const proxyPass = proxyPassDirs[0]?.rawValue;

  if (proxyPass?.includes("$")) {
    warnings.push("proxy_pass contains variables — actual upstream cannot be determined statically.");
  }

  // Collect applied headers
  const headerDirs = getEffectiveHeaders(matchedLocation ?? server);
  const appliedHeaders = headerDirs.map((d) => `add_header ${d.rawValue}`);

  // Check for rewrites
  const rewriteDirs = getDirectives(targetBlock, "rewrite");
  for (const r of rewriteDirs) {
    warnings.push(`Rewrite directive present: rewrite ${r.rawValue} — actual path may differ.`);
  }

  let confidence: MatchConfidence = "definite";
  if (warnings.length > 0) confidence = "probable";
  if (warnings.some((w) => w.includes("variables") || w.includes("cannot be determined"))) confidence = "uncertain";

  return {
    matched: true,
    matchedServerBlock: server,
    matchedLocation: matchedLocation ?? undefined,
    serverName: getServerNames(server)[0],
    listenPort: getListenPorts(server)[0],
    proxyPass,
    appliedHeaders,
    warnings,
    matchPath,
    confidence,
  };
}