#!/usr/bin/env node
// Resolves the theme of a design doc: the colours and fonts of its page.
//   node theme.mjs [--theme <css>] [--from <dir>]            prints which theme applies and where it came from
//   node theme.mjs --apply <doc.html> [--theme <css>]        writes the theme into the doc's <style>
//   import { resolveTheme } from './theme.mjs';  resolveTheme({ theme, startDir }) -> { source, file, css, tokens }
// Order: --theme, then the nearest .design-doc-theme.css up to the repo root, then the theme of the org profile that
// matches the repo's origin, then the default (the :root block of references/template.html).
// A theme is a CSS file with one :root {} block, optionally preceded by @import and @font-face. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOrg } from './org.mjs';

export const REQUIRED = ['ink', 'muted', 'line', 'soft', 'accent', 'accent-soft', 'warn', 'warn-soft', 'ok', 'ok-soft', 'bad', 'bad-soft', 'font-sans', 'font-mono'];
// Optional tokens and what they fall back to (a literal, or another token).
export const OPTIONAL = { paper: '#fff', off: 'var(--soft)', 'accent-on-dark': 'var(--accent)', 'accent-fill': 'var(--accent)', 'accent-dark': 'var(--ink)' };

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, '..', 'references', 'template.html');
const THEME_FILE = '.design-doc-theme.css';
const MARK = /\/\* gutix-theme \*\/([\s\S]*?)\/\* \/gutix-theme \*\//;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Splits on `;` outside quotes and parentheses (a font stack or a url() may hold one). */
function declarations(body) {
  const out = [];
  let cur = '', depth = 0, quote = '';
  for (const ch of body) {
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && !depth) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((d) => d.trim()).filter(Boolean);
}

/** `css` -> { preamble, root, tokens } where root is the :root block as written and tokens maps name -> value. */
export function parseTheme(css, label = 'theme') {
  const text = stripComments(css);
  const m = /(^|[};\s])(:root)\s*\{/.exec(text);
  if (!m) throw new Error(`${label}: no :root { } block`);
  const open = m.index + m[0].length - 1;
  let depth = 0, close = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) { close = i; break; }
  }
  if (close < 0) throw new Error(`${label}: the :root block is never closed`);
  const tokens = {};
  for (const d of declarations(text.slice(open + 1, close))) {
    const i = d.indexOf(':');
    if (i > 0 && d.startsWith('--')) tokens[d.slice(2, i).trim()] = d.slice(i + 1).trim();
  }
  const rest = text.slice(0, m.index + m[1].length) + text.slice(close + 1);
  if (/:root\s*\{/.test(rest)) throw new Error(`${label}: more than one :root block`);
  return { preamble: rest.trim(), root: text.slice(m.index + m[1].length, close + 1).trim(), tokens };
}

function load(file, source) {
  const css = fs.readFileSync(file, 'utf8');
  const parsed = parseTheme(css, file);
  const missing = REQUIRED.filter((t) => !parsed.tokens[t]);
  if (missing.length) throw new Error(`${file}: the theme is missing ${missing.map((t) => `--${t}`).join(', ')}`);
  return { source, file, ...parsed };
}

function defaultTheme() {
  const html = fs.readFileSync(TEMPLATE, 'utf8');
  const block = MARK.exec(html);
  if (!block) throw new Error(`${TEMPLATE}: the gutix-theme markers are gone`);
  const parsed = parseTheme(block[1], TEMPLATE);
  return { source: 'default', file: null, ...parsed };
}

function findRepoTheme(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, THEME_FILE);
    if (fs.existsSync(candidate)) return candidate;
    if (fs.existsSync(path.join(dir, '.git')) || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

/** The theme for a doc: tokens with the optional ones filled in, plus where it came from. Throws on a theme that is broken. */
export function resolveTheme({ theme, startDir = process.cwd(), warn = (m) => process.stderr.write(`warning: ${m}\n`) } = {}) {
  let found = null;
  if (theme) {
    if (!fs.existsSync(theme)) throw new Error(`--theme ${theme}: no such file`);
    found = load(path.resolve(theme), 'flag');
  } else {
    const repo = findRepoTheme(startDir);
    if (repo) found = load(repo, 'repo');
    else {
      const org = resolveOrg(startDir, { warn });
      const rel = org?.profile?.theme;
      if (rel) {
        const file = path.resolve(org.dir, rel);
        if (fs.existsSync(file)) found = { ...load(file, 'org'), org: org.name };
        else warn(`org "${org.name}": theme "${rel}" does not exist, using the default`);
      }
    }
  }
  found ??= defaultTheme();
  const tokens = { ...found.tokens };
  for (const [name, fallback] of Object.entries(OPTIONAL)) tokens[name] ??= fallback;
  return { ...found, tokens };
}

/** Every concrete colour or font a theme defines, resolved through `var(--x)` fallbacks, lower-cased. */
export function themeValues(theme) {
  const resolve = (v, seen = new Set()) => {
    const m = /^var\(--([\w-]+)\)$/.exec(v.trim());
    if (!m || seen.has(m[1]) || theme.tokens[m[1]] === undefined) return v.trim();
    return resolve(theme.tokens[m[1]], seen.add(m[1]));
  };
  return Object.fromEntries(Object.entries(theme.tokens).map(([k, v]) => [k, resolve(v).toLowerCase()]));
}

/** Writes the theme (preamble and :root) between the gutix-theme markers of the doc's <style>. Same input, same output. */
export function applyTheme(html, theme) {
  if (!MARK.test(html)) throw new Error('the doc has no /* gutix-theme */ markers: start it from references/template.html');
  const block = `/* gutix-theme */\n${theme.preamble ? `${theme.preamble}\n` : ''}  ${theme.root}\n  /* /gutix-theme */`;
  return html.replace(MARK, () => block);
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const doc = arg('--apply');
    const theme = resolveTheme({ theme: arg('--theme'), startDir: arg('--from') ?? (doc ? path.dirname(path.resolve(doc)) : process.cwd()) });
    if (doc) {
      const before = fs.readFileSync(doc, 'utf8');
      const after = applyTheme(before, theme);
      if (after !== before) fs.writeFileSync(doc, after);
      console.log(`${after === before ? 'unchanged' : 'themed'} ${doc} (${theme.source}${theme.file ? `: ${theme.file}` : ''}); run extract-llm.mjs if it changed`);
    } else {
      console.log(`${theme.source}${theme.file ? `: ${theme.file}` : ''}`);
    }
    return 0;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
