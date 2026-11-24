#!/usr/bin/env node
// Draws a design doc's diagrams: each <figs-dir>/Dxx.html (a source made from references/diagrams/<type>.html)
// is opened in Chrome with svg-kit.js and the doc's theme, and its drawing is written next to it as Dxx.svg.
//   node draw.mjs <slug>-figs/ [--theme <css>]       every Dxx.html in the folder
//   node draw.mjs <slug>-figs/D01.html [--theme <css>]   one figure
// The SVG has a viewBox, a <title> (the source's <title>), real <text>, no script and no foreignObject, and its
// colours and fonts are still var(--token), so the doc's theme (and render.mjs) decide how it looks.
// The theme resolves like theme.mjs does. Only the source's own inline script runs: every request except inline
// data, fonts and https stylesheets (the theme's @import of a font css) is refused, like render.mjs does for untrusted input.
// Exit codes: 0 ok, 1 a figure failed to draw, 2 usage or setup error. Playwright deps: see setup.sh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, loadPlaywright, sandboxedPage, TIMEOUTS } from './render.mjs';
import { resolveTheme } from './theme.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'svg-kit.js');
const SOURCE = /^D\d+\.html?$/i;

function usage(message) {
  if (message) console.error(`draw: ${message}`);
  console.error('usage: node draw.mjs <figs-dir | Dxx.html> [--theme <css>]');
  process.exit(2);
}

/** What is wrong with a finished drawing, as sentences; empty when it can be inlined. */
export function checkSvg(svg) {
  const problems = [];
  if (!/<svg\b[^>]*\bviewBox\s*=/i.test(svg)) problems.push('the <svg> has no viewBox');
  if (!/<title>\s*\S[\s\S]*?<\/title>/i.test(svg)) problems.push('the <svg> has no <title>');
  if (!/<text\b/i.test(svg)) problems.push('the drawing has no <text>');
  if (/<script\b/i.test(svg)) problems.push('the drawing contains a <script>');
  if (/<foreignObject\b/i.test(svg)) problems.push('the drawing contains a <foreignObject>');
  return problems;
}

/** The source with the theme's CSS in its <head>, so var(--accent) and the fonts resolve while it draws. */
export function pageOf(source, theme) {
  const style = `<style>\n${theme.preamble ? `${theme.preamble}\n` : ''}${theme.root}\nhtml,body{margin:0;padding:0}\nbody{background:var(--paper,#fff);color:var(--ink);font-family:var(--font-sans)}\n</style>`;
  return /<\/head>/i.test(source) ? source.replace(/<\/head>/i, () => `${style}</head>`) : `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${source}</body></html>`;
}

function parseArgs(argv) {
  const opts = { input: null, theme: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--theme') { opts.theme = argv[++i]; if (opts.theme === undefined || opts.theme.startsWith('--')) usage('--theme needs a file, e.g. --theme brand.css'); }
    else if (arg === '-h' || arg === '--help') usage();
    else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
    else if (opts.input) usage(`one input at a time, got ${opts.input} and ${arg}`);
    else opts.input = arg;
  }
  if (!opts.input) usage('no figs folder or source file');
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const chrome = findChrome();
  if (!chrome) { console.error('draw: Chrome not found; set CHROME_PATH to a Chrome or Chromium binary, or install one'); return 2; }
  if (!fs.existsSync(opts.input)) usage(`${opts.input}: no such file or folder`);
  const input = path.resolve(opts.input);
  const isDir = fs.statSync(input).isDirectory();
  const files = isDir ? fs.readdirSync(input).filter((f) => SOURCE.test(f)).sort().map((f) => path.join(input, f)) : [input];
  if (!files.length) { console.error(`draw: no Dxx.html in ${opts.input}`); return 1; }
  if (!isDir && !SOURCE.test(path.basename(input))) usage('a single source is named Dxx.html (D01.html)');

  let theme;
  try { theme = resolveTheme({ theme: opts.theme, startDir: isDir ? input : path.dirname(input) }); } catch (e) { console.error(`draw: ${e.message}`); return 2; }
  const kit = fs.readFileSync(KIT, 'utf8');

  const { chromium } = loadPlaywright();
  let browser;
  try { browser = await chromium.launch({ executablePath: chrome, timeout: TIMEOUTS.launch }); } catch (e) { console.error(`draw: Chrome did not start: ${e.message.split('\n')[0]}`); return 2; }
  let failed = 0;
  try {
    for (const file of files) {
      const id = path.basename(file).replace(/\.html?$/i, '');
      const label = path.basename(file);
      // The kit is a context init script, so it is in place before the source's own script runs.
      const init = `window.__FIG = ${JSON.stringify(id)};\n${kit}`;
      const page = await sandboxedPage(browser, { viewport: { width: 1280, height: 900 } }, { scripts: true, init });
      try {
        // An uncaught error in the source's own script fails the figure at once instead of waiting for the timeout.
        let crash;
        const crashed = new Promise((_, reject) => { crash = reject; });
        crashed.catch(() => {});
        page.on('pageerror', (e) => crash(new Error(e.message)));
        await page.setContent(pageOf(fs.readFileSync(file, 'utf8'), theme), { waitUntil: 'load', timeout: TIMEOUTS.load });
        await Promise.race([
          page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: TIMEOUTS.load })
            .catch(() => { throw new Error('the drawing did not finish: does the source call K.draw(() => { ... })?'); }),
          crashed
        ]);
        const error = await page.evaluate(() => window.__error);
        if (error) throw new Error(error);
        const svg = await page.evaluate(() => document.querySelector('svg')?.outerHTML ?? '');
        const problems = checkSvg(svg);
        if (problems.length) throw new Error(problems.join('; '));
        const out = path.join(path.dirname(file), `${id}.svg`);
        fs.writeFileSync(out, `${svg}\n`);
        console.log(`wrote ${out}`);
      } catch (e) {
        failed++;
        console.error(`draw: ${label}: ${e.message.split('\n')[0]}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`draw: ${e.message}`); process.exit(1); });
}
