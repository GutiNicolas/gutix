// The figure renderer: Chrome lookup, the size lint, and (where Chrome and the deps exist) real PNG and PDF output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
