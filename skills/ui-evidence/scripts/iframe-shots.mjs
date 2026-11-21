#!/usr/bin/env node
// Loads a page inside host pages that embed it in an iframe and checks the CTA is on screen without scrolling.
//   node iframe-shots.mjs --url http://127.0.0.1:8080/app/checkout --label checkout \
//     [--host-html <file>] [--out <dir>] [--cta "continue|next"] [--frame-match /app/] [--labels hidden=HIDDEN]
// Built-in hosts: "modal-85vh" (a modal 85% of the viewport tall) and "fixed-600" (a 600 px iframe between a header
// and a footer). --host-html adds your own host: an HTML fragment where {{SRC}} stands for the iframe URL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CTA_SOURCE, buildCtaRegex, collectRows, exitCodeFor, fail, loadBrowser, missingArgs, parseArgs, parseLabels, verdict } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const missing = missingArgs(args, ['url', 'label']);
if (missing.length) fail(`Required: ${missing.map((m) => `--${m}`).join(' ')}. See the header of iframe-shots.mjs.`);
if (!/^[A-Za-z0-9._-]+$/.test(args.label)) fail(`--label "${args.label}" must be file-safe`);
let pageUrl, CTA_SOURCE, LABELS;
try { pageUrl = new URL(args.url); } catch { fail(`--url "${args.url}" is not a valid URL`); }
if (args['host-html'] !== undefined && (typeof args['host-html'] !== 'string' || !fs.existsSync(args['host-html']))) fail(`--host-html: ${args['host-html']} does not exist`);
try { CTA_SOURCE = buildCtaRegex(typeof args.cta === 'string' ? args.cta : DEFAULT_CTA_SOURCE).source; LABELS = parseLabels(args.labels); } catch (error) { fail(error.message); }

const OUT = typeof args.out === 'string' ? args.out : path.join(os.tmpdir(), 'ui-evidence', 'shots', 'iframe');
const FRAME_MATCH = typeof args['frame-match'] === 'string' ? args['frame-match'] : pageUrl.pathname.split('/').slice(0, 2).join('/');
const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const HOSTS = [
  {
    name: 'modal-85vh',
    html: (src) => `<head>${VIEWPORT_META}</head>
      <body style="margin:0;height:100vh;background:#0009;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
      <div style="background:#fff;width:90%;height:85vh;border-radius:12px;overflow:hidden;display:flex;flex-direction:column">
      <iframe src="${escapeAttr(src)}" style="width:100%;height:100%;border:none;flex:1"></iframe></div></body>`
  },
  {
    name: 'fixed-600',
    html: (src) => `<head>${VIEWPORT_META}</head><body style="margin:0;background:#f5f5f5">
      <div style="background:#fff;border:2px solid #4caf50;border-radius:8px;overflow:hidden">
      <div style="padding:12px 24px;border-bottom:1px solid #e0e0e0">Host header</div>
      <iframe src="${escapeAttr(src)}" style="width:100%;height:600px;border:none"></iframe>
      <div style="padding:12px 24px;border-top:1px solid #e0e0e0;text-align:center">Host footer</div></div></body>`
  }
];
if (args['host-html']) {
  const template = fs.readFileSync(args['host-html'], 'utf8');
  HOSTS.unshift({ name: 'custom', html: (src) => `<head>${VIEWPORT_META}</head>${template.replaceAll('{{SRC}}', escapeAttr(src))}` });
}
const DEVICES = ['iPhone SE', 'iPhone 13', 'Pixel 5'];

const { chromium, devices, launch } = loadBrowser();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launch);
const results = [];
const units = HOSTS.flatMap((host) => DEVICES.map((deviceName) => ({ host, deviceName })));

async function shootOne({ host, deviceName }) {
  const context = await browser.newContext(devices[deviceName]);
  try {
    const page = await context.newPage();
    await page.setContent(host.html(args.url), { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(4000);
    const iframeBox = await page.locator('iframe').first().boundingBox();
    const frame = page.frames().find((f) => f.url().includes(FRAME_MATCH));
    if (!frame || !iframeBox) { results.push({ host: host.name, device: deviceName, error: 'iframe not found' }); return; }
    const inner = await frame.evaluate((ctaSource) => {
      const cta = new RegExp(ctaSource, 'i');
      const button = [...document.querySelectorAll('button')].filter((b) => cta.test(b.textContent.trim())).pop();
      const rect = button?.getBoundingClientRect();
      return { frameInnerHeight: innerHeight, frameScrollHeight: document.documentElement.scrollHeight, buttonBottomInFrame: rect ? Math.round(rect.bottom) : null };
    }, CTA_SOURCE);
    const viewportHeight = page.viewportSize().height;
    const buttonBottomOnScreen = inner.buttonBottomInFrame === null ? null : Math.round(iframeBox.y + inner.buttonBottomInFrame);
    const file = path.join(OUT, `${args.label}-${host.name}-${deviceName.toLowerCase().replace(/\s+/g, '-')}.png`);
    await page.screenshot({ path: file });
    results.push({
      host: host.name, device: deviceName, viewportHeight, iframeTop: Math.round(iframeBox.y), iframeHeight: Math.round(iframeBox.height),
      ...inner, buttonBottomOnScreen,
      isButtonVisibleWithoutScroll: buttonBottomOnScreen === null ? null : buttonBottomOnScreen <= viewportHeight, file
    });
  } finally { await context.close(); }
}

try {
  await collectRows(units, ({ host, deviceName }) => ({ host: host.name, device: deviceName }), shootOne, results);
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, `${args.label}-results.json`), JSON.stringify(results, null, 2));
}

for (const r of results) {
  if (r.error) { console.log(`${r.host.padEnd(10)} ${r.device.padEnd(10)} ERROR ${r.error}`); continue; }
  console.log(`${args.label.padEnd(14)} ${r.host.padEnd(10)} ${r.device.padEnd(10)} iframe=${r.iframeTop}+${r.iframeHeight} btnBottom=${r.buttonBottomOnScreen}/${r.viewportHeight} ${verdict(r.isButtonVisibleWithoutScroll, LABELS)}`);
}
if (exitCodeFor(results)) console.error('some hosts failed (rows marked ERROR); exiting 1');
process.exitCode = exitCodeFor(results);
