// Behaviour of the design-doc scripts: the model twin must not lose content, must not carry SVG geometry,
// and must be caught when stale; the checker must catch the mistakes a writer makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMarkdown, twinPath } from '../extract-llm.mjs';
import { checkDoc } from '../check-doc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTRACT = path.join(here, '..', 'extract-llm.mjs');
const words = (s) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

const tmpDoc = (html, name = 'doc.html') => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-doc-'));
	const file = path.join(dir, name);
	fs.writeFileSync(file, html);
	return file;
};
const page = (body, first = '<!-- For agents: read doc.llm.md -->') =>
	`${first}\n<!doctype html><html><head><title>Doc</title><style>.x{color:red}</style></head><body><h1>Doc</h1>${body}</body></html>`;

test('tables keep every cell, including spans, pipes and lists inside cells', () => {
	const md = toMarkdown(page(`
		<table>
			<thead><tr><th>Key</th><th colspan="2">Window</th></tr></thead>
			<tbody>
				<tr><td rowspan="2">store</td><td>a | b</td><td><ul><li>one</li><li>two</li></ul></td></tr>
				<tr><td>c</td><td>d<br>e</td></tr>
			</tbody>
		</table>`));
	const rows = md.split('\n').filter((l) => l.startsWith('|'));
	assert.equal(rows.length, 4); // header, separator, 2 body rows
	for (const row of rows) assert.equal(row.replace(/\\\|/g, '').split('|').length - 2, 3, row);
	assert.match(md, /a \\\| b/);
	for (const w of ['store', 'one', 'two', 'c', 'd', 'e']) assert.ok(words(md).includes(w), w);
});

test('an SVG becomes its title and labels, with no geometry', () => {
	const md = toMarkdown(page(`
		<figure class="diagram"><svg viewBox="0 0 10 10"><title>Queue feeds the consumer</title>
			<defs><marker id="m"><path d="M0,0 L10,5"/></marker></defs>
			<rect x="1" y="2" width="3" height="4"/><text x="5" y="6"><tspan>first</tspan><tspan>line</tspan></text>
			<path d="M1,1 H9"/></svg>
			<figcaption>Figure 1. The flow.</figcaption></figure>`));
	assert.match(md, /\*\*\[diagram\]\*\* Queue feeds the consumer/);
	assert.match(md, /Labels: first line/);
	assert.match(md, /\*Figure 1\. The flow\.\*/);
	assert.doesNotMatch(md, /M0,0|viewBox|width=|x="/);
});

test('callouts become blockquotes and unknown classed blocks keep their text', () => {
	const md = toMarkdown(page(`
		<div class="decision"><h4>D1. Postgres first</h4><p><span class="lbl">Decision</span>Write Postgres, then the cache.</p></div>
		<div class="adr-legacy"><p>Kept as plain text.</p></div>`));
	assert.match(md, /^> \*\*\[decision\]\*\* \*\*D1\. Postgres first\*\*$/m);
	assert.match(md, /^> \*\*Decision:\*\* Write Postgres, then the cache\.$/m);
	assert.match(md, /^Kept as plain text\.$/m);
	assert.doesNotMatch(md, /color:red/);
});

test('code blocks keep their whitespace and decoded entities', () => {
	const md = toMarkdown(page('<pre><code class="language-json">{\n  "a": "&lt;b&gt; &amp; c"\n}</code></pre>'));
	assert.match(md, /```json\n\{\n {2}"a": "<b> & c"\n\}\n```/);
});

test('--check passes when fresh and fails when the HTML changed or the twin is missing', () => {
	const file = tmpDoc(page('<p>v1</p>'));
	const run = (...args) => {
		try { execFileSync('node', [EXTRACT, ...args, file], { stdio: 'pipe' }); return 0; }
		catch (e) { return e.status; }
	};
	assert.equal(run('--check'), 1); // missing
	assert.equal(run(), 0);
	assert.equal(run('--check'), 0);
	fs.writeFileSync(file, page('<p>v2</p>'));
	assert.equal(run('--check'), 1); // stale
	assert.match(fs.readFileSync(twinPath(file), 'utf8'), /^<!-- llm-twin source=doc\.html sha256=[0-9a-f]{64} /);
});

test('the checker catches what a writer gets wrong', () => {
	const file = tmpDoc(page(`
		<p><a href="#nowhere">link</a></p>
		<h2>Empty</h2>
		<h2>Full</h2><p>text Ledger text</p>
		<figure class="diagram"><svg><text>x</text></svg><figcaption>Figure 2. Wrong number.</figcaption></figure>
		<figure class="diagram"><!-- svg D02 --><figcaption>Figure 2. Not inlined.</figcaption></figure>
		<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>
		<pre><code>no language</code></pre>`, '<!doctype html>'));
	const vocab = path.join(path.dirname(file), 'vocab.json');
	fs.writeFileSync(vocab, JSON.stringify([{ pattern: '(?<!Case )\\bLedger\\b', reason: 'say "Case Ledger"' }]));
	const problems = checkDoc(file, { vocab }).join('\n');
	for (const expected of [/line 1: needs the routing comment/, /link to #nowhere/, /section "Empty" is empty/, /needs a <title>/,
		/caption says Figure 2, expected 1/, /D02: SVG not inlined/, /table 1, row 2: 1 columns, the table has 2/,
		/needs <code class="language-/, /vocabulary: "Ledger"/, /doc\.llm\.md is missing/]) {
		assert.match(problems, expected);
	}
	assert.doesNotMatch(problems, /section "Full"/);
});

test('a clean doc with a fresh twin passes the checker', () => {
	const file = tmpDoc(page(`<h2>One</h2><p>text</p>
		<figure class="diagram"><svg><title>What it shows</title></svg><figcaption>Figure 1. Caption.</figcaption></figure>
		<table><tr><th>a</th><th>b</th></tr><tr><td colspan="2">c</td></tr></table>
		<pre><code class="language-sql">select 1;</code></pre>`));
	execFileSync('node', [EXTRACT, file], { stdio: 'pipe' });
	assert.deepEqual(checkDoc(file, { vocab: null }), []);
});
