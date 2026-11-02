"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCRIPT_URL = "/downloads/sni_split_proxy.py";
const SCRIPT_SHA256 = "9dcae3130a52da5cc5c816c1e3c2a5fb5241fe4592d3a8ca8db9c32016567625";

type Os = "macos" | "linux" | "windows";

const OS_LABEL: Record<Os, string> = { macos: "macOS", linux: "Linux", windows: "Windows" };

const LABEL = "font-mono text-[11px] text-zinc-400 uppercase tracking-widest";
const INPUT =
  "w-full font-mono text-sm px-3 py-2.5 rounded-lg border border-zinc-700 bg-zinc-950/60 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-500";

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// ─── Command builders ─────────────────────────────────────────────────────────

function parseDomains(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const d = part.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    if (!d) continue;
    if (DOMAIN_RE.test(d)) {
      if (!valid.includes(d)) valid.push(d);
    } else {
      invalid.push(part);
    }
  }
  return { valid, invalid };
}

function buildCommands(os: Os, domains: string[], port: number, split: number) {
  const py = os === "windows" ? "py" : "python3";
  const flags = [
    port !== 8899 ? `--port ${port}` : "",
    split !== 5 ? `--split ${split}` : "",
    domains.length ? `--domains ${domains.join(",")}` : "",
    "-v",
  ].filter(Boolean).join(" ");
  const proxy = `http://127.0.0.1:${port}`;

  const download =
    os === "windows"
      ? `curl.exe -LO https://www.damonsec.com${SCRIPT_URL}\ncertutil -hashfile sni_split_proxy.py SHA256`
      : `curl -LO https://www.damonsec.com${SCRIPT_URL}\n${os === "macos" ? "shasum -a 256" : "sha256sum"} sni_split_proxy.py`;

  const run = `${py} sni_split_proxy.py ${flags}`;

  const testHost = domains[0] ? `https://${domains[0]}` : "https://example.com";
  const test =
    `curl -s -o ${os === "windows" ? "NUL" : "/dev/null"} -w "direct: %{http_code}\\n" ${testHost}\n` +
    `curl -s -o ${os === "windows" ? "NUL" : "/dev/null"} -x ${proxy} -w "proxy:  %{http_code}\\n" ${testHost}`;

  const browser =
    os === "macos"
      ? `open -na "Google Chrome" --args --user-data-dir="$HOME/.chrome-sni-split" --proxy-server=${proxy}`
      : os === "linux"
        ? `google-chrome --user-data-dir="$HOME/.chrome-sni-split" --proxy-server=${proxy}`
        : `start chrome --user-data-dir="%LOCALAPPDATA%\\chrome-sni-split" --proxy-server=${proxy}`;

  const pacRules = domains.length
    ? domains.map((d) => `host === "${d}" || dnsDomainIs(host, ".${d}")`).join(" ||\n      ")
    : "false";
  const pac =
    `function FindProxyForURL(url, host) {\n` +
    `  host = host.toLowerCase();\n` +
    `  if (${pacRules}) {\n` +
    `    return "PROXY 127.0.0.1:${port}";\n` +
    `  }\n` +
    `  return "DIRECT";\n` +
    `}\n`;

  return { download, run, test, browser, pac };
}

// ─── Components ───────────────────────────────────────────────────────────────

function CodeBlock({ title, code, note, file }: { title: string; code: string; note?: string; file?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const save = () => {
    if (!file) return;
    const url = URL.createObjectURL(new Blob([code], { type: "application/x-ns-proxy-autoconfig" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="font-mono text-sm font-semibold text-zinc-100">{title}</h2>
        <div className="flex gap-1.5">
          {file && (
            <button onClick={save}
              className="font-mono text-[11px] px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800">
              Save {file}
            </button>
          )}
          <button onClick={copy}
            className="font-mono text-[11px] px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {note && <p className="px-4 pt-1.5 text-xs text-zinc-400 leading-relaxed">{note}</p>}
      <pre className="m-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 font-mono text-xs leading-relaxed text-green-300 whitespace-pre">{code}</pre>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SniSplitProxyPage() {
  const [domainsRaw, setDomainsRaw] = useState("linkedin.com");
  const [portRaw, setPortRaw] = useState("8899");
  const [splitRaw, setSplitRaw] = useState("5");
  const [os, setOs] = useState<Os>("macos");

  const { valid: domains, invalid } = useMemo(() => parseDomains(domainsRaw), [domainsRaw]);
  const port = Number(portRaw);
  const split = Number(splitRaw);
  const portOk = Number.isInteger(port) && port >= 1024 && port <= 65535;
  const splitOk = Number.isInteger(split) && split >= 1 && split <= 64;
  const cmds = useMemo(
    () => buildCommands(os, domains, portOk ? port : 8899, splitOk ? split : 5),
    [os, domains, port, portOk, split, splitOk],
  );

  return (
    <div className="pb-24">
      <nav className="font-mono text-xs text-zinc-400 mb-6" aria-label="Breadcrumb">
        <Link href="/tools" className="hover:text-zinc-200 transition-colors">~/tools</Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-300">sni-split-proxy</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">SNI Split Proxy</h1>
        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          If HTTPS to one domain fails with <code className="text-green-400">Connection reset by peer</code> right after the TLS
          Client Hello, an on-path filter is probably reading the hostname (SNI). This small Python proxy runs on your own machine
          and sends the first 5 bytes of the Client Hello in a TCP segment of their own, so a filter that doesn&apos;t reassemble
          TCP can&apos;t read the name. TLS is never decrypted.
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-400">
          Python 3.9+, standard library only · listens on 127.0.0.1 · this page only builds commands, nothing is sent anywhere
        </p>
      </header>

      <div className="xl:-mx-24">
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* Inputs */}
          <div className="lg:sticky lg:top-20 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-5">
            <div className="space-y-2">
              <span className={LABEL}>1 · Download</span>
              <div className="flex flex-wrap items-center gap-3">
                <a href={SCRIPT_URL} download
                  className="inline-flex items-center gap-1 rounded-lg bg-green-400 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-green-300 transition-colors">
                  sni_split_proxy.py ↓
                </a>
                <a href={SCRIPT_URL} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">
                  read the source
                </a>
              </div>
              <p className="font-mono text-[11px] text-zinc-500 break-all">sha256 {SCRIPT_SHA256}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sni-domains" className={LABEL}>2 · Blocked domains</label>
              <textarea id="sni-domains" value={domainsRaw} onChange={(e) => setDomainsRaw(e.target.value)} rows={3}
                spellCheck={false} autoComplete="off" placeholder="linkedin.com, example.org"
                className={`${INPUT} resize-y`} />
              <p className="text-xs text-zinc-400 leading-relaxed">
                Subdomains are included. Leave empty to split every connection.
              </p>
              {invalid.length > 0 && (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
                  Ignored (not a domain name): {invalid.join(", ")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="sni-port" className={LABEL}>Port</label>
                <input id="sni-port" type="number" min={1024} max={65535} value={portRaw}
                  onChange={(e) => setPortRaw(e.target.value)} className={INPUT} />
                {!portOk && <p className="text-xs text-amber-300">1024–65535; using 8899</p>}
              </div>
              <div className="space-y-2">
                <label htmlFor="sni-split" className={LABEL}>Split at byte</label>
                <input id="sni-split" type="number" min={1} max={64} value={splitRaw}
                  onChange={(e) => setSplitRaw(e.target.value)} className={INPUT} />
                {!splitOk && <p className="text-xs text-amber-300">1–64; using 5</p>}
              </div>
            </div>

            <div className="space-y-2">
              <span className={LABEL}>Your OS</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Operating system">
                {(Object.keys(OS_LABEL) as Os[]).map((o) => (
                  <button key={o} role="radio" aria-checked={os === o} onClick={() => setOs(o)}
                    className={`font-mono text-[11px] px-3 py-1.5 rounded border transition-colors ${
                      os === o
                        ? "border-green-500/50 bg-green-900/30 text-green-300"
                        : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:text-zinc-100"
                    }`}>
                    {OS_LABEL[o]}
                  </button>
                ))}
              </div>
              {os === "windows" && (
                <p className="text-xs text-zinc-400">Tested on macOS. The script uses only portable asyncio and socket calls, but Windows hasn&apos;t been tested.</p>
              )}
            </div>
          </div>

          {/* Outputs */}
          <div className="flex flex-col gap-3 min-w-0">
            <CodeBlock title="Download and verify" code={cmds.download}
              note="The hash should match the one shown next to the download button." />
            <CodeBlock title="Run the proxy" code={cmds.run}
              note="Leave it running in a terminal. Ctrl+C stops it. -v logs one line per connection (split or pass)." />
            <CodeBlock title="Test it" code={cmds.test}
              note="Direct should fail (000) and the proxy should return a real status code. If both fail, try a different split size." />
            <CodeBlock title="Browser (separate profile)" code={cmds.browser}
              note="Starts Chrome with its own profile that uses the proxy. Your normal browser and system proxy stay untouched." />
            <CodeBlock title="PAC file (optional)" code={cmds.pac} file="sni-split.pac"
              note="Sends only the listed domains through the proxy. Point a browser's or the system's automatic proxy configuration at this file." />
          </div>
        </div>
      </div>

      {/* Static content */}
      <div className="mt-16 space-y-12 max-w-3xl">
        <div className="border-t border-zinc-800" />

        <section className="space-y-3">
          <h2 className="font-mono text-lg font-bold text-zinc-100">How it works</h2>
          <ol className="space-y-2 text-sm text-zinc-400 leading-relaxed list-decimal pl-5">
            <li>The browser asks the proxy for a tunnel with <code className="text-green-400">CONNECT host:443</code>.</li>
            <li>The proxy resolves the host over DNS-over-HTTPS, so a resolver that answers <code className="text-green-400">127.0.0.1</code> for blocked names doesn&apos;t matter, and opens TCP with <code className="text-green-400">TCP_NODELAY</code>.</li>
            <li>If the first packet from the browser is a TLS handshake record (<code className="text-green-400">0x16</code>), the proxy sends the first 5 bytes, waits 10 ms, then sends the rest.</li>
            <li>After that it relays bytes unchanged in both directions. The browser validates the site&apos;s real certificate.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-lg font-bold text-zinc-100">First, check it&apos;s an SNI filter</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This only helps when the reset follows the hostname. Send the blocked name to an unrelated IP; if that is reset too,
            the filter is reading the SNI:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 font-mono text-xs text-green-300">curl -sv -k -I --resolve {domains[0] ?? "blocked.example"}:443:1.1.1.1 https://{domains[0] ?? "blocked.example"}</pre>
          <p className="text-sm text-zinc-400 leading-relaxed">
            The full diagnosis, including finding the hop that injects the reset, is in{" "}
            <Link href="/blog/tls-connection-reset-sni-blocking" className="text-green-400 hover:underline">Connection Reset After Client Hello: Prove SNI Blocking</Link>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-lg font-bold text-zinc-100">Limits</h2>
          <ul className="space-y-2 text-sm text-zinc-400 leading-relaxed list-disc pl-5">
            <li>A filter that reassembles TCP can&apos;t be fooled by splitting. Use a VPN in that case.</li>
            <li>HTTPS only (<code className="text-green-400">CONNECT</code>). Plain HTTP requests get a 405.</li>
            <li>Upstream connections use IPv4.</li>
            <li>The split size that works depends on the filter. In the lab, byte 5 worked and byte 100 did not.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-lg font-bold text-zinc-100">Use it where you&apos;re allowed to</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            On a company or school network a filter is policy, and getting around it can break the rules you agreed to.
            Endpoint security may flag a local proxy like this. Laws on bypassing ISP filtering differ by country.
            This tool is for your own connection, where you decide how it&apos;s used.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-lg font-bold text-zinc-100">Related</h2>
          <ul className="space-y-2">
            {[
              { text: "Build a Python Proxy That Splits the TLS Client Hello (lab write-up)", href: "/blog/python-sni-split-proxy" },
              { text: "Connection Reset After Client Hello: Prove SNI Blocking",            href: "/blog/tls-connection-reset-sni-blocking" },
              { text: "How to check which DNS server is answering",                         href: "/blog/dns-not-resolving-linux-fix" },
            ].map(({ text, href }) => (
              <li key={href}>
                <Link href={href} className="font-mono text-sm text-green-400 hover:underline">→ {text}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
