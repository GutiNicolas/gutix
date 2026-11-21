// Helpers shared by tour.mjs, iframe-shots.mjs, compose.mjs and mock-preload.mjs.
// Importing this file never launches a browser, so the unit tests run without Chrome.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, loadPlaywright } from '../../design-doc/scripts/render.mjs';

export const DEFAULT_CTA_SOURCE = '^(continue|next|save|submit|confirm|done|ok|allow|get started)$';
export const DEFAULT_LABELS = { visible: 'visible', hidden: 'HIDDEN', none: 'no CTA', before: 'BEFORE', after: 'AFTER' };
export const DEVICE_NAMES = { 'iphone-se': 'iPhone SE', 'iphone-13': 'iPhone 13', 'pixel-5': 'Pixel 5', desktop: null };
export const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next !== undefined && !next.startsWith('--') ? argv[++i] : true;
  }
  return args;
}

// A flag given without a value parses as `true`; treat it as missing.
export function missingArgs(args, required) {
  return required.filter((name) => typeof args[name] !== 'string' || args[name].trim() === '');
}

export function parseList(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

// "--steps checkout=12,signup=2" -> { checkout: 12, signup: 2 }
export function parseSteps(value) {
  if (value === undefined) return {};
  if (value === true) throw new Error('--steps needs a value like signup=2');
  const steps = {};
  for (const pair of parseList(value)) {
    const [id, count, ...rest] = pair.split('=');
    const n = Number(count);
    if (!id || rest.length || !Number.isInteger(n) || n < 1) throw new Error(`--steps: "${pair}" must be <screenId>=<positive integer>`);
    steps[id] = n;
  }
  return steps;
}

export function buildCtaRegex(source) {
  const pattern = typeof source === 'string' && source !== '' ? source : DEFAULT_CTA_SOURCE;
  try { return new RegExp(pattern, 'i'); } catch (error) { throw new Error(`--cta: invalid regex "${pattern}" (${error.message})`); }
}

// "--labels hidden=OCULTO,none=sin CTA,before=ANTES,after=DESPUÉS" -> DEFAULT_LABELS with those keys replaced
export function parseLabels(value) {
  if (value === undefined) return { ...DEFAULT_LABELS };
  if (value === true) throw new Error('--labels needs a value like before=BEFORE,after=AFTER');
  const labels = { ...DEFAULT_LABELS };
  for (const pair of parseList(value)) {
    const at = pair.indexOf('=');
    const key = at < 0 ? '' : pair.slice(0, at);
    if (!Object.hasOwn(DEFAULT_LABELS, key) || at === pair.length - 1) {
      throw new Error(`--labels: "${pair}" must be <${Object.keys(DEFAULT_LABELS).join('|')}>=<text>`);
    }
    labels[key] = pair.slice(at + 1);
  }
  return labels;
}

// The page for one screen: <base>/<id>?<query>. An empty id means the base itself.
export function screenUrl(base, screenId, query = '') {
  const root = String(base).replace(/\/+$/, '');
  const url = screenId === '' ? root : `${root}/${encodeURIComponent(screenId)}`;
  return query ? `${url}?${query}` : url;
}

// rect: { top, bottom } in CSS px, or null when the CTA is not on the page.
export function ctaPosition(rect, viewportHeight) {
  if (!rect) return { buttonTop: null, buttonBottom: null, isButtonVisible: null };
  const buttonTop = Math.round(rect.top);
  const buttonBottom = Math.round(rect.bottom);
  return { buttonTop, buttonBottom, isButtonVisible: buttonTop >= 0 && buttonBottom <= viewportHeight };
}

export function verdict(isButtonVisible, labels = DEFAULT_LABELS) {
  if (isButtonVisible === null || isButtonVisible === undefined) return labels.none;
  return isButtonVisible ? labels.visible : labels.hidden;
}

// Fixtures file: { "routes": [ { "match": "<regex on the URL>", "method"?: "GET", "status"?: 200, "body": <json> } ] }.
// The first route that matches wins; nothing matching means the real request goes through.
export function validateFixtures(fixtures) {
  if (!fixtures || !Array.isArray(fixtures.routes)) throw new Error('fixtures: expected { "routes": [...] }');
  fixtures.routes.forEach((route, i) => {
    if (!route || typeof route.match !== 'string' || route.match === '' || !('body' in route)) {
      throw new Error(`fixtures.routes[${i}]: needs "match" (a regex string) and "body"`);
    }
    try { new RegExp(route.match); } catch (error) { throw new Error(`fixtures.routes[${i}]: invalid regex (${error.message})`); }
  });
  return fixtures;
}

export function mockRoute(fixtures, url, method = 'GET') {
  const route = fixtures.routes.find((r) => new RegExp(r.match).test(url) && (!r.method || r.method.toUpperCase() === method.toUpperCase()));
  return route ? { status: route.status ?? 200, body: route.body } : null;
}

// pairs.json: [["01-name", "/abs/before.png", "/abs/after.png"], ...]
export function parsePairs(text) {
  let pairs;
  try { pairs = JSON.parse(text); } catch (error) { throw new Error(`--pairs: invalid JSON (${error.message})`); }
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('--pairs: expected a non-empty array');
  const names = new Set();
  pairs.forEach((pair, index) => {
    const isValid = Array.isArray(pair) && pair.length === 3 && pair.every((v) => typeof v === 'string' && v !== '');
    if (!isValid) throw new Error(`--pairs[${index}]: expected ["name", "/before.png", "/after.png"]`);
    if (!/^[A-Za-z0-9._-]+$/.test(pair[0])) throw new Error(`--pairs[${index}]: name "${pair[0]}" must be file-safe`);
    if (names.has(pair[0])) throw new Error(`--pairs[${index}]: duplicate name "${pair[0]}"`);
    names.add(pair[0]);
  });
  return pairs;
}

export function composeWidth(name) {
  return name.includes('desktop') ? 640 : 320;
}

// Playwright and Chrome come from design-doc's deps ($GUTIX_DEPS, default ~/.cache/gutix) and the system Chrome.
// Exits 2 with a message when either is missing, like render.mjs.
export function launchOptions() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome not found; set CHROME_PATH to a Chrome or Chromium binary, or install one');
    process.exit(2);
  }
  return { executablePath: chrome };
}

export function loadBrowser() {
  const playwright = loadPlaywright();
  return { chromium: playwright.chromium, devices: playwright.devices, launch: launchOptions() };
}

export function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
