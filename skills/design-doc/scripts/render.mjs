#!/usr/bin/env node
// Exports a design doc's figures to themed PNGs (to paste into a Google Doc) or prints a page to PDF.
//   node render.mjs <in.svg|in.html> --png [--scale 2] [--theme <css>] [--out <file|dir>] [--no-lint]
//   node render.mjs <in.svg|in.html> --pdf [--theme <css>] [--out <file>]
//   node render.mjs --find-chrome            prints the Chrome binary that would be used
// .svg: one PNG, as wide as the viewBox times the scale, with the theme's colours and fonts applied.
// .html --png: one PNG per <figure class="diagram"> (<doc>-<figure id>.png). .html --pdf: the page as it is.
// Playwright runs on the system Chrome; deps live in $GUTIX_DEPS (default ~/.cache/gutix), installed by setup.sh.
// Exit codes: 0 ok, 1 a figure failed the lint or a render failed, 2 usage or setup error. Node built-ins only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveTheme } from './theme.mjs';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
export const MAC_APP = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const PATH_NAMES = ['google-chrome', 'chromium', 'chromium-browser'];
// Nothing waits forever: a hung Chrome or a slow font stops the run with an error.
export const TIMEOUTS = { launch: 30_000, load: 30_000, fonts: 5_000, shot: 30_000, pdf: 60_000 };
export const LIMITS = { minWidth: 400, minHeight: 120, maxAspect: 4 };

const isExecutable = (file) => {
  try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
};

/**
 * The Chrome binary to drive: $CHROME_PATH, then the macOS app, then google-chrome, chromium or chromium-browser on PATH.
 * A $CHROME_PATH that is set but is not a binary gives null: an explicit choice that is wrong is not silently replaced.
 */
export function findChrome({ env = process.env, macApp = MAC_APP } = {}) {
  if (env.CHROME_PATH) return isExecutable(env.CHROME_PATH) ? env.CHROME_PATH : null;
  if (isExecutable(macApp)) return macApp;
  for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const name of PATH_NAMES) {
      const file = path.join(dir, name);
      if (isExecutable(file)) return file;
    }
  }
  return null;
}

/** Problems with a figure's size: too small to read once pasted, or so wide or tall it will not fit a page. */
export function lintFigure({ width, height }) {
  const issues = [];
  if (!(width > 0 && height > 0)) return ['the figure has no size: give the <svg> a viewBox'];
  if (width < LIMITS.minWidth || height < LIMITS.minHeight) issues.push(`${width}x${height} is below the minimum ${LIMITS.minWidth}x${LIMITS.minHeight}`);
  const aspect = Math.max(width / height, height / width);
  if (aspect > LIMITS.maxAspect) issues.push(`aspect ratio ${aspect.toFixed(1)}:1 is above ${LIMITS.maxAspect}:1`);
  return issues;
}

const viewBoxOf = (svg) => {
  const m = /<svg\b[^>]*\bviewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*["']/i.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 };
};

/** The first <svg>...</svg> of a string, closing tags matched by nesting; null if it never closes. */
function svgOf(text) {
  const start = text.search(/<svg\b/i);
  if (start < 0) return null;
  let depth = 0;
  for (const m of text.slice(start).matchAll(/<(\/?)svg\b[^>]*>/gi)) {
    if (m[1]) depth--;
    else if (!m[0].endsWith('/>')) depth++;
    if (depth === 0) return text.slice(start, start + m.index + m[0].length);
  }
  return null;
}

/** The figures of a design doc: each <figure class="diagram"> with an <svg>, named by its id (or its position). */
export function figuresOf(html) {
  const out = [];
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi)) {
    if (!/\bclass\s*=\s*["'][^"']*\bdiagram\b/.test(m[1])) continue;
    const svg = svgOf(m[2]);
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1];
    if (!svg) { console.error(`render: skipped a diagram figure with no complete <svg>${id ? ` (id "${id}")` : ''}`); continue; }
    out.push({ name: id ?? `fig-${out.length + 1}`, svg });
  }
  return out;
}

const pageOf = (theme, body, svgSize) => `<!doctype html><html><head><meta charset="utf-8"><style>
${theme.preamble ? `${theme.preamble}\n` : ''}${theme.root}
html,body{margin:0;padding:0}
body{background:var(--paper,#fff);color:var(--ink);font-family:var(--font-sans)}
${svgSize ? `body>svg{display:block;width:${svgSize.width}px;height:${svgSize.height}px}` : ''}
</style></head><body>${body}</body></html>`;

/**
 * A page that renders untrusted markup: JavaScript off, and only inline data, fonts and https stylesheets (a theme's
 * @import of a font css) may load. Images, scripts, frames and everything else on the network are refused.
 */
export async function sandboxedPage(browser, options = {}) {
  const context = await browser.newContext({ ...options, javaScriptEnabled: false });
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    const type = request.resourceType();
    const ok = /^(data|about|blob):/i.test(url) || type === 'font' || (type === 'stylesheet' && /^https:/i.test(url));
    return ok ? route.continue() : route.abort();
  });
  return context.newPage();
}

function usage(message) {
  if (message) console.error(`render: ${message}`);
  console.error('usage: node render.mjs <in.svg|in.html> --png [--scale 2] [--theme <css>] [--out <file|dir>] [--no-lint]\n' +
    '       node render.mjs <in.svg|in.html> --pdf [--theme <css>] [--out <file>]\n       node render.mjs --find-chrome');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { scale: 2, lint: true, format: null, input: null, theme: null, out: null, findChrome: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { const v = argv[++i]; if (v === undefined) usage(`missing value for ${arg}`); return v; };
    if (arg === '--png') opts.format = 'png';
    else if (arg === '--pdf') opts.format = 'pdf';
    else if (arg === '--scale') opts.scale = Number(value());
    else if (arg === '--theme') opts.theme = value();
    else if (arg === '--out') opts.out = value();
    else if (arg === '--no-lint') opts.lint = false;
    else if (arg === '--find-chrome') opts.findChrome = true;
    else if (arg === '-h' || arg === '--help') usage();
    else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
    else if (opts.input) usage(`one input at a time, got ${opts.input} and ${arg}`);
    else opts.input = arg;
  }
  if (opts.findChrome) return opts;
  if (!opts.input) usage('no input file');
  if (!opts.format) usage('say --png or --pdf');
  if (!(opts.scale >= 1 && opts.scale <= 4)) usage('--scale is between 1 and 4');
  return opts;
}

function loadPlaywright() {
  const deps = process.env.GUTIX_DEPS || path.join(os.homedir(), '.cache', 'gutix');
  try {
    return createRequire(path.join(deps, 'package.json'))('playwright-core');
  } catch {
    console.error(`render: dependencies missing in ${deps}; run: bash ${path.join(SCRIPTS, 'setup.sh')}`);
    process.exit(2);
  }
}

async function main(argv) {
  const opts = parseArgs(argv);
  const chrome = findChrome();
  if (opts.findChrome) {
    if (!chrome) { console.error('render: Chrome not found; set CHROME_PATH or install google-chrome / chromium'); return 2; }
    console.log(chrome);
    return 0;
  }
  if (!chrome) { console.error('render: Chrome not found; set CHROME_PATH to a Chrome or Chromium binary, or install one'); return 2; }
  if (!fs.existsSync(opts.input)) usage(`${opts.input}: no such file`);

  const input = path.resolve(opts.input);
  const isSvg = /\.svg$/i.test(input);
  if (!isSvg && !/\.html?$/i.test(input)) usage('the input is a .svg or a .html');
  let source, theme;
  try {
    source = fs.readFileSync(input, 'utf8');
    theme = resolveTheme({ theme: opts.theme, startDir: path.dirname(input) });
  } catch (e) { console.error(`render: ${e.message}`); return 2; }
  const base = input.replace(/\.[^.]+$/, '');

  const jobs = [];
  if (opts.format === 'png') {
    const figures = isSvg ? [{ name: null, svg: source.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/i, '').trim() }] : figuresOf(source);
    if (!figures.length) { console.error(`render: ${opts.input} has no <figure class="diagram"> with an <svg>`); return 1; }
    for (const f of figures) {
      const size = viewBoxOf(f.svg);
      let file;
      if (isSvg) file = opts.out ?? `${base}.png`;
      else {
        const dir = path.resolve(opts.out ?? path.dirname(input));
        const safe = f.name.replace(/[^\w.-]+/g, '-').replace(/^\.+/, '') || 'fig';
        file = path.join(dir, `${path.basename(base)}-${safe}.png`);
        if (path.dirname(file) !== dir) { console.error(`render: figure id "${f.name}" does not make a safe file name`); return 1; }
      }
      jobs.push({ ...f, size, file });
    }
    const seen = new Map();
    for (const j of jobs) {
      if (seen.has(j.file)) { console.error(`render: figures "${seen.get(j.file)}" and "${j.name}" would write the same file ${j.file}; give them distinct ids`); return 1; }
      seen.set(j.file, j.name);
    }
    if (opts.lint) {
      const bad = jobs.flatMap((j) => lintFigure(j.size).map((issue) => `${j.name ?? path.basename(input)}: ${issue}`));
      if (bad.length) { console.error(`render: lint failed (--no-lint to export anyway)\n  ${bad.join('\n  ')}`); return 1; }
    }
  }

  const { chromium } = loadPlaywright();
  let browser;
  try { browser = await chromium.launch({ executablePath: chrome, timeout: TIMEOUTS.launch }); } catch (e) { console.error(`render: Chrome did not start: ${e.message.split('\n')[0]}`); return 2; }
  let failed = 0;
  try {
    if (opts.format === 'pdf') {
      const file = opts.out ?? `${base}.pdf`;
      const page = await sandboxedPage(browser);
      // An svg alone is printed on a page of its own; a doc keeps its own print CSS (and its own theme, unless --theme).
      const html = isSvg ? pageOf(theme, source.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, ''), null) : source;
      // The doc is set as content, never opened from disk, so it cannot read files next to it (no relative images).
      await page.setContent(!isSvg && opts.theme ? html.replace(/<\/head>/i, `<style>${theme.preamble ?? ''}\n${theme.root}</style></head>`) : html, { waitUntil: 'load', timeout: TIMEOUTS.load });
      await page.evaluate((ms) => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ms))]), TIMEOUTS.fonts);
      // page.pdf has no timeout option of its own, so it is raced against a timer.
      const pdfMs = Number(process.env.GUTIX_PDF_TIMEOUT_MS) || TIMEOUTS.pdf;
      let timer;
      const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`the PDF did not finish in ${pdfMs / 1000}s`)), pdfMs); });
      try { await Promise.race([page.pdf({ path: file, printBackground: true, preferCSSPageSize: true }), expired]); } finally { clearTimeout(timer); }
      console.log(`wrote ${file}`);
    } else {
      for (const job of jobs) {
        const page = await sandboxedPage(browser, { deviceScaleFactor: opts.scale, viewport: { width: Math.max(1, Math.ceil(job.size.width)), height: Math.max(1, Math.ceil(job.size.height)) } });
        try {
          await page.setContent(pageOf(theme, job.svg, job.size), { waitUntil: 'load', timeout: TIMEOUTS.load });
          await page.evaluate((ms) => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ms))]), TIMEOUTS.fonts);
          fs.mkdirSync(path.dirname(job.file), { recursive: true });
          await page.locator('body > svg').screenshot({ path: job.file, timeout: TIMEOUTS.shot });
          console.log(`wrote ${job.file} (${Math.round(job.size.width * opts.scale)}x${Math.round(job.size.height * opts.scale)})`);
        } catch (e) {
          failed++;
          console.error(`render: ${job.name ?? path.basename(input)}: ${e.message.split('\n')[0]}`);
        } finally { await page.close(); }
      }
    }
  } finally { await browser.close(); }
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`render: ${e.message}`); process.exit(1); });
}
