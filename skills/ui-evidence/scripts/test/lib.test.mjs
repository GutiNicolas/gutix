import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib.mjs';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('parseArgs and missingArgs', () => {
  it('reads values and bare flags, keeps an empty string, ignores positionals', () => {
    assert.deepEqual(lib.parseArgs(['x', '--base', 'http://a', '--query', '', '--phase', 'after']), { base: 'http://a', query: '', phase: 'after' });
    assert.deepEqual(lib.parseArgs(['--screens', '--base', 'u']), { screens: true, base: 'u' });
  });

  it('reports absent, bare and blank required flags', () => {
    assert.deepEqual(lib.missingArgs({ base: 'u' }, ['base', 'screens']), ['screens']);
    assert.deepEqual(lib.missingArgs({ base: true, screens: '  ' }, ['base', 'screens']), ['base', 'screens']);
  });
});

describe('parseSteps', () => {
  it('parses id=count pairs and returns {} when absent', () => {
    assert.deepEqual(lib.parseSteps('signup=12, cart=2'), { signup: 12, cart: 2 });
    assert.deepEqual(lib.parseSteps(undefined), {});
  });

  for (const bad of ['cart=abc', 'cart=0', 'cart=-1', 'cart=1.5', 'cart', '=2', 'a=1=2']) {
    it(`rejects "${bad}"`, () => assert.throws(() => lib.parseSteps(bad), /--steps/));
  }
  it('rejects a bare --steps', () => assert.throws(() => lib.parseSteps(true), /needs a value/));
});

describe('buildCtaRegex', () => {
  it('matches the whole label, case-insensitive, by default', () => {
    const cta = lib.buildCtaRegex(undefined);
    for (const label of ['Continue', 'NEXT', 'Get started']) assert.ok(cta.test(label), label);
    assert.equal(cta.test('Continue later'), false);
  });

  it('uses a custom pattern and rejects an invalid one', () => {
    assert.ok(lib.buildCtaRegex('^siguiente$').test('Siguiente'));
    assert.throws(() => lib.buildCtaRegex('(unclosed'), /--cta: invalid regex/);
  });
});

describe('parseLabels and verdict', () => {
  it('defaults to English and replaces only the keys given', () => {
    assert.deepEqual(lib.parseLabels(undefined), lib.DEFAULT_LABELS);
    const labels = lib.parseLabels('hidden=OCULTO,before=ANTES');
    assert.equal(labels.hidden, 'OCULTO');
    assert.equal(labels.before, 'ANTES');
    assert.equal(labels.after, 'AFTER');
  });

  it('rejects an unknown key, an empty text and a bare flag', () => {
    for (const bad of ['nope=x', 'hidden=', 'hidden']) assert.throws(() => lib.parseLabels(bad), /--labels/);
    assert.throws(() => lib.parseLabels(true), /needs a value/);
  });

  it('says visible, hidden or no CTA, with the configured words', () => {
    assert.equal(lib.verdict(true), 'visible');
    assert.equal(lib.verdict(false), 'HIDDEN');
    assert.equal(lib.verdict(null), 'no CTA');
    assert.equal(lib.verdict(false, lib.parseLabels('hidden=OCULTO')), 'OCULTO');
  });
});

describe('screenUrl', () => {
  it('joins base, encoded id and query; an empty id is the base itself', () => {
    assert.equal(lib.screenUrl('http://h/app/', 'cart'), 'http://h/app/cart');
    assert.equal(lib.screenUrl('http://h/app', 'a b', 'lang=en'), 'http://h/app/a%20b?lang=en');
    assert.equal(lib.screenUrl('http://h/app/', '', 'x=1'), 'http://h/app?x=1');
  });
});

describe('ctaPosition', () => {
  it('is visible when the CTA fits the viewport, including bottom == height', () => {
    assert.deepEqual(lib.ctaPosition({ top: 522.4, bottom: 564.4 }, 568), { buttonTop: 522, buttonBottom: 564, isButtonVisible: true });
    assert.equal(lib.ctaPosition({ top: 526, bottom: 568 }, 568).isButtonVisible, true);
  });

  it('is hidden when it ends below the viewport or starts above it', () => {
    assert.equal(lib.ctaPosition({ top: 562, bottom: 604 }, 568).isButtonVisible, false);
    assert.equal(lib.ctaPosition({ top: -10, bottom: 30 }, 568).isButtonVisible, false);
  });

  it('reports a missing CTA as null', () => {
    assert.deepEqual(lib.ctaPosition(null, 568), { buttonTop: null, buttonBottom: null, isButtonVisible: null });
  });
});

describe('mock fixtures', () => {
  const fixtures = lib.validateFixtures({
    routes: [
      { match: '/api/orders$', method: 'POST', status: 201, body: { created: true } },
      { match: '/api/orders/(\\d+)$', body: { id: 1 } },
      { match: '/api/orders/\\d+$', body: { shadowed: true } }
    ]
  });

  it('first matching route wins; the status defaults to 200', () => {
    assert.deepEqual(lib.mockRoute(fixtures, 'http://x/api/orders/7'), { status: 200, body: { id: 1 } });
  });

  it('respects the method, and lets anything else through', () => {
    assert.deepEqual(lib.mockRoute(fixtures, 'http://x/api/orders', 'post'), { status: 201, body: { created: true } });
    assert.equal(lib.mockRoute(fixtures, 'http://x/api/orders', 'GET'), null);
    assert.equal(lib.mockRoute(fixtures, 'http://x/other'), null);
  });

  it('rejects malformed fixtures', () => {
    assert.throws(() => lib.validateFixtures({}), /routes/);
    assert.throws(() => lib.validateFixtures({ routes: [{ match: '(' , body: 1 }] }), /invalid regex/);
    assert.throws(() => lib.validateFixtures({ routes: [{ match: 'a' }] }), /body/);
  });

  it('accepts the shipped example', () => {
    const example = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'fixtures.example.json'), 'utf8'));
    lib.validateFixtures(example);
    assert.ok(lib.mockRoute(example, 'http://x/api/orders/demo-1'));
  });
});

describe('parsePairs and composeWidth', () => {
  const ok = JSON.stringify([['01-a-iphone-se', '/b.png', '/a.png'], ['02-a-desktop', '/b2.png', '/a2.png']]);
  it('accepts valid pairs', () => assert.equal(lib.parsePairs(ok).length, 2));

  for (const [label, text, message] of [
    ['invalid JSON', '[', /invalid JSON/],
    ['an object', '{}', /non-empty array/],
    ['an empty array', '[]', /non-empty array/],
    ['a pair with 2 items', '[["a","/b.png"]]', /expected \["name"/],
    ['an empty path', '[["a","","/c.png"]]', /expected \["name"/],
    ['an unsafe name', '[["../x","/b.png","/a.png"]]', /file-safe/],
    ['a duplicate name', '[["a","/b","/c"],["a","/d","/e"]]', /duplicate/]
  ]) {
    it(`rejects ${label}`, () => assert.throws(() => lib.parsePairs(text), message));
  }

  it('renders desktop at 640 px and everything else at 320 px', () => {
    assert.equal(lib.composeWidth('09-cart-desktop'), 640);
    assert.equal(lib.composeWidth('01-cart-iphone-se'), 320);
  });
});

describe('CLI input errors exit before launching a browser', () => {
  const run = (script, argv, env = {}) => spawnSync(process.execPath, [path.join(SCRIPTS, script), ...argv], { encoding: 'utf8', cwd: os.tmpdir(), env: { PATH: process.env.PATH, HOME: os.tmpdir(), ...env } });
  const cases = [
    ['tour.mjs', ['--base', 'http://h'], /Required: --screens/],
    ['tour.mjs', ['--screens', 'a'], /Required: --base/],
    ['tour.mjs', ['--base', 'http://h', '--screens', ' , '], /--screens is empty/],
    ['tour.mjs', ['--base', 'http://h', '--screens', 'a', '--steps', 'a=abc'], /--steps/],
    ['tour.mjs', ['--base', 'http://h', '--screens', 'a', '--cta', '('], /invalid regex/],
    ['tour.mjs', ['--base', 'http://h', '--screens', 'a', '--labels', 'x=y'], /--labels/],
    ['tour.mjs', ['--base', 'http://h', '--screens', 'a', '--devices', 'nokia'], /Unknown device "nokia"/],
    ['tour.mjs', ['--base', 'http://h', '--screens', 'a', '--phase', '../x'], /file-safe/],
    ['tour.mjs', ['--base', 'http://h', '--screens', 'a', '--init-script', '/nope.js'], /--init-script/],
    ['iframe-shots.mjs', ['--label', 'x'], /Required: --url/],
    ['iframe-shots.mjs', ['--url', 'not a url', '--label', 'x'], /not a valid URL/],
    ['iframe-shots.mjs', ['--url', 'http://h/c/x', '--label', '../x'], /file-safe/],
    ['iframe-shots.mjs', ['--url', 'http://h/c/x', '--label', 'x', '--host-html', '/nope.html'], /--host-html/],
    ['compose.mjs', [], /Required: --pairs/],
    ['compose.mjs', ['--pairs', '/nope.json'], /does not exist/]
  ];
  for (const [script, argv, message] of cases) {
    it(`${script} ${argv.join(' ') || '(no args)'}`, () => {
      const result = run(script, argv);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, message);
    });
  }

  it('compose.mjs rejects invalid pairs JSON and missing images', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairs-'));
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '[');
    assert.match(run('compose.mjs', ['--pairs', bad]).stderr, /invalid JSON/);
    const missing = path.join(dir, 'missing.json');
    fs.writeFileSync(missing, JSON.stringify([['01-x', path.join(dir, 'b.png'), path.join(dir, 'a.png')]]));
    assert.match(run('compose.mjs', ['--pairs', missing]).stderr, /01-x: missing/);
  });

  it('valid arguments with the dependencies missing stop with the setup hint (exit 2)', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-'));
    const result = run('tour.mjs', ['--base', 'http://h', '--screens', 'a'], { GUTIX_DEPS: empty });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /dependencies missing.*setup\.sh/);
  });
});

describe('mock-preload.mjs', () => {
  const preload = (env, code = '') => spawnSync(process.execPath, ['--import', path.join(SCRIPTS, 'mock-preload.mjs'), '-e', code], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

  it('refuses to start without fixtures or with unusable ones', () => {
    assert.match(preload({}).stderr, /set MOCK_FIXTURES/);
    assert.match(preload({ MOCK_FIXTURES: '/nope.json' }).stderr, /cannot use/);
  });

  it('answers matching requests and passes everything else through', () => {
    const code = `(async () => {
      const r = await fetch('http://127.0.0.1:9/api/orders/demo-1');
      const body = await r.json();
      const created = await fetch('http://127.0.0.1:9/api/orders', { method: 'POST' });
      let passedThrough = false;
      try { await fetch('http://127.0.0.1:9/api/other'); } catch { passedThrough = true; }
      console.log(JSON.stringify({ status: r.status, id: body.id, created: created.status, passedThrough }));
    })();`;
    const result = preload({ MOCK_FIXTURES: path.join(SCRIPTS, 'fixtures.example.json') }, code);
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').pop()), { status: 200, id: 'demo-1', created: 201, passedThrough: true });
  });
});

describe('screens that fail do not lose the run (#4)', () => {
  it('collectRows pushes an error row for a unit that throws and goes on with the next', async () => {
    const rows = [];
    await lib.collectRows(['a', 'b', 'c'], (unit) => ({ screenId: unit }), async (unit) => {
      if (unit === 'b') throw new Error('Execution context was destroyed');
      rows.push({ screenId: unit, ok: true });
    }, rows);
    assert.deepEqual(rows.map((r) => [r.screenId, r.ok ?? false, Boolean(r.error)]), [['a', true, false], ['b', false, true], ['c', true, false]]);
    assert.match(rows[1].error, /Execution context/);
  });
  it('exitCodeFor is 1 when any row has an error, 0 otherwise', () => {
    assert.equal(lib.exitCodeFor([{ ok: 1 }, { error: 'x' }]), 1);
    assert.equal(lib.exitCodeFor([{ ok: 1 }]), 0);
  });
});

describe('--steps for the base screen and nested ids (#6)', () => {
  it('stepsFor finds "-" for the base screen', () => {
    assert.equal(lib.stepsFor(lib.parseSteps('-=2'), ''), 2);
    assert.equal(lib.stepsFor(lib.parseSteps('a=3'), 'a'), 3);
    assert.equal(lib.stepsFor({}, 'a'), undefined);
  });
  it('screenUrl keeps "/" in a nested id', () => {
    assert.equal(lib.screenUrl('http://h/app', 'a/b c'), 'http://h/app/a/b%20c');
  });
  it('fileId makes a nested id file-safe', () => {
    assert.equal(lib.fileId('a/b'), 'a_b');
    assert.equal(lib.fileId(''), 'base');
  });
});

describe('mockBody (#7)', () => {
  it('sends no body for null-body statuses so new Response does not throw', () => {
    for (const status of [204, 205, 304]) assert.doesNotThrow(() => new Response(lib.mockBody({ status, body: {} }), { status }));
    assert.equal(lib.mockBody({ status: 200, body: { a: 1 } }), '{"a":1}');
  });
});
