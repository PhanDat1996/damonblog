// parser.ts — context-aware NGINX config parser

import type {
  NginxBlock,
  NginxDirective,
  NginxContextType,
  ParseResult,
  ParseError,
  ConfigFile,
} from "./types";

// ─── TOKENIZER ────────────────────────────────────────────────────────────────

type TokenType = "word" | "semicolon" | "open_brace" | "close_brace" | "comment" | "eof";

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

function tokenize(source: string, filename: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  while (i < source.length) {
    const ch = source[i];

    // Newline tracking
    if (ch === "\n") {
      line++;
      lineStart = i + 1;
      i++;
      continue;
    }

    // Whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Comment
    if (ch === "#") {
      const start = i;
      while (i < source.length && source[i] !== "\n") i++;
      tokens.push({ type: "comment", value: source.slice(start, i), line, col: start - lineStart });
      continue;
    }

    // Braces
    if (ch === "{") {
      tokens.push({ type: "open_brace", value: "{", line, col: i - lineStart });
      i++; continue;
    }
    if (ch === "}") {
      tokens.push({ type: "close_brace", value: "}", line, col: i - lineStart });
      i++; continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semicolon", value: ";", line, col: i - lineStart });
      i++; continue;
    }

    // Quoted string
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      const col = i - lineStart;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\n") line++;
        i++;
      }
      i++; // closing quote
      tokens.push({ type: "word", value: source.slice(start, i), line, col });
      continue;
    }

    // Word / bareword
    const start = i;
    const col = i - lineStart;
    while (i < source.length && !/[\s{};"']/.test(source[i])) i++;
    if (i > start) {
      tokens.push({ type: "word", value: source.slice(start, i), line, col });
    } else {
      i++; // skip unknown char
    }
  }

  tokens.push({ type: "eof", value: "", line, col: 0 });
  return tokens;
}

// ─── CONTEXT HELPERS ─────────────────────────────────────────────────────────

const BLOCK_DIRECTIVES = new Set([
  "http", "events", "server", "location", "upstream", "geo", "map",
  "if", "limit_except", "mail", "stream", "types", "split_clients",
]);

function inferContextType(name: string, values: string[]): NginxContextType {
  const n = name.toLowerCase();
  if (n === "http")     return "http";
  if (n === "events")   return "events";
  if (n === "server")   return "server";
  if (n === "location") return "location";
  if (n === "upstream") return "upstream";
  if (n === "geo")      return "geo";
  if (n === "map")      return "map";
  if (n === "if")       return "if";
  if (n === "limit_except") return "limit_except";
  return "unknown";
}

function buildContextLabel(name: string, values: string[]): string {
  if (values.length === 0) return name;
  return `${name} ${values.join(" ")}`;
}

function buildContextPath(parent: NginxBlock | undefined, label: string): string {
  if (!parent || parent.contextType === "main") return label;
  return `${parent.contextPath} > ${label}`;
}

// ─── PARSER ───────────────────────────────────────────────────────────────────

interface ParserState {
  tokens: Token[];
  pos: number;
  filename: string;
  errors: ParseError[];
}

function peek(state: ParserState): Token {
  return state.tokens[state.pos] ?? { type: "eof", value: "", line: 0, col: 0 };
}

function consume(state: ParserState): Token {
  return state.tokens[state.pos++] ?? { type: "eof", value: "", line: 0, col: 0 };
}

function parseBlock(state: ParserState, parent: NginxBlock | undefined, contextType: NginxContextType, contextLabel: string, line: number): NginxBlock {
  const contextPath = buildContextPath(parent, contextLabel);
  const block: NginxBlock = {
    contextType,
    contextLabel,
    contextPath,
    line,
    file: state.filename,
    directives: [],
    parent,
  };

  // consume opening brace if present
  if (peek(state).type === "open_brace") consume(state);

  while (peek(state).type !== "eof" && peek(state).type !== "close_brace") {
    const tok = peek(state);

    if (tok.type === "comment") { consume(state); continue; }

    if (tok.type === "word") {
      const directive = parseDirective(state, block);
      if (directive) block.directives.push(directive);
    } else {
      // unexpected token, skip
      consume(state);
    }
  }

  if (peek(state).type === "close_brace") consume(state);

  return block;
}

function parseDirective(state: ParserState, parent: NginxBlock): NginxDirective | null {
  const nameTok = consume(state);
  if (nameTok.type !== "word") return null;

  const name = nameTok.value;
  const line = nameTok.line;
  const col  = nameTok.col;
  const values: string[] = [];

  // collect values until ; or {
  while (peek(state).type === "word") {
    values.push(consume(state).value);
  }

  const rawValue = values.join(" ");

  // Check if this is a block directive
  if (peek(state).type === "open_brace" || BLOCK_DIRECTIVES.has(name.toLowerCase())) {
    const contextType  = inferContextType(name, values);
    const contextLabel = buildContextLabel(name, values);
    if (peek(state).type === "open_brace") {
      consume(state); // consume {
      const contextPath = buildContextPath(parent, contextLabel);
      const block: NginxBlock = {
        contextType,
        contextLabel,
        contextPath,
        line,
        file: state.filename,
        directives: [],
        parent,
      };

      while (peek(state).type !== "eof" && peek(state).type !== "close_brace") {
        const tok = peek(state);
        if (tok.type === "comment") { consume(state); continue; }
        if (tok.type === "word") {
          const child = parseDirective(state, block);
          if (child) block.directives.push(child);
        } else {
          consume(state);
        }
      }
      if (peek(state).type === "close_brace") consume(state);

      return { name, values, rawValue, line, col, file: state.filename, block };
    }
  }

  // Regular directive — consume semicolon
  if (peek(state).type === "semicolon") consume(state);
  else if (peek(state).type !== "eof" && peek(state).type !== "close_brace") {
    state.errors.push({ message: `Expected ; after directive '${name}'`, line, file: state.filename });
  }

  return { name, values, rawValue, line, col, file: state.filename };
}

function parseFile(content: string, filename: string): { block: NginxBlock; errors: ParseError[] } {
  // Strip comments before tokenizing for cleaner processing
  const errors: ParseError[] = [];
  const tokens = tokenize(content, filename);
  const state: ParserState = { tokens, pos: 0, filename, errors };

  const root: NginxBlock = {
    contextType: "main",
    contextLabel: "main",
    contextPath: "main",
    line: 1,
    file: filename,
    directives: [],
    parent: undefined,
  };

  while (peek(state).type !== "eof") {
    const tok = peek(state);
    if (tok.type === "comment") { consume(state); continue; }
    if (tok.type === "close_brace") { consume(state); continue; } // stray }
    if (tok.type === "word") {
      const directive = parseDirective(state, root);
      if (directive) root.directives.push(directive);
    } else {
      consume(state);
    }
  }

  return { block: root, errors };
}

// ─── MULTI-FILE PARSING WITH INCLUDE RESOLUTION ───────────────────────────────

export function parseConfigs(files: ConfigFile[]): ParseResult {
  if (files.length === 0) {
    return {
      root: { contextType: "main", contextLabel: "main", contextPath: "main", line: 1, file: "", directives: [], parent: undefined },
      errors: [],
      files: [],
    };
  }

  const allErrors: ParseError[] = [];
  const fileMap = new Map<string, ConfigFile>(files.map((f) => [f.filename, f]));
  const parsedBlocks = new Map<string, NginxBlock>();
  const incompleteIncludes: string[] = [];

  // Parse all provided files
  for (const file of files) {
    const { block, errors } = parseFile(file.content, file.filename);
    parsedBlocks.set(file.filename, block);
    allErrors.push(...errors);
  }

  // Resolve includes in main file (first file is entry point)
  const mainBlock = parsedBlocks.get(files[0].filename)!;
  resolveIncludes(mainBlock, parsedBlocks, fileMap, incompleteIncludes, allErrors);

  // Add incomplete include warnings
  for (const missing of incompleteIncludes) {
    allErrors.push({
      message: `include target '${missing}' not provided — analysis of that scope may be incomplete`,
      line: 0,
      file: files[0].filename,
    });
  }

  return {
    root: mainBlock,
    errors: allErrors,
    files: files.map((f) => f.filename),
  };
}

function resolveIncludes(
  block: NginxBlock,
  parsedBlocks: Map<string, NginxBlock>,
  fileMap: Map<string, ConfigFile>,
  missing: string[],
  errors: ParseError[]
): void {
  for (const directive of block.directives) {
    if (directive.name.toLowerCase() === "include" && directive.values.length > 0) {
      const target = directive.values[0].replace(/['"]/g, "");
      const basename = target.split("/").pop() ?? target;

      // Try to find by full path or basename
      const resolved = parsedBlocks.get(target) ?? parsedBlocks.get(basename);
      if (resolved) {
        // Inject the resolved block's directives as children of current block
        for (const child of resolved.directives) {
          // update file reference
          block.directives.push({ ...child, file: child.file || target });
        }
      } else {
        // Only add to missing if not a wildcard
        if (!target.includes("*") && !missing.includes(target)) {
          missing.push(target);
        }
      }
    }

    // Recurse into blocks
    if (directive.block) {
      resolveIncludes(directive.block, parsedBlocks, fileMap, missing, errors);
    }
  }
}

// ─── AST QUERY HELPERS ───────────────────────────────────────────────────────

/** Get all directives with a given name in a block (non-recursive) */
export function getDirectives(block: NginxBlock, name: string): NginxDirective[] {
  const lower = name.toLowerCase();
  return block.directives.filter((d) => d.name.toLowerCase() === lower);
}

/** Get first directive value string, or null */
export function getDirectiveValue(block: NginxBlock, name: string): string | null {
  const dirs = getDirectives(block, name);
  return dirs.length > 0 ? dirs[0].rawValue : null;
}

/** Get all directives recursively from block downward */
export function getAllDirectivesDeep(block: NginxBlock, name: string): NginxDirective[] {
  const result: NginxDirective[] = [];
  const lower = name.toLowerCase();

  function recurse(b: NginxBlock) {
    for (const d of b.directives) {
      if (d.name.toLowerCase() === lower) result.push(d);
      if (d.block) recurse(d.block);
    }
  }
  recurse(block);
  return result;
}

/** Get all blocks of a given context type, recursively */
export function getBlocksOfType(root: NginxBlock, type: NginxContextType): NginxBlock[] {
  const result: NginxBlock[] = [];

  function recurse(b: NginxBlock) {
    if (b.contextType === type && b !== root) result.push(b);
    for (const d of b.directives) {
      if (d.block) recurse(d.block);
    }
  }
  recurse(root);
  return result;
}

/** Get child blocks of a given context type from immediate children only */
export function getChildBlocks(block: NginxBlock, type: NginxContextType): NginxBlock[] {
  return block.directives
    .filter((d) => d.block?.contextType === type)
    .map((d) => d.block!);
}

/** Collect all server blocks */
export function getServerBlocks(root: NginxBlock): NginxBlock[] {
  const httpBlocks = getBlocksOfType(root, "http");
  const result: NginxBlock[] = [];
  for (const http of httpBlocks) {
    result.push(...getChildBlocks(http, "server"));
  }
  // Also direct children of root (non-http server blocks)
  result.push(...getChildBlocks(root, "server"));
  return result;
}

/** Check if a block or its ancestors is an HTTPS server */
export function isHttpsServer(serverBlock: NginxBlock): boolean {
  const listenDirs = getDirectives(serverBlock, "listen");
  return listenDirs.some((d) => {
    const v = d.rawValue.toLowerCase();
    return v.includes("443") || v.includes("ssl");
  });
}

/** Check if a block has proxy_pass anywhere */
export function hasProxyPass(block: NginxBlock): boolean {
  return getAllDirectivesDeep(block, "proxy_pass").length > 0;
}

/** Get upstream blocks from root */
export function getUpstreamBlocks(root: NginxBlock): NginxBlock[] {
  return getBlocksOfType(root, "upstream");
}

/** Get all add_header directives in block + parents (for inheritance checking) */
export function getEffectiveHeaders(block: NginxBlock): NginxDirective[] {
  const headers: NginxDirective[] = [];
  let current: NginxBlock | undefined = block;
  while (current) {
    headers.push(...getDirectives(current, "add_header"));
    current = current.parent;
  }
  return headers;
}

/** Check if a header name exists in add_header directives */
export function hasHeader(directives: NginxDirective[], headerName: string): boolean {
  const lower = headerName.toLowerCase();
  return directives.some((d) => d.rawValue.toLowerCase().includes(lower));
}

/** Get listen ports from a server block */
export function getListenPorts(serverBlock: NginxBlock): string[] {
  return getDirectives(serverBlock, "listen").map((d) => d.rawValue);
}

/** Get server_name values from a server block */
export function getServerNames(serverBlock: NginxBlock): string[] {
  const dir = getDirectives(serverBlock, "server_name");
  return dir.flatMap((d) => d.values);
}

/** Check if upstream block has keepalive */
export function upstreamHasKeepalive(upstream: NginxBlock): boolean {
  return getDirectives(upstream, "keepalive").length > 0;
}

/** Find upstream block used by a given proxy_pass value */
export function findUsedUpstream(root: NginxBlock, proxyPassValue: string): NginxBlock | null {
  const upstreams = getUpstreamBlocks(root);
  for (const u of upstreams) {
    const name = u.contextLabel.replace(/^upstream\s+/, "").trim();
    if (proxyPassValue.includes(name)) return u;
  }
  return null;
}