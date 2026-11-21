// The figure renderer: Chrome lookup, the size lint, and (where Chrome and the deps exist) real PNG and PDF output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findChrome, lintFigure, figuresOf } from '../render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RENDER = path.join(here, '..', 'render.mjs');
const FIG = path.join(here, 'fixtures', 'fig.svg');
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-render-')));
const stub = (dir, name) => { fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, name); fs.writeFileSync(f, '#!/bin/sh\n'); fs.chmodSync(f, 0o755); return f; };
const pngWidth = (file) => fs.readFileSync(file).readUInt32BE(16);

const chrome = findChrome();
const depsDir = process.env.GUTIX_DEPS || path.join(os.homedir(), '.cache', 'gutix');
let hasDeps = true;
try { createRequire(path.join(depsDir, 'package.json'))('playwright-core'); } catch { hasDeps = false; }
const skip = !chrome ? 'no Chrome (set CHROME_PATH or install chromium)' : !hasDeps ? 'deps missing (run skills/design-doc/scripts/setup.sh)' : false;

test('Chrome lookup: CHROME_PATH, then the macOS app, then PATH in the documented order', () => {
  const root = tmp();
  const bin = path.join(root, 'bin');
  const names = ['chromium-browser', 'chromium', 'google-chrome'].map((n) => stub(bin, n));
  const none = path.join(root, 'no-such-app');
  const env = (extra) => ({ PATH: bin, ...extra });
  // PATH order google-chrome > chromium > chromium-browser, whatever the order on disk
  assert.equal(findChrome({ env: env(), macApp: none }), path.join(bin, 'google-chrome'));
  fs.rmSync(names[2]);
  assert.equal(findChrome({ env: env(), macApp: none }), path.join(bin, 'chromium'));
  fs.rmSync(names[1]);
  assert.equal(findChrome({ env: env(), macApp: none }), path.join(bin, 'chromium-browser'));
  // the macOS app beats PATH
  const app = stub(root, 'Chrome.app-binary');
  assert.equal(findChrome({ env: env(), macApp: app }), app);
  // CHROME_PATH beats both
  const mine = stub(root, 'my-chrome');
  assert.equal(findChrome({ env: env({ CHROME_PATH: mine }), macApp: app }), mine);
  // a CHROME_PATH that is not a binary is an error, not a silent fallback
  assert.equal(findChrome({ env: env({ CHROME_PATH: path.join(root, 'nope') }), macApp: app }), null);
  // nothing anywhere
  assert.equal(findChrome({ env: { PATH: path.join(root, 'empty') }, macApp: none }), null);
});

test('lint: too small or too stretched is rejected, a normal figure passes', () => {
  assert.deepEqual(lintFigure({ width: 640, height: 240 }), []);
  assert.match(lintFigure({ width: 300, height: 200 })[0], /below the minimum/);
  assert.match(lintFigure({ width: 640, height: 80 })[0], /below the minimum/);
  assert.match(lintFigure({ width: 2000, height: 300 }).join(), /aspect ratio 6\.7:1/);
  assert.match(lintFigure({ width: 500, height: 2400 }).join(), /aspect ratio/);
  assert.match(lintFigure({ width: 0, height: 0 })[0], /viewBox/);
});

test('figuresOf: only figure.diagram with an svg, named by id or position', () => {
  const html = '<figure class="diagram" id="fig-7"><svg viewBox="0 0 1 1"></svg></figure><figure><svg></svg></figure>' +
    '<figure class="diagram"><svg viewBox="0 0 2 2"></svg></figure><figure class="diagram"><p>no svg</p></figure>';
  assert.deepEqual(figuresOf(html).map((f) => f.name), ['fig-7', 'fig-2']);
});

test('the CLI rejects a small figure before it opens a browser', () => {
  const dir = tmp();
  const small = path.join(dir, 'small.svg');
  fs.writeFileSync(small, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100"/></svg>');
  const r = spawnSync('node', [RENDER, small, '--png'], { encoding: 'utf8', env: { ...process.env, HOME: dir } });
  // with Chrome missing the run stops earlier (2); with it, the lint stops it (1). Either way nothing is written.
  assert.notEqual(r.status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'small.png')), false);
  if (chrome) { assert.equal(r.status, 1); assert.match(r.stderr, /below the minimum/); }
});

test('PNG at 2x with the theme applied', { skip }, () => {
  const dir = tmp();
  const theme = (accentSoft) => `:root{--ink:#111;--muted:#666;--line:#ddd;--soft:#f5f5f5;--accent:#0a0a0a;--accent-soft:${accentSoft};--warn:#a50;--warn-soft:#fed;--ok:#173;--ok-soft:#dfe;--bad:#c22;--bad-soft:#fdd;--font-sans:sans-serif;--font-mono:monospace}`;
  const render = (name, css) => {
    const themeFile = path.join(dir, `${name}.css`);
    fs.writeFileSync(themeFile, css);
    const out = path.join(dir, `${name}.png`);
    execFileSync('node', [RENDER, FIG, '--png', '--theme', themeFile, '--out', out], { encoding: 'utf8' });
    return out;
  };
  const a = render('a', theme('#ffcc00'));
  assert.equal(pngWidth(a), 640 * 2);
  assert.equal(fs.readFileSync(a).readUInt32BE(20), 240 * 2);
  const b = render('b', theme('#00ccff'));
  assert.notDeepEqual(fs.readFileSync(a), fs.readFileSync(b), 'a different theme must change the picture');
  // --scale 3 follows the viewBox as well
  execFileSync('node', [RENDER, FIG, '--png', '--scale', '3', '--out', path.join(dir, 'c.png')]);
  assert.equal(pngWidth(path.join(dir, 'c.png')), 640 * 3);
});

test('an html doc gives one PNG per diagram figure; --pdf prints the page', { skip }, () => {
  const dir = tmp();
  const svg = fs.readFileSync(FIG, 'utf8');
  const doc = path.join(dir, 'doc.html');
  fs.writeFileSync(doc, `<!doctype html><html><head><meta charset="utf-8"></head><body><figure class="diagram" id="fig-1">${svg}</figure><figure class="diagram">${svg}</figure></body></html>`);
  execFileSync('node', [RENDER, doc, '--png'], { encoding: 'utf8' });
  assert.equal(pngWidth(path.join(dir, 'doc-fig-1.png')), 1280);
  assert.equal(pngWidth(path.join(dir, 'doc-fig-2.png')), 1280);
  execFileSync('node', [RENDER, doc, '--pdf'], { encoding: 'utf8' });
  assert.equal(fs.readFileSync(path.join(dir, 'doc.pdf')).subarray(0, 4).toString(), '%PDF');
});

test('a broken theme is a setup error (exit 2), not a failed render (exit 1)', () => {
  const dir = tmp();
  const bad = path.join(dir, 'bad.css');
  fs.writeFileSync(bad, ':root{--ink:#111}');
  const fakeChrome = stub(dir, 'fake-chrome'); // reaches the theme step without a real browser
  const r = spawnSync('node', [RENDER, FIG, '--png', '--theme', bad], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: fakeChrome } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /theme|--accent|missing/i);
  const missing = spawnSync('node', [RENDER, FIG, '--png', '--theme', path.join(dir, 'nope.css')], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: fakeChrome } });
  assert.equal(missing.status, 2, missing.stderr);
});

test('figuresOf keeps an svg that holds a nested svg whole', () => {
  const html = '<figure class="diagram" id="n"><svg viewBox="0 0 500 200"><svg x="1" width="10"><rect/></svg><text>after</text></svg></figure>';
  const [fig] = figuresOf(html);
  assert.match(fig.svg, /<text>after<\/text><\/svg>$/);
});

test('a figure id cannot steer a PNG out of the output folder, and two figures cannot share one file', { skip }, () => {
  const root = tmp();
  const dir = path.join(root, 'docs');
  fs.mkdirSync(dir);
  const svg = fs.readFileSync(FIG, 'utf8');
  const docWith = (...ids) => {
    const doc = path.join(dir, 'doc.html');
    fs.writeFileSync(doc, `<!doctype html><html><body>${ids.map((id) => `<figure class="diagram" id="${id}">${svg}</figure>`).join('')}</body></html>`);
    return doc;
  };
  const r = spawnSync('node', [RENDER, docWith('a/../../esc'), '--png'], { encoding: 'utf8' });
  assert.equal(fs.existsSync(path.join(root, 'esc.png')), false, 'wrote outside the output folder');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length, 1);
  assert.equal(fs.readdirSync(root).filter((f) => f !== 'docs').length, 0);

  const clash = spawnSync('node', [RENDER, docWith('a/b', 'a-b'), '--png', '--out', path.join(dir, 'out')], { encoding: 'utf8' });
  assert.equal(clash.status, 1);
  assert.match(clash.stderr, /same file/);
  assert.equal(fs.existsSync(path.join(dir, 'out')), false, 'nothing is written when two figures clash');
});

test('a doc cannot run scripts or reach the network while it is rendered', { skip }, async () => {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.end(''); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const run = promisify(execFile);
  const dir = tmp();
  try {
    const svg = fs.readFileSync(FIG, 'utf8').replace('</svg>', `<script>document.querySelector('svg').style.width='100px'</script><image href="${origin}/svg-image"/></svg>`);
    const doc = path.join(dir, 'doc.html');
    fs.writeFileSync(doc, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${origin}/css"></head><body><img src="${origin}/img"><figure class="diagram" id="f">${svg}</figure></body></html>`);
    await run('node', [RENDER, doc, '--png'], { encoding: 'utf8' });
    await run('node', [RENDER, doc, '--pdf'], { encoding: 'utf8' });
    assert.equal(pngWidth(path.join(dir, 'doc-f.png')), 1280, 'the script ran and resized the figure');
    assert.deepEqual(hits, []);
  } finally { server.close(); }
});

test('setup reinstalls playwright-core when the cached version is not the pinned one, and skips it when it is', () => {
  const root = tmp();
  const deps = path.join(root, 'deps');
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'npm.log');
  fs.mkdirSync(path.join(deps, 'node_modules', 'playwright-core'), { recursive: true });
  fs.writeFileSync(path.join(deps, 'package.json'), '{}');
  const pkg = path.join(deps, 'node_modules', 'playwright-core', 'package.json');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 });
  const env = { ...process.env, GUTIX_DEPS: deps, CHROME_PATH: stub(root, 'chrome'), PATH: `${bin}:${process.env.PATH}` };
  const setup = path.join(here, '..', 'setup.sh');

  fs.writeFileSync(pkg, '{"version":"0.0.1"}');
  assert.equal(spawnSync('bash', [setup], { env, encoding: 'utf8' }).status, 0);
  assert.match(fs.readFileSync(log, 'utf8'), /install .*playwright-core@\d+\.\d+\.\d+\s/);

  fs.rmSync(log);
  fs.writeFileSync(pkg, JSON.stringify({ version: /playwright-core@(\d+\.\d+\.\d+)/.exec(fs.readFileSync(setup, 'utf8'))[1] }));
  assert.equal(spawnSync('bash', [setup], { env, encoding: 'utf8' }).status, 0);
  assert.equal(fs.existsSync(log), false, 'the pinned version is already there: no install');
});

test('figuresOf ignores svg tags inside HTML comments and names a diagram figure it skips', () => {
  const html = '<figure class="diagram" id="c"><!-- <svg old --><svg viewBox="0 0 500 200"><rect/></svg></figure>' +
    '<figure class="diagram" id="empty"><p>none</p></figure>';
  const warned = [];
  const real = console.error;
  console.error = (m) => warned.push(String(m));
  try {
    const figs = figuresOf(html);
    assert.deepEqual(figs.map((f) => f.name), ['c']);
    assert.match(figs[0].svg, /^<svg viewBox="0 0 500 200"><rect\/><\/svg>$/);
  } finally { console.error = real; }
  assert.match(warned.join(), /empty/);
});

test('--find-chrome exits 2 when there is no Chrome, like every other setup error', () => {
  const dir = tmp();
  const r = spawnSync(process.execPath, [RENDER, '--find-chrome'], { encoding: 'utf8', env: { PATH: dir, HOME: dir, CHROME_PATH: path.join(dir, 'nope') } });
  assert.equal(r.status, 2, r.stderr);
});

test('a PDF that does not finish in time stops with an error', { skip }, () => {
  const dir = tmp();
  const doc = path.join(dir, 'doc.html');
  fs.writeFileSync(doc, '<!doctype html><html><body><p>x</p></body></html>');
  const r = spawnSync('node', [RENDER, doc, '--pdf'], { encoding: 'utf8', env: { ...process.env, GUTIX_PDF_TIMEOUT_MS: '1' } });
  assert.notEqual(r.status, 0, 'the PDF timeout was ignored');
  assert.match(r.stderr, /PDF .*did not finish/);
});
