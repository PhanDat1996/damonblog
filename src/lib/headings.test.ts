// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addHeadingIds, slugify, splitAtFirstH2 } from './headings.ts';

test('slugify keeps words and drops punctuation and apostrophes', () => {
  assert.equal(slugify("The commands you'll actually use"), 'the-commands-youll-actually-use');
  assert.equal(slugify('netstat vs ss'), 'netstat-vs-ss');
  assert.equal(slugify('Step 1: who has the port?'), 'step-1-who-has-the-port');
});

test('h2 and h3 get ids, anchors and TOC entries; h4 is left alone', () => {
  const { html, headings } = addHeadingIds('<h2>Read the output</h2><h3>Process</h3><h4>Note</h4>');
  assert.deepEqual(headings, [
    { id: 'read-the-output', text: 'Read the output', level: 2 },
    { id: 'process', text: 'Process', level: 3 },
  ]);
  assert.match(html, /<h2 id="read-the-output">Read the output<a class="heading-anchor" href="#read-the-output"/);
  assert.match(html, /<h4>Note<\/h4>/);
});

test('inline code and entities become plain TOC text', () => {
  const { headings } = addHeadingIds('<h2>Why <code>ss</code> &#x26; lsof don&#x27;t agree</h2>');
  assert.equal(headings[0].text, "Why ss & lsof don't agree");
  assert.equal(headings[0].id, 'why-ss-lsof-dont-agree');
});

test('duplicate headings get unique ids', () => {
  const { headings } = addHeadingIds('<h3>Example</h3><h3>Example</h3><h3>Example</h3>');
  assert.deepEqual(headings.map((h) => h.id), ['example', 'example-2', 'example-3']);
});

test('the anchor adds no visible text', () => {
  const { html } = addHeadingIds('<h2>FAQ</h2>');
  assert.equal(html.replace(/<[^>]+>/g, ''), 'FAQ');
});

test('splitAtFirstH2 keeps the intro before the first h2', () => {
  assert.deepEqual(splitAtFirstH2('<p>a</p><h2 id="x">X</h2><p>b</p>'), ['<p>a</p>', '<h2 id="x">X</h2><p>b</p>']);
  assert.deepEqual(splitAtFirstH2('<p>only</p>'), ['<p>only</p>', '']);
});
