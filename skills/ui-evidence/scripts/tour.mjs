#!/usr/bin/env node
// Walks each screen x device, measures the primary CTA and inner scrollers, saves screenshots + results.json.
//   node tour.mjs --phase before --base http://127.0.0.1:8080/app --screens home,signup,checkout \
//     [--devices iphone-se,desktop] [--steps signup=3,checkout=2] [--out <dir>] [--cta "^(continue|next)$"] \
//     [--query lang=en] [--init-script <file.js>] [--camera] [--labels hidden=HIDDEN,none=no CTA]
// Screens are <base>/<id>?<query>. An id of "-" means the base itself. --steps makes the tour click the CTA and
// measure the next screens as well (without it only the first one is measured).
// An id of "-" is the base itself (also in --steps, e.g. -=2); an id may hold "/" for nested routes.
// --camera grants the camera permission and a fake feed (for screens that ask for it).
// --init-script runs in every page before its own scripts (stub an SDK that never finishes in headless Chrome).
// Playwright and Chrome: see lib.mjs. Output: <out>/<phase>/results.json and one PNG per screen x device x step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DESKTOP_VIEWPORT, DEVICE_NAMES, buildCtaRegex, collectRows, ctaPosition, exitCodeFor, fail, fileId, loadBrowser, missingArgs, parseArgs, parseLabels, parseList, parseSteps, screenUrl, stepsFor, verdict } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const missing = missingArgs(args, ['base', 'screens']);
if (missing.length) fail(`Required: ${missing.map((m) => `--${m}`).join(' ')}. See the header of tour.mjs.`);

let CTA, maxStepsByScreen, LABELS;
try { CTA = buildCtaRegex(args.cta); maxStepsByScreen = parseSteps(args.steps); LABELS = parseLabels(args.labels); } catch (error) { fail(error.message); }

const screenIds = parseList(args.screens).map((id) => (id === '-' ? '' : id));
if (screenIds.length === 0) fail('--screens is empty.');
const deviceNames = typeof args.devices === 'string' ? parseList(args.devices) : Object.keys(DEVICE_NAMES);
if (deviceNames.length === 0) fail('--devices is empty.');
for (const name of deviceNames) if (!(name in DEVICE_NAMES)) fail(`Unknown device "${name}". Use: ${Object.keys(DEVICE_NAMES).join(', ')}`);
let initScript;
if (args['init-script'] !== undefined) {
  if (typeof args['init-script'] !== 'string' || !fs.existsSync(args['init-script'])) fail(`--init-script: ${args['init-script']} does not exist`);
  initScript = fs.readFileSync(args['init-script'], 'utf8');
}

const PHASE = typeof args.phase === 'string' ? args.phase : 'before';
if (!/^[A-Za-z0-9._-]+$/.test(PHASE)) fail(`--phase "${PHASE}" must be file-safe`);
const OUT = path.join(typeof args.out === 'string' ? args.out : path.join(os.tmpdir(), 'ui-evidence', 'shots'), PHASE);
const QUERY = typeof args.query === 'string' ? args.query : '';
const DEFAULT_MAX_STEPS = 1;

async function measure(page) {
  const raw = await page.evaluate((ctaSource) => {
    const cta = new RegExp(ctaSource, 'i');
    const buttons = [...document.querySelectorAll('button')].filter((b) => cta.test(b.textContent.trim()) && b.offsetParent !== null);
    const button = buttons[buttons.length - 1];
    const rect = button?.getBoundingClientRect();
    const scrollers = [...document.querySelectorAll('*')]
      .filter((el) => el.scrollHeight > el.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY))
      .map((el) => ({ tag: el.tagName.toLowerCase(), className: String(el.className).slice(0, 60), overflowPx: el.scrollHeight - el.clientHeight }));
    return {
      heading: document.querySelector('h1, h2')?.textContent?.trim().slice(0, 60),
      viewportHeight: innerHeight,
      pageOverflowPx: document.documentElement.scrollHeight - innerHeight,
      buttonText: button?.textContent?.trim(),
      rect: rect ? { top: rect.top, bottom: rect.bottom } : null,
      scrollers
    };
  }, CTA.source);
  const { rect, ...rest } = raw;
  return { ...rest, ...ctaPosition(rect, raw.viewportHeight) };
}

const { chromium, devices, launch } = loadBrowser();
fs.mkdirSync(OUT, { recursive: true });
const camera = args.camera === true;
const browser = await chromium.launch({ ...launch, ...(camera ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } : {}) });
const results = [];
const units = screenIds.flatMap((screenId) => deviceNames.map((deviceName) => ({ screenId, deviceName })));

async function tourOne({ screenId, deviceName }) {
  const name = DEVICE_NAMES[deviceName];
  const context = await browser.newContext({ ...(name ? devices[name] : { viewport: DESKTOP_VIEWPORT }), ...(camera ? { permissions: ['camera'] } : {}) });
  try {
    if (initScript) await context.addInitScript(initScript);
    const page = await context.newPage();
    try {
      await page.goto(screenUrl(args.base, screenId, QUERY), { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1500);
    } catch (error) {
      results.push({ screenId: fileId(screenId), deviceName, error: String(error).slice(0, 200) });
      return;
    }
    const seen = new Set();
    const maxSteps = stepsFor(maxStepsByScreen, screenId) || DEFAULT_MAX_STEPS;
    for (let step = 1; step <= maxSteps; step++) {
      await page.getByRole('button', { name: CTA }).last().waitFor({ state: 'visible', timeout: step === 1 ? 20000 : 6000 }).catch(() => {});
      await page.waitForTimeout(700);
      const data = await measure(page);
      const key = `${data.heading}|${data.buttonText}`;
      if (seen.has(key)) break;
      seen.add(key);
      const file = path.join(OUT, `${fileId(screenId)}-${deviceName}-step${step}.png`);
      await page.screenshot({ path: file });
      results.push({ screenId: fileId(screenId), deviceName, step, file, ...data });
      const button = page.getByRole('button', { name: CTA }).last();
      const isEnabled = await button.isEnabled().catch(() => false);
      if (!data.buttonText || !isEnabled) break;
      await button.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
  } finally { await context.close(); }
}

try {
  await collectRows(units, ({ screenId, deviceName }) => ({ screenId: fileId(screenId), deviceName }), tourOne, results);
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
}

for (const r of results) {
  if (r.error) { console.log(`${r.screenId} ${r.deviceName} ERROR ${r.error}`); continue; }
  const scroll = r.scrollers.map((s) => `${s.tag}+${s.overflowPx}`).join(' ');
  console.log(`${r.screenId.padEnd(23)} ${r.deviceName.padEnd(9)} p${r.step} ${verdict(r.isButtonVisible, LABELS).padEnd(7)} btn=${r.buttonTop}-${r.buttonBottom}/${r.viewportHeight} pageOverflow=${r.pageOverflowPx} ${scroll} | ${r.heading}`);
}
console.log(`\nresults: ${path.join(OUT, 'results.json')}`);
if (exitCodeFor(results)) console.error('some screens failed (rows marked ERROR); exiting 1');
process.exitCode = exitCodeFor(results);
