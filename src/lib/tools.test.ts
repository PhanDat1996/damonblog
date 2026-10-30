// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { WEB_TOOLS, toolsForPost, toolJsonLd, toolMetadata } from './tools.ts';

test('every related post exists, so the call-outs never point at a removed slug', () => {
  for (const tool of WEB_TOOLS) {
    for (const slug of tool.relatedPosts) {
      assert.ok(existsSync(join(process.cwd(), 'posts', `${slug}.md`)), `${tool.slug} → ${slug}`);
    }
  }
});

test('every tool has a page, layout and OG image route', () => {
  for (const tool of WEB_TOOLS) {
    for (const file of ['page.tsx', 'layout.tsx', 'opengraph-image.tsx']) {
      assert.ok(existsSync(join(process.cwd(), 'src/app/tools', tool.slug, file)), `${tool.slug}/${file}`);
    }
  }
});

test('titles and meta descriptions fit in search results', () => {
  for (const tool of WEB_TOOLS) {
    assert.ok(tool.seoTitle.length <= 60, `${tool.slug} title: ${tool.seoTitle.length} chars`);
    assert.ok(tool.description.length >= 110 && tool.description.length <= 175, `${tool.slug}: ${tool.description.length} chars`);
  }
});

test('toolsForPost ranks the more specific tool first and caps the list', () => {
  assert.deepEqual(toolsForPost('nginx-ssl-hardening').map((t) => t.slug), ['nginx-cis-hardening-checker', 'nginx-config-analyzer']);
  assert.deepEqual(toolsForPost('nginx-502-under-load').map((t) => t.slug), ['nginx-config-analyzer']);
  assert.deepEqual(toolsForPost('some-unrelated-post'), []);
});

test('structured data and metadata use the canonical tool URL', () => {
  const [app, crumbs] = toolJsonLd('pg-hardening-checker') as Array<Record<string, unknown>>;
  assert.equal(app['@type'], 'WebApplication');
  assert.equal(app.url, 'https://www.damonsec.com/tools/pg-hardening-checker');
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  const meta = toolMetadata('pg-hardening-checker');
  assert.equal(meta.alternates?.canonical, 'https://www.damonsec.com/tools/pg-hardening-checker');
  assert.equal((meta.twitter as { card?: string }).card, 'summary_large_image');
});
