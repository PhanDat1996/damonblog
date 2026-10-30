#!/usr/bin/env node
// Compares two versions of src/lib/nginx-cve/advisories.ts, ignoring ADVISORIES_UPDATED.
// Used by .github/workflows/update-nginx-advisories.yml to decide whether a refresh
// is worth a PR, and to write the PR body.
//
// Usage: node scripts/diff-nginx-advisories.mjs <old.ts> <new.ts> [body.md]
// Prints "changed=true|false" (append to $GITHUB_OUTPUT) and writes the PR body to body.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseGenerated(src) {
  const str = (name) => src.match(new RegExp(`export const ${name} = ("[^"]*");`))?.[1];
  const list = src.match(/export const ADVISORIES: Advisory\[\] = (\[[\s\S]*\]);\s*$/)?.[1];
  const mainline = str('LATEST_MAINLINE_VERSION');
  const stable = str('LATEST_STABLE_VERSION');
  if (!mainline || !stable || !list) throw new Error('Unrecognised advisories.ts layout');
  return {
    updated: JSON.parse(str('ADVISORIES_UPDATED') ?? '""'),
    mainline: JSON.parse(mainline),
    stable: JSON.parse(stable),
    advisories: JSON.parse(list),
  };
}

export function diffGenerated(oldSrc, newSrc) {
  const a = parseGenerated(oldSrc);
  const b = parseGenerated(newSrc);
  const before = new Map(a.advisories.map((x) => [x.id, JSON.stringify(x)]));
  const after = new Map(b.advisories.map((x) => [x.id, JSON.stringify(x)]));
  const added = b.advisories.filter((x) => !before.has(x.id));
  const removed = a.advisories.filter((x) => !after.has(x.id));
  const modified = b.advisories.filter((x) => before.has(x.id) && before.get(x.id) !== after.get(x.id));
  const changed = added.length > 0 || removed.length > 0 || modified.length > 0
    || JSON.stringify(a.advisories.map((x) => x.id)) !== JSON.stringify(b.advisories.map((x) => x.id))
    || a.mainline !== b.mainline || a.stable !== b.stable;
  return { old: a, new: b, added, removed, modified, changed };
}

export function prBody(d) {
  const row = (x) => `| ${x.id} | ${x.severity} | ${x.title.replace(/\|/g, '\\|')} |`;
  const table = (xs) => ['| ID | Severity | Title |', '| --- | --- | --- |', ...xs.map(row)].join('\n');
  const ver = (label, from, to) => `| ${label} | ${from} | ${to}${from === to ? '' : ' ⬆'} |`;
  const out = [
    'Automated refresh of the NGINX CVE checker data from nginx.org (`npm run update:nginx-advisories`).',
    '',
    '## Latest versions',
    '',
    '| Branch | Before | After |',
    '| --- | --- | --- |',
    ver('Mainline', d.old.mainline, d.new.mainline),
    ver('Stable', d.old.stable, d.new.stable),
    '',
    `## Advisories (${d.old.advisories.length} → ${d.new.advisories.length})`,
    '',
  ];
  if (d.added.length) out.push(`### New (${d.added.length})`, '', table(d.added), '');
  if (d.modified.length) out.push(`### Changed (${d.modified.length})`, '', table(d.modified), '');
  if (d.removed.length) out.push(`### Removed (${d.removed.length})`, '', table(d.removed), '');
  if (!d.added.length && !d.modified.length && !d.removed.length) out.push('No advisory changes — version bump only.', '');
  out.push(
    '`npm test` passed in the workflow run. Review the diff, then merge to deploy.',
    '',
    '_Opened by `.github/workflows/update-nginx-advisories.yml`. Run it manually from the Actions tab (**Update NGINX advisories → Run workflow**) or with `gh workflow run update-nginx-advisories.yml`._',
  );
  return out.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [oldPath, newPath, bodyPath] = process.argv.slice(2);
  if (!oldPath || !newPath) {
    console.error('Usage: node scripts/diff-nginx-advisories.mjs <old.ts> <new.ts> [body.md]');
    process.exit(2);
  }
  const d = diffGenerated(readFileSync(oldPath, 'utf8'), readFileSync(newPath, 'utf8'));
  if (bodyPath) writeFileSync(bodyPath, prBody(d));
  console.error(`added=${d.added.length} modified=${d.modified.length} removed=${d.removed.length} `
    + `mainline ${d.old.mainline}→${d.new.mainline} stable ${d.old.stable}→${d.new.stable}`);
  console.log(`changed=${d.changed}`);
}
