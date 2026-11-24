// The diagram kit: every template draws to a static, themed SVG that survives inline-figures and check-doc.
// Chrome tests skip, with a message, when no Chrome or no Playwright deps are found (as render.test.mjs does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../render.mjs';
import { checkSvg, pageOf } from '../draw.mjs';
import { checkDoc } from '../check-doc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(here, '..');
const DIAGRAMS = path.join(SCRIPTS, '..', 'references', 'diagrams');
const TEMPLATE = path.join(SCRIPTS, '..', 'references', 'template.html');
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-draw-')));
const run = (script, args) => spawnSync('node', [path.join(SCRIPTS, script), ...args], { encoding: 'utf8' });

const depsDir = process.env.GUTIX_DEPS || path.join(os.homedir(), '.cache', 'gutix');
let hasDeps = true;
try { createRequire(path.join(depsDir, 'package.json'))('playwright-core'); } catch { hasDeps = false; }
const skip = !findChrome() ? 'no Chrome (set CHROME_PATH or install chromium)' : !hasDeps ? 'deps missing (run skills/design-doc/scripts/setup.sh)' : false;
if (skip) console.log(`# draw tests that need Chrome are skipped: ${skip}`);

const templates = fs.readdirSync(DIAGRAMS).filter((f) => f.endsWith('.html')).sort();
const figsDir = (sources) => {
  const dir = path.join(tmp(), 'doc-figs');
  fs.mkdirSync(dir);
  sources.forEach((src, i) => fs.writeFileSync(path.join(dir, `D${String(i + 1).padStart(2, '0')}.html`), src));
  return dir;
};
const templateSource = (name) => fs.readFileSync(path.join(DIAGRAMS, name), 'utf8');

test('the eight diagram types ship as templates', () => {
  assert.deepEqual(templates, ['architecture.html', 'class.html', 'data.html', 'er.html', 'flow.html', 'rollout.html', 'sequence.html', 'state.html']);
  for (const t of templates) assert.match(templateSource(t), /^<!--\s*\n\s*\S[^\n]*\n\s*Use when:/, `${t} opens with a comment that says when to use it`);
});

test('every template draws one SVG with a viewBox, a title and text, and no script', { skip }, () => {
  const dir = figsDir(templates.map(templateSource));
  const r = run('draw.mjs', [dir]);
  assert.equal(r.status, 0, r.stderr);
  const svgs = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));
  assert.equal(svgs.length, templates.length);
  for (const f of svgs) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(svg, /<svg\b[^>]*\bviewBox="/, f);
    assert.match(svg, /<title>\s*\S[^<]*<\/title>/, f);
    assert.match(svg, /<text\b/, f);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b/i, f);
    assert.deepEqual(checkSvg(svg), [], f);
  }
});

test('figures stay on the theme: inlined into a doc, check-doc finds no literal colour; ids stay unique across figures', { skip }, () => {
  const dir = figsDir([templateSource('architecture.html'), templateSource('architecture.html'), templateSource('flow.html')]);
  const r = run('draw.mjs', [dir]);
  assert.equal(r.status, 0, r.stderr);
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const head = template.slice(0, template.indexOf('<body'));
  const figure = (n) => `<figure class="diagram" id="fig-${n}">\n  <!-- svg D0${n} -->\n  <figcaption>Figure ${n}. What the diagram shows.</figcaption>\n</figure>`;
  const docPath = path.join(path.dirname(dir), 'doc.html');
  fs.writeFileSync(docPath, `<!-- For agents: read doc.llm.md instead of this file. -->\n${head.replace(/^<!--[\s\S]*?-->\s*/, '')}<body>\n<h1>Doc</h1>\n<h2>Figures</h2>\n<p>Three figures drawn by the kit.</p>\n${[1, 2, 3].map(figure).join('\n')}\n</body>\n</html>\n`);
  assert.equal(run('inline-figures.mjs', [docPath, dir]).status, 0);
  assert.equal(run('extract-llm.mjs', [docPath]).status, 0);
  assert.deepEqual(checkDoc(docPath), []);
  // markers, gradients and clip paths: every id in the page appears once, and every url(#id) points at an id that exists
  const html = fs.readFileSync(docPath, 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  for (const m of html.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(m[1]), `url(#${m[1]}) has no target`);
  assert.ok(ids.some((i) => i.startsWith('D01-')) && ids.some((i) => i.startsWith('D02-')), 'ids carry the figure id');
});

test('text below 13 px is refused, and the error names the label', { skip }, () => {
  const bad = '<title>Too small</title><div id="canvas"></div><script>K.draw(() => { K.svg(300, 100); K.text(10, 40, "tiny label", { size: 11 }); });</script>';
  const dir = figsDir([bad]);
  const r = run('draw.mjs', [dir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /tiny label/);
  assert.match(r.stderr, /13px/);
  assert.equal(fs.existsSync(path.join(dir, 'D01.svg')), false);
});

test('a source that reads the network or the disk gets nothing, and a script error fails the figure', { skip }, () => {
  const src = '<title>Net</title><div id="canvas"></div><script>K.draw(async () => { const r = await fetch("https://example.com/").then(() => "reached", () => "blocked"); K.svg(300, 100); K.text(10, 40, r, { size: 14 }); });</script>';
  const dir = figsDir([src, '<title>Boom</title><script>throw new Error("kaput")</script>']);
  const r = run('draw.mjs', [dir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /D02\.html: .*kaput/);
  assert.match(fs.readFileSync(path.join(dir, 'D01.svg'), 'utf8'), /blocked/);
});

test('a drawing with active or external content is refused and nothing is written for it', { skip }, () => {
  const shapes = {
    onload: 'root.setAttribute("onload", "alert(1)")',
    'javascript href': 'const a = document.createElementNS("http://www.w3.org/2000/svg", "a"); a.setAttribute("href", "javascript:alert(1)"); root.appendChild(a)',
    'external image': 'const i = document.createElementNS("http://www.w3.org/2000/svg", "image"); i.setAttribute("href", "https://example.com/x.png"); root.appendChild(i)',
    'external url()': 'const r = document.createElementNS("http://www.w3.org/2000/svg", "rect"); r.setAttribute("fill", "url(https://example.com/p.svg#x)"); root.appendChild(r)'
  };
  const source = (inject) => `<title>Active</title><div id="canvas"></div><script>K.draw(() => { K.svg(300, 100); const root = document.querySelector("svg"); K.text(10, 40, "label", { size: 14 }); ${inject}; });</script>`;
  const dir = figsDir(Object.values(shapes).map(source));
  const r = run('draw.mjs', [dir]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).length, 0, 'no svg written');
  assert.equal(r.stderr.trim().split('\n').length, Object.keys(shapes).length, r.stderr);
});

test('checkSvg flags on* attributes, non-fragment hrefs and url() outside #fragment, and lets fragments through', () => {
  const wrap = (inner) => `<svg viewBox="0 0 1 1"><title>x</title><text>a</text>${inner}</svg>`;
  for (const bad of ['<g onload="x()"/>', '<rect onclick = "x()"/>', '<a href="javascript:x()"/>', '<a xlink:href="data:text/html,x"/>', '<image href="https://e.test/a.png"/>', '<image href="a.png"/>', '<rect fill="url(https://e.test/p)"/>', '<rect fill="url(\'a.svg#p\')"/>']) {
    assert.ok(checkSvg(wrap(bad)).length > 0, bad);
  }
  assert.deepEqual(checkSvg(wrap('<use href="#a"/><use xlink:href="#b"/><rect fill="url(#g)" clip-path="url(&quot;#c&quot;)"/><text>onload= and href="x" as words</text>')), []);
});

test('the theme decides the look: the SVG keeps var(--token) and the page gets the theme', () => {
  const css = ':root{--ink:#111;--muted:#666;--line:#ddd;--soft:#f5f5f5;--accent:#0a0a0a;--accent-soft:#ffcc00;--warn:#a50;--warn-soft:#fed;--ok:#173;--ok-soft:#dfe;--bad:#c22;--bad-soft:#fdd;--font-sans:sans-serif;--font-mono:monospace}';
  const html = pageOf('<html><head><title>t</title></head><body></body></html>', { preamble: '@import url("https://x.test/f.css");', root: css.slice(0) });
  assert.ok(html.indexOf('@import') < html.indexOf(':root'), 'the @import stays first in the style');
  assert.match(html, /--accent-soft:#ffcc00/);
  assert.deepEqual(checkSvg('<svg viewBox="0 0 1 1"><title>x</title><text>a</text></svg>'), []);
  assert.equal(checkSvg('<svg><script>1</script><foreignObject/></svg>').length, 5);
});

test('draw.mjs without Chrome or without input says what to do', () => {
  const none = spawnSync('node', [path.join(SCRIPTS, 'draw.mjs')], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  const noChrome = spawnSync('node', [path.join(SCRIPTS, 'draw.mjs'), tmp()], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: path.join(tmp(), 'nope') } });
  assert.equal(noChrome.status, 2);
  assert.match(noChrome.stderr, /Chrome not found/);
});
