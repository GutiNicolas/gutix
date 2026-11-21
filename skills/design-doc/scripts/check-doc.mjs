#!/usr/bin/env node
// Checks a design-doc HTML before anyone reads it. No dependencies.
//   node check-doc.mjs <doc.html> [--vocab <vocabulary.json>] [--theme <theme.css>]
// Prints OK, or every problem, and exits 1.
// Vocabulary: a JSON list of {"pattern": "regex", "flags": "i", "reason": "..."} applied to the visible text.
// Without --vocab it uses the first .design-doc-vocabulary.json found from the doc's folder up to the repo root.
// Figure colours must come from the theme: var(--token), or a literal that equals a theme value. The theme is --theme,
// else the repo's, the org's or the default one (see theme.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, toMarkdown, twinPath } from './extract-llm.mjs';
import { resolveTheme, themeValues } from './theme.mjs';

const FIGURE_CAPTION = /^(?:Figure|Figura|Fig\.)\s+(\d+)\.\s+\S/;
const MARKER = /<!--\s*svg\s+(D\d+)\s*-->/g;
const TEMPLATE_LEFTOVER = /\b(SLUG|PART TITLE|DECISION TITLE|PITFALL TITLE|YYYY-MM-DD)\b/;

const walk = (n, f, parents = []) => {
	f(n, parents);
	for (const c of n.children || []) walk(c, f, [...parents, n]);
};
const textOf = (n) => (n.text !== undefined ? n.text : (n.children || []).map(textOf).join(''));
const visibleText = (n) => {
	if (n.text !== undefined) return n.text;
	if (['head', 'style', 'script', 'defs'].includes(n.tag)) return '';
	return (n.children || []).map(visibleText).join(n.tag === 'tspan' ? ' ' : '');
};
const classes = (n) => (n.attrs?.class || '').split(/\s+/).filter(Boolean);

// Colour keywords that are not a palette choice.
const NEUTRAL = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset']);
const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
const COLOR_PROPS = new RegExp(`(?:^|[;{\\s])(${COLOR_ATTRS.join('|')})\\s*:\\s*([^;}]+)`, 'gi');

/** `#fff` and `#ffffff` compare equal; everything else compares lower-cased with no spaces. */
const normColor = (v) => {
	const c = v.trim().toLowerCase().replace(/\s+/g, '');
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
	return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : c;
};

/** The colours a figure uses that its theme does not offer. `allowed` is a Set of normalised theme values. */
function strayColors(svg, tokens, allowed) {
	const found = [];
	const add = (v) => { if (v) found.push(v.trim()); };
	walk(svg, (n) => {
		if (!n.tag) return;
		for (const a of COLOR_ATTRS) add(n.attrs?.[a]);
		const css = n.tag === 'style' ? textOf(n) : n.attrs?.style;
		if (css) for (const m of css.matchAll(COLOR_PROPS)) add(m[2]);
	});
	const stray = new Set();
	for (const raw of found) {
		const v = raw.replace(/\s*!important$/i, '');
		const varRef = /^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/.exec(v);
		if (varRef) { if (!(varRef[1] in tokens)) stray.add(`var(--${varRef[1]}) (the theme has no --${varRef[1]})`); continue; }
		if (NEUTRAL.has(v.toLowerCase()) || /^url\(/i.test(v)) continue;
		if (!allowed.has(normColor(v))) stray.add(v);
	}
	return [...stray];
}

function findVocabulary(docPath) {
	let dir = path.dirname(path.resolve(docPath));
	for (;;) {
		const candidate = path.join(dir, '.design-doc-vocabulary.json');
		if (fs.existsSync(candidate)) return candidate;
		if (fs.existsSync(path.join(dir, '.git')) || path.dirname(dir) === dir) return null;
		dir = path.dirname(dir);
	}
}

export function checkDoc(docPath, { vocab, theme } = {}) {
	const problems = [];
	const html = fs.readFileSync(docPath, 'utf8');
	const name = path.basename(docPath);
	const twinName = path.basename(twinPath(docPath));
	const root = parse(html);

	// Routing: the first line sends agents to the twin.
	const firstLine = html.split('\n', 1)[0];
	if (!/^<!--/.test(firstLine) || !firstLine.includes(twinName)) problems.push(`line 1: needs the routing comment that points agents to ${twinName} (see references/template.html)`);

	for (const m of html.matchAll(MARKER)) problems.push(`figure ${m[1]}: SVG not inlined yet (run inline-figures.mjs)`);
	const leftover = visibleText(root).match(TEMPLATE_LEFTOVER);
	if (leftover) problems.push(`template placeholder left: "${leftover[1]}"`);

	let title = '';
	let h1 = 0;
	const ids = new Map();
	const links = [];
	const figures = [];
	const tables = [];
	const headings = [];
	walk(root, (n, parents) => {
		if (!n.tag) return;
		if (n.tag === 'title' && !parents.some((p) => p.tag === 'svg')) title = textOf(n).trim();
		if (n.tag === 'h1') h1++;
		if (n.attrs.id) ids.set(n.attrs.id, (ids.get(n.attrs.id) || 0) + 1);
		if (n.tag === 'a' && n.attrs.href?.startsWith('#') && n.attrs.href.length > 1) links.push(n.attrs.href.slice(1));
		if (n.tag === 'figure') figures.push(n);
		if (n.tag === 'table') tables.push(n);
		if (/^h[1-6]$/.test(n.tag)) headings.push(n);
		if (n.tag === 'pre') {
			const code = n.children.find((c) => c.tag === 'code');
			if (!code || !classes(code).some((c) => c.startsWith('language-'))) problems.push(`code block "${textOf(n).replace(/\s+/g, ' ').trim().slice(0, 40)}…": needs <code class="language-…">`);
		}
	});
	if (!title) problems.push('<head>: needs a <title>');
	if (h1 !== 1) problems.push(`needs exactly one <h1> (found ${h1})`);
	for (const [id, count] of ids) if (count > 1) problems.push(`id "${id}" is used ${count} times`);
	for (const target of new Set(links)) if (!ids.has(target)) problems.push(`link to #${target}: no element has that id`);

	const themed = resolveTheme({ theme, startDir: path.dirname(path.resolve(docPath)) });
	const allowed = new Set(Object.values(themeValues(themed)).map(normColor));

	// Figures: an SVG with a <title>, and a caption numbered 1, 2, 3… in order.
	let expected = 1;
	figures.forEach((fig, i) => {
		const label = fig.attrs.id ? `figure #${fig.attrs.id}` : `figure ${i + 1}`;
		let svg = null;
		walk(fig, (n) => { if (!svg && n.tag === 'svg') svg = n; });
		const img = fig.children.some((c) => c.tag === 'img');
		if (!svg && !img) problems.push(`${label}: no <svg> or <img>`);
		if (svg) {
			const t = svg.children.find((c) => c.tag === 'title');
			if (!t || !textOf(t).trim()) problems.push(`${label}: the <svg> needs a <title> saying what it shows (it is all a model reads of the drawing)`);
			for (const c of strayColors(svg, themed.tokens, allowed)) problems.push(`${label}: colour ${c} is not in the theme; use var(--accent), var(--ink)… or a value the theme defines`);
		}
		const cap = fig.children.find((c) => c.tag === 'figcaption');
		const capText = cap ? visibleText(cap).replace(/\s+/g, ' ').trim() : '';
		const m = capText.match(FIGURE_CAPTION);
		if (!m) problems.push(`${label}: needs a <figcaption> "Figure N. …"`);
		else if (+m[1] !== expected) problems.push(`${label}: caption says Figure ${m[1]}, expected ${expected}`);
		else expected++;
	});

	// Tables: every row spans the same number of columns.
	tables.forEach((table, t) => {
		const rows = [];
		walk(table, (n) => { if (n.tag === 'tr') rows.push(n); });
		const carry = [];
		const widths = rows.map((tr) => {
			let col = 0;
			const skip = () => { while (carry[col] > 0) { carry[col]--; col++; } };
			for (const cell of tr.children.filter((c) => c.tag === 'td' || c.tag === 'th')) {
				skip();
				const cs = Math.max(1, +cell.attrs.colspan || 1);
				const rs = Math.max(1, +cell.attrs.rowspan || 1);
				for (let k = 0; k < cs; k++) if (rs > 1) carry[col + k] = rs - 1;
				col += cs;
			}
			skip();
			return col;
		});
		const width = Math.max(0, ...widths);
		widths.forEach((w, r) => { if (w !== width) problems.push(`table ${t + 1}, row ${r + 1}: ${w} columns, the table has ${width}`); });
		if (!rows.length) problems.push(`table ${t + 1}: no rows`);
	});

	// Sections: a heading followed directly by a heading of the same or higher level has nothing in it.
	const order = [];
	walk(root, (n) => { if (n.tag && (/^h[1-6]$/.test(n.tag) || ['p', 'ul', 'ol', 'table', 'figure', 'pre', 'div', 'dl', 'blockquote'].includes(n.tag))) order.push(n); });
	order.forEach((n, i) => {
		const next = order[i + 1];
		if (!/^h[2-6]$/.test(n.tag)) return;
		const isHeading = next && /^h[1-6]$/.test(next.tag);
		const insidePart = (x) => x && x.tag === 'div' && classes(x).includes('part');
		if ((!next || (isHeading && +next.tag[1] <= +n.tag[1])) && !insidePart(order[i - 1])) {
			problems.push(`section "${textOf(n).trim()}" is empty`);
		}
	});

	// Vocabulary of the repo.
	const vocabFile = vocab ?? findVocabulary(docPath);
	if (vocabFile) {
		const rules = JSON.parse(fs.readFileSync(vocabFile, 'utf8'));
		const text = visibleText(root).replace(/\s+/g, ' ');
		for (const rule of rules) {
			const re = new RegExp(rule.pattern, (rule.flags || '').replace('g', '') + 'g');
			const hits = [...text.matchAll(re)];
			if (hits.length) problems.push(`vocabulary: "${hits[0][0]}" ×${hits.length}: ${rule.reason}`);
		}
	}

	// The twin exists and matches this HTML.
	const twin = twinPath(docPath);
	if (!fs.existsSync(twin)) problems.push(`${twinName} is missing: run node extract-llm.mjs ${name}`);
	else if (fs.readFileSync(twin, 'utf8') !== toMarkdown(html, name)) problems.push(`${twinName} is stale: run node extract-llm.mjs ${name}`);

	return problems;
}

function main(argv) {
	const vi = argv.indexOf('--vocab');
	const vocab = vi >= 0 ? argv[vi + 1] : undefined;
	const ti = argv.indexOf('--theme');
	const theme = ti >= 0 ? argv[ti + 1] : undefined;
	const files = argv.filter((a, i) => !a.startsWith('--') && !(vi >= 0 && i === vi + 1) && !(ti >= 0 && i === ti + 1));
	if (!files.length) {
		console.error('usage: node check-doc.mjs <doc.html> [--vocab <vocabulary.json>] [--theme <theme.css>]');
		return 2;
	}
	let failed = 0;
	for (const file of files) {
		let problems;
		try { problems = checkDoc(file, { vocab, theme }); } catch (e) { problems = [e.message]; }
		if (problems.length) { failed++; console.log(`${file}:\n  ${problems.join('\n  ')}`); }
		else console.log(`OK ${file}`);
	}
	return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
