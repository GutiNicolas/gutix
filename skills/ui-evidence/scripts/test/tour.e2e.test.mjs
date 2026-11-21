// End-to-end check of tour.mjs and compose.mjs against fixture.html, which has CTAs at known positions.
// Needs the system Chrome and the deps from design-doc's setup.sh; skips itself without them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { findChrome } from '../../../design-doc/scripts/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..');
const deps = process.env.GUTIX_DEPS || path.join(os.homedir(), '.cache', 'gutix');
const hasDeps = (() => { try { createRequire(path.join(deps, 'package.json'))('playwright-core'); return true; } catch { return false; } })();
const skip = !findChrome() ? 'no Chrome (set CHROME_PATH or install chromium)' : !hasDeps ? 'deps missing (run skills/design-doc/scripts/setup.sh)' : false;

const run = (script, argv) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(SCRIPTS, script), ...argv], { cwd: os.tmpdir() });
  let output = '';
  child.stdout.on('data', (c) => (output += c));
  child.stderr.on('data', (c) => (output += c));
  child.on('close', (code) => resolve({ code, output }));
});

describe('tour.mjs against fixture.html', { skip, timeout: 240000 }, () => {
  let server, results;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-e2e-'));

  before(async () => {
    const html = fs.readFileSync(path.join(HERE, 'fixture.html'));
    server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/app`;
    const result = await run('tour.mjs', ['--base', base, '--screens', 'cta-400,cta-600,none,cta-100-scroll,cta-100-steps', '--devices', 'iphone-se,desktop', '--steps', 'cta-100-steps=3', '--phase', 'e2e', '--out', out]);
    assert.equal(result.code, 0, result.output);
    results = JSON.parse(fs.readFileSync(path.join(out, 'e2e', 'results.json'), 'utf8'));
  });

  after(() => server?.close());

  const find = (screenId, deviceName, step = 1) => results.find((r) => r.screenId === screenId && r.deviceName === deviceName && r.step === step);

  it('measures exact CTA positions and viewport heights', () => {
    const se = find('cta-400', 'iphone-se');
    assert.equal(se.viewportHeight, 568);
    assert.equal(se.buttonTop, 400);
    assert.equal(se.buttonBottom, 440);
    assert.equal(se.isButtonVisible, true);
    assert.equal(find('cta-400', 'desktop').viewportHeight, 720);
  });

  it('flags a CTA below the fold on iPhone SE but not on desktop', () => {
    assert.equal(find('cta-600', 'iphone-se').isButtonVisible, false);
    assert.equal(find('cta-600', 'desktop').isButtonVisible, true);
  });

  it('reports a page without CTA as null and stops after one step', () => {
    const none = results.filter((r) => r.screenId === 'none' && r.deviceName === 'iphone-se');
    assert.equal(none.length, 1);
    assert.equal(none[0].isButtonVisible, null);
  });

  it('detects an inner scroller and its overflow', () => {
    assert.ok(find('cta-100-scroll', 'iphone-se').scrollers.some((s) => s.overflowPx === 150));
  });

  it('clicks through steps and stops when the screen repeats', () => {
    const steps = results.filter((r) => r.screenId === 'cta-100-steps' && r.deviceName === 'iphone-se');
    assert.deepEqual(steps.map((s) => [s.step, s.heading, s.buttonTop]), [[1, 'Step 1', 100], [2, 'Step 2', 600]]);
    assert.equal(steps[1].isButtonVisible, false);
  });

  it('composes a BEFORE | AFTER image from two shots', async () => {
    const pairs = path.join(out, 'pairs.json');
    fs.writeFileSync(pairs, JSON.stringify([['01-cta-400-iphone-se', find('cta-400', 'iphone-se').file, find('cta-600', 'iphone-se').file]]));
    const result = await run('compose.mjs', ['--pairs', pairs, '--out', path.join(out, 'evidence')]);
    assert.equal(result.code, 0, result.output);
    assert.ok(fs.statSync(path.join(out, 'evidence', '01-cta-400-iphone-se.png')).size > 1000);
  });
});
