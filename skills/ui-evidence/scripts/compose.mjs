#!/usr/bin/env node
// Builds side-by-side BEFORE | AFTER PNGs to attach to a ticket or PR.
//   node compose.mjs --pairs <pairs.json> [--out <dir>] [--labels before=BEFORE,after=AFTER]
// pairs.json: [["01-checkout-iphone-se", "/abs/before.png", "/abs/after.png"], ...]
// Names containing "desktop" render at 640 px per side, everything else at 320 px.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composeWidth, fail, loadBrowser, missingArgs, parseArgs, parseLabels, parsePairs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (missingArgs(args, ['pairs']).length) fail('Required: --pairs <pairs.json>. See the header of compose.mjs.');
if (!fs.existsSync(args.pairs)) fail(`--pairs: ${args.pairs} does not exist`);
const OUT = typeof args.out === 'string' ? args.out : path.join(os.tmpdir(), 'ui-evidence', 'evidence');

let pairs, LABELS;
try { pairs = parsePairs(fs.readFileSync(args.pairs, 'utf8')); LABELS = parseLabels(args.labels); } catch (error) { fail(error.message); }
for (const [name, before, after] of pairs) for (const file of [before, after]) if (!fs.existsSync(file)) fail(`${name}: missing ${file}`);

const { chromium, launch } = loadBrowser();
const toDataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const figure = (label, file, color, width) => `<figure style="margin:0">
  <figcaption style="font-weight:700;color:${color};margin-bottom:8px">${escapeHtml(label)}</figcaption>
  <img src="${toDataUrl(file)}" style="width:${width}px;border:1px solid #999;display:block"/>
</figure>`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launch);
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  for (const [name, before, after] of pairs) {
    const width = composeWidth(name);
    await page.setContent(`<body style="margin:0;padding:16px;font-family:system-ui;background:#eee;display:inline-flex;gap:16px">
      ${figure(LABELS.before, before, '#c62828', width)}${figure(LABELS.after, after, '#2e7d32', width)}
    </body>`);
    const file = path.join(OUT, `${name}.png`);
    await page.locator('body').screenshot({ path: file });
    console.log(file);
  }
} finally { await browser.close(); }
