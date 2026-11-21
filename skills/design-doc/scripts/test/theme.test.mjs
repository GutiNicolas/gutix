// The theme of a design doc: which file wins, what a broken theme says, and that figure colours stay inside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTheme, applyTheme, parseTheme, REQUIRED } from '../theme.mjs';
import { checkDoc } from '../check-doc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, '..', '..', 'references', 'template.html');
const EXTRACT = path.join(here, '..', 'extract-llm.mjs');
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-theme-')));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

/** A theme CSS whose every required token is `accent`-flavoured with the given accent colour. */
const css = (accent, { omit = [], extra = '' } = {}) => {
  const values = { ink: '#111111', muted: '#666666', line: '#dddddd', soft: '#f5f5f5', accent, 'accent-soft': '#eeeeee', warn: '#aa5500', 'warn-soft': '#ffeedd',
    ok: '#117733', 'ok-soft': '#ddffee', bad: '#cc2222', 'bad-soft': '#ffdddd', 'font-sans': '"Test Sans", sans-serif', 'font-mono': 'monospace' };
  return `${extra}\n:root {\n${REQUIRED.filter((t) => !omit.includes(t)).map((t) => `  --${t}: ${values[t]};`).join('\n')}\n}\n`;
};

/** A repo (with a fake origin), a temp HOME with one org whose theme has accent #0a0a0a, and a doc folder inside the repo. */
function world({ origin = 'git@example.com:acme/service.git' } = {}) {
  const home = tmp();
  const org = path.join(home, '.config/gutix/orgs/acme');
  write(path.join(org, 'gutix-org.json'), JSON.stringify({ name: 'acme', match: ['example.com/acme/'], theme: 'theme.css' }));
  write(path.join(org, 'theme.css'), css('#0a0a0a'));
  write(path.join(home, '.config/gutix/orgs.json'), JSON.stringify({ orgs: [{ name: 'acme', path: org }] }));
  const repo = tmp();
  execFileSync('git', ['init', '-q', repo]);
  if (origin) execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', origin]);
  const docs = path.join(repo, 'docs/design');
  fs.mkdirSync(docs, { recursive: true });
  return { home, repo, docs, org };
}
function resolveIn(w, opts = {}) {
  const saved = process.env.HOME;
  process.env.HOME = w.home;
  try { return resolveTheme({ startDir: w.docs, warn: () => {}, ...opts }); } finally { process.env.HOME = saved; }
}

test('the order is --theme, then the repo file, then the org profile, then the default', () => {
  const w = world();
  assert.deepEqual([resolveIn(w).source, resolveIn(w).tokens.accent], ['org', '#0a0a0a']);

  write(path.join(w.repo, '.design-doc-theme.css'), css('#111aaa'));
  assert.deepEqual([resolveIn(w).source, resolveIn(w).tokens.accent], ['repo', '#111aaa']);

  const flag = path.join(tmp(), 'flag.css');
  write(flag, css('#222bbb'));
  assert.deepEqual([resolveIn(w, { theme: flag }).source, resolveIn(w, { theme: flag }).tokens.accent], ['flag', '#222bbb']);

  fs.rmSync(path.join(w.repo, '.design-doc-theme.css'));
  fs.rmSync(path.join(w.home, '.config/gutix/orgs.json'));
  const fallback = resolveIn(w);
  assert.equal(fallback.source, 'default');
  assert.equal(fallback.tokens.accent, '#1f5fbf');
});

test('a repo theme is found from a nested folder, and an origin the org does not match falls to the default', () => {
  const w = world({ origin: 'git@example.com:other/service.git' });
  assert.equal(resolveIn(w).source, 'default');
  write(path.join(w.repo, '.design-doc-theme.css'), css('#333ccc'));
  fs.mkdirSync(path.join(w.docs, 'deep/er'), { recursive: true });
  assert.equal(resolveIn(w, { startDir: path.join(w.docs, 'deep/er') }).source, 'repo');
});

test('optional deck tokens fall back, and the default is what the template renders today', () => {
  const t = resolveIn(world({ origin: null }));
  assert.equal(t.source, 'default');
  assert.deepEqual([t.tokens.paper, t.tokens.off, t.tokens['accent-fill']], ['#fff', 'var(--soft)', 'var(--accent)']);
  const html = fs.readFileSync(TEMPLATE, 'utf8');
  assert.equal(applyTheme(html, t), html);
});

test('a theme missing a required token is reported by name', () => {
  const w = world();
  write(path.join(w.repo, '.design-doc-theme.css'), css('#111aaa', { omit: ['warn-soft', 'font-mono'] }));
  assert.throws(() => resolveIn(w), (e) => /missing --warn-soft, --font-mono/.test(e.message) && e.message.includes('.design-doc-theme.css'));
});

test('a theme with fonts keeps its @import and @font-face, and font stacks with semicolons survive', () => {
  const extra = '@import url("https://fonts.example/a.css");\n@font-face { font-family: "Test Sans"; src: url(data:font/woff2;base64,AAAA); }';
  const parsed = parseTheme(css('#111aaa', { extra }));
  assert.match(parsed.preamble, /@import url\("https:\/\/fonts\.example\/a\.css"\);\s*@font-face/);
  assert.equal(parsed.tokens['font-sans'], '"Test Sans", sans-serif');
  const html = applyTheme(fs.readFileSync(TEMPLATE, 'utf8'), { ...parsed });
  assert.match(html, /<style>\s*\/\* gutix-theme \*\/\s*@import[\s\S]*:root \{[\s\S]*\/\* \/gutix-theme \*\/\s*\* \{ box-sizing/);
  assert.equal(applyTheme(html, parsed), html); // applying twice changes nothing
});

const figureDoc = (shapes, { theme } = {}) => {
  const dir = tmp();
  const file = path.join(dir, 'doc.html');
  write(file, `<!-- For agents: read doc.llm.md -->\n<!doctype html><html><head><title>Doc</title></head><body><h1>Doc</h1><h2>S</h2><p>t</p>
    <figure class="diagram"><svg><title>Shows it</title>${shapes}</svg><figcaption>Figure 1. Caption.</figcaption></figure></body></html>`);
  execFileSync('node', [EXTRACT, file], { stdio: 'pipe' });
  if (theme) write(path.join(dir, '.design-doc-theme.css'), theme);
  fs.mkdirSync(path.join(dir, '.git'));
  return file;
};
const colourProblems = (file) => checkDoc(file, { vocab: null }).filter((p) => /colour/.test(p));

test('check-doc accepts theme tokens and theme values, and flags a colour the theme does not have', () => {
  const ok = figureDoc('<rect fill="var(--accent)" stroke="var(--ink)"/><path style="fill: var(--soft); stroke:none"/><circle fill="#1F5FBF"/><rect fill="#FFF" stroke="currentColor"/>');
  assert.deepEqual(colourProblems(ok), []);

  const bad = figureDoc('<rect fill="#ff00aa"/><rect style="stroke: tomato"/><rect fill="var(--nope)"/><style>.a{fill:#123456}</style>');
  const out = colourProblems(bad).join('\n');
  for (const e of [/colour #ff00aa is not in the theme/, /colour tomato/, /var\(--nope\) \(the theme has no --nope\)/, /colour #123456/]) assert.match(out, e);
});

test('check-doc judges colours against the theme that applies to the doc', () => {
  const themed = figureDoc('<rect fill="#0a0a0a"/><rect fill="#1f5fbf"/>', { theme: css('#0a0a0a') });
  assert.match(colourProblems(themed).join('\n'), /colour #1f5fbf/);
  assert.doesNotMatch(colourProblems(themed).join('\n'), /#0a0a0a/);
});

test('theme CLI: --theme without a value, or followed by another flag, is a usage error', () => {
  const dir = tmp();
  const doc = path.join(dir, 'doc.html');
  fs.writeFileSync(doc, fs.readFileSync(TEMPLATE, 'utf8'));
  const THEME_CLI = path.join(here, '..', 'theme.mjs');
  for (const args of [['--theme', '--apply', doc], ['--apply', doc, '--theme']]) {
    const r = spawnSync('node', [THEME_CLI, ...args], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /--theme needs a file/);
  }
});
