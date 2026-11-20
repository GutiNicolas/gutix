#!/usr/bin/env node
// Writes the model twin of a design-doc HTML: <name>.llm.md next to <name>.html. No dependencies.
//   node extract-llm.mjs <doc.html>...            write or refresh each twin
//   node extract-llm.mjs --check <doc.html>...    exit 1 if a twin is missing or stale
//   node extract-llm.mjs --stdout <doc.html>      print the twin instead of writing it
// The twin keeps headings, paragraphs, lists, tables (as Markdown tables), code, callouts as blockquotes
// and each SVG as its <title> plus its text labels. Its first line holds the sha256 of the HTML it came from.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 1;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea']);
const SKIP = new Set(['head', 'script', 'style', 'template', 'noscript', 'colgroup', 'col', 'button', 'input', 'select']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'details', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'html', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'ul', 'svg']);
// Classed blocks that become blockquotes opened by **[class]**. Any other classed block keeps its content as plain blocks.
const CALLOUTS = new Set(['decision', 'pitfall', 'adr', 'why', 'box', 'note', 'warn', 'warning', 'callout', 'risk']);
// Elements that a new opening tag closes implicitly (HTML optional end tags).
const AUTO_CLOSE = {
	li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'],
	thead: ['tbody', 'tfoot', 'tr', 'td', 'th'], tbody: ['thead', 'tbody', 'tr', 'td', 'th'], tfoot: ['thead', 'tbody', 'tr', 'td', 'th'],
	option: ['option']
};
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const SCOPE = new Set(['table', 'ul', 'ol', 'dl', 'svg']); // implicit closes never cross these

const ENTITIES = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
	lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', times: '×', divide: '÷', deg: '°', plusmn: '±',
	le: '≤', ge: '≥', ne: '≠', asymp: '≈', rarr: '→', larr: '←', harr: '↔', uarr: '↑', darr: '↓', rArr: '⇒', check: '✓',
	copy: '©', reg: '®', trade: '™', euro: '€', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', sect: '§', para: '¶', micro: 'µ',
	aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç', atilde: 'ã', otilde: 'õ',
	Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ccedil: 'Ç', thinsp: ' ', ensp: ' ', emsp: ' ', shy: ''
};
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
	if (e[0] === '#') {
		const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
		return Number.isFinite(code) ? String.fromCodePoint(code) : m;
	}
	return e in ENTITIES ? ENTITIES[e] : m;
});

// ---------- parse ----------

const parseAttrs = (src) => {
	const attrs = {};
	const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
	let m;
	while ((m = re.exec(src))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
	return attrs;
};

export function parse(html) {
	const root = { tag: '#root', attrs: {}, children: [] };
	const stack = [root];
	const top = () => stack[stack.length - 1];
	const closeTo = (i) => { stack.length = i; };
	const findOpen = (names, crossScope = false) => {
		for (let i = stack.length - 1; i > 0; i--) {
			if (names.includes(stack[i].tag)) return i;
			if (!crossScope && SCOPE.has(stack[i].tag)) return -1;
		}
		return -1;
	};
	const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+|</g;
	let m;
	while ((m = re.exec(html))) {
		const [tok, cdata, endTag, startTag, rawAttrs] = m;
		if (cdata !== undefined) { top().children.push({ text: cdata }); continue; }
		if (tok.startsWith('<!') || tok.startsWith('<?')) continue;
		if (endTag) {
			const name = endTag.toLowerCase();
			const i = findOpen([name], true);
			if (i > 0) closeTo(i);
			continue;
		}
		if (startTag) {
			const name = startTag.toLowerCase();
			const selfClosing = /\/\s*$/.test(rawAttrs);
			if (AUTO_CLOSE[name]) {
				const i = findOpen(AUTO_CLOSE[name]);
				if (i > 0) closeTo(i);
			}
			if (CLOSES_P.has(name)) {
				const i = findOpen(['p']);
				if (i > 0) closeTo(i);
			}
			const node = { tag: name, attrs: parseAttrs(rawAttrs.replace(/\/\s*$/, '')), children: [] };
			top().children.push(node);
			if (RAW.has(name)) {
				const end = html.toLowerCase().indexOf(`</${name}`, re.lastIndex);
				const stop = end < 0 ? html.length : end;
				node.children.push({ text: html.slice(re.lastIndex, stop) });
				re.lastIndex = stop;
				continue;
			}
			if (!VOID.has(name) && !selfClosing) stack.push(node);
			continue;
		}
		top().children.push({ text: decode(tok) });
	}
	return root;
}

// ---------- render ----------

const classes = (n) => (n.attrs?.class || '').split(/\s+/).filter(Boolean);
const collapse = (s) => s.replace(/[ \t\r\n\f]+/g, ' ');
const find = (n, tag) => {
	if (n.tag === tag) return n;
	for (const c of n.children || []) { const f = find(c, tag); if (f) return f; }
	return null;
};
const textOf = (n) => (n.text !== undefined ? n.text : (n.children || []).map(textOf).join(''));

const codeSpan = (s) => {
	const t = s.replace(/\n/g, ' ');
	if (!t.trim()) return t;
	const runs = t.match(/`+/g) || [];
	const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
	const pad = t.startsWith('`') || t.endsWith('`') ? ' ' : '';
	return fence + pad + t + pad + fence;
};
const wrap = (mark, s) => {
	const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
	return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : s;
};

// Inline content of a node, on one logical line. Block children are joined with a separator (used inside table cells).
function inline(n, ctx = {}) {
	if (n.text !== undefined) return ctx.pre ? n.text : collapse(n.text);
	const t = n.tag;
	if (SKIP.has(t)) return '';
	const kids = () => n.children.map((c) => inline(c, ctx)).join('');
	switch (t) {
		case 'br': return ctx.cell ? '<br>' : '\n';
		case 'strong': case 'b': return wrap('**', kids());
		case 'em': case 'i': case 'cite': case 'dfn': return wrap('*', kids());
		case 's': case 'del': case 'strike': return wrap('~~', kids());
		case 'code': case 'kbd': case 'samp': case 'tt': return ctx.pre ? textOf(n) : codeSpan(collapse(textOf(n)));
		case 'a': {
			const text = kids();
			const href = n.attrs.href || '';
			if (!href || href.startsWith('#') || href === text.trim()) return text;
			return `[${text.trim()}](${href})`;
		}
		case 'img': return n.attrs.alt ? `![${n.attrs.alt}](${n.attrs.src || ''})` : '';
		case 'svg': return svgSummary(n);
		case 'span':
			if (classes(n).includes('lbl')) { const k = kids().trim(); return k ? `**${k}:** ` : ''; }
			return kids();
		case 'li': return ' • ' + kids().trim();
		default:
			if (BLOCK.has(t) || t === 'tr' || t === 'td' || t === 'th') {
				const inner = kids().trim();
				return inner ? ` ${inner} ` : '';
			}
			return kids();
	}
}

const cleanLine = (s) => s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{2,}/g, '\n').trim();

function svgSummary(svg) {
	const title = find(svg, 'title');
	const titleText = title ? collapse(textOf(title)).trim() : '';
	const labels = [];
	const walk = (n) => {
		if (n.tag === 'title' || n.tag === 'desc' || n.tag === 'style' || n.tag === 'defs') return;
		if (n.tag === 'text') {
			// each <tspan> is its own line in the drawing: keep a space between them
			const spaced = (x) => (x.text !== undefined ? x.text : (x.children || []).map(spaced).join(x.tag === 'tspan' ? '' : ' ') + (x.tag === 'tspan' ? ' ' : ''));
			const s = collapse(spaced(n)).trim();
			if (s) labels.push(s);
			return;
		}
		(n.children || []).forEach(walk);
	};
	walk(svg);
	const desc = find(svg, 'desc');
	const parts = [];
	parts.push(titleText ? `**[diagram]** ${titleText}` : '**[diagram]** (no <title>)');
	if (desc) parts.push(collapse(textOf(desc)).trim());
	if (labels.length) parts.push(`Labels: ${labels.join(' · ')}`);
	return parts.join('\n');
}

const escapeCell = (s) => s.replace(/\|/g, '\\|').replace(/\n+/g, '<br>').trim();

function table(n) {
	const rows = [];
	let caption = '';
	const collect = (node) => {
		for (const c of node.children || []) {
			if (c.tag === 'caption') caption = cleanLine(inline(c));
			else if (c.tag === 'tr') rows.push(c);
			else if (c.tag === 'thead' || c.tag === 'tbody' || c.tag === 'tfoot') collect(c);
		}
	};
	collect(n);
	const grid = [];
	const pending = []; // rowspan carry: col -> remaining rows
	let headerRows = 0;
	rows.forEach((tr, r) => {
		const out = [];
		const cells = tr.children.filter((c) => c.tag === 'td' || c.tag === 'th');
		let col = 0;
		const fillSpans = () => {
			while (pending[col] > 0) { out[col] = ''; pending[col]--; col++; }
		};
		for (const cell of cells) {
			fillSpans();
			out[col] = escapeCell(cleanLine(inline(cell, { cell: true })));
			const cs = Math.max(1, parseInt(cell.attrs.colspan || '1', 10) || 1);
			const rs = Math.max(1, parseInt(cell.attrs.rowspan || '1', 10) || 1);
			for (let k = 0; k < cs; k++) {
				if (k > 0) out[col + k] = '';
				if (rs > 1) pending[col + k] = rs - 1;
			}
			col += cs;
		}
		fillSpans();
		if (r === headerRows && cells.length && cells.every((c) => c.tag === 'th')) headerRows++;
		grid.push(out);
	});
	if (!grid.length) return caption ? `**${caption}**` : '';
	const width = Math.max(...grid.map((r) => r.length));
	const line = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ') + ' |';
	const lines = [];
	if (caption) lines.push(`**${caption}**`, '');
	let body = grid;
	let head;
	if (headerRows >= 1) {
		head = grid[0];
		// extra header rows are kept as bold body rows so nothing is lost
		body = grid.slice(1).map((r, i) => (i < headerRows - 1 ? r.map((c) => (c ? `**${c}**` : c)) : r));
	} else {
		head = Array(width).fill('');
	}
	lines.push(line(head), '| ' + Array(width).fill('---').join(' | ') + ' |', ...body.map(line));
	return lines.join('\n');
}

// Block rendering: returns an array of Markdown blocks (strings); the caller joins them with blank lines.
function blocks(n, ctx = { depth: 0 }) {
	const out = [];
	let buf = '';
	const flush = () => {
		const s = cleanLine(buf);
		if (s) out.push(s);
		buf = '';
	};
	for (const c of n.children || []) {
		if (c.text !== undefined) { buf += collapse(c.text); continue; }
		if (SKIP.has(c.tag)) continue;
		if (!BLOCK.has(c.tag) && !['table', 'img'].includes(c.tag)) { buf += inline(c); continue; }
		flush();
		out.push(...block(c, ctx));
	}
	flush();
	return out;
}

const quote = (parts) => parts.join('\n\n').split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
const indent = (s, pad) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');

function block(n, ctx) {
	const t = n.tag;
	const cls = classes(n);
	if (/^h[1-6]$/.test(t)) {
		const text = cleanLine(inline(n)).replace(/\n/g, ' ');
		return text ? [`${'#'.repeat(+t[1])} ${text}`] : [];
	}
	if (t === 'p' || t === 'summary' || t === 'dt') {
		const s = cleanLine(inline(n));
		if (!s) return [];
		return [t === 'p' ? s : `**${s}**`];
	}
	if (t === 'hr') return ['---'];
	if (t === 'pre') {
		const code = find(n, 'code');
		const lang = ((code && classes(code).find((c) => c.startsWith('language-'))) || '').replace('language-', '');
		const body = textOf(n).replace(/^\n/, '').replace(/\s+$/, '');
		const fence = '`'.repeat(Math.max(3, ...((body.match(/`{3,}/g) || []).map((r) => r.length + 1))));
		return [`${fence}${lang}\n${body}\n${fence}`];
	}
	if (t === 'table') { const s = table(n); return s ? [s] : []; }
	if (t === 'svg') return [svgSummary(n)];
	if (t === 'img') { const s = inline(n); return s ? [s] : []; }
	if (t === 'ul' || t === 'ol') {
		const items = [];
		let k = parseInt(n.attrs.start || '1', 10) || 1;
		for (const li of n.children.filter((c) => c.tag === 'li')) {
			const marker = t === 'ol' ? `${k++}.` : '-';
			const inner = blocks(li, { ...ctx, depth: ctx.depth + 1 });
			const pad = ' '.repeat(marker.length + 1);
			const [first = '', ...rest] = inner;
			let s = `${marker} ${indent(first, pad).trimStart()}`;
			for (const b of rest) s += '\n' + indent(b, pad);
			items.push(s);
		}
		return items.length ? [items.join('\n')] : [];
	}
	if (t === 'dl') {
		const parts = [];
		for (const c of n.children) {
			if (c.tag === 'dt') parts.push(`**${cleanLine(inline(c))}**`);
			else if (c.tag === 'dd') parts.push(...blocks(c, ctx).map((b) => indent(b, ': ')));
		}
		return parts;
	}
	if (t === 'blockquote') { const inner = blocks(n, ctx); return inner.length ? [quote(inner)] : []; }
	if (t === 'figure') {
		const inner = [];
		for (const c of n.children) {
			if (c.tag === 'figcaption') { const s = cleanLine(inline(c)); if (s) inner.push(`*${s.replace(/\*/g, '')}*`); }
			else if (c.text !== undefined) { const s = collapse(c.text).trim(); if (s) inner.push(s); }
			else inner.push(...block(c, ctx));
		}
		return inner;
	}
	const callout = cls.find((c) => CALLOUTS.has(c));
	if (callout && (t === 'div' || t === 'aside' || t === 'section' || t === 'p')) {
		const inner = t === 'p' ? [cleanLine(inline(n))] : blocks(n, ctx);
		const filtered = inner.filter(Boolean);
		if (!filtered.length) return [];
		const label = `**[${callout}]**`;
		// a heading inside the callout becomes its bold title line
		const head = filtered[0].match(/^#{1,6} (.*)$/);
		if (head) filtered[0] = `${label} **${head[1]}**`;
		else filtered.unshift(label);
		return [quote(filtered)];
	}
	return blocks(n, ctx);
}

export function sha256(buf) {
	return crypto.createHash('sha256').update(buf).digest('hex');
}

export function header(htmlName, hash) {
	return `<!-- llm-twin source=${htmlName} sha256=${hash} extractor=v${VERSION} -- generated, do not edit: change the HTML and run extract-llm.mjs -->`;
}

export function toMarkdown(html, htmlName = 'doc.html') {
	const root = parse(html);
	const body = find(root, 'body') || root;
	const parts = blocks(body);
	const h1 = find(body, 'h1');
	const title = find(root, 'title');
	if (!h1 && title) parts.unshift(`# ${collapse(textOf(title)).trim()}`);
	const text = parts.join('\n\n').replace(/\n{3,}/g, '\n\n');
	return `${header(htmlName, sha256(Buffer.from(html, 'utf8')))}\n\n${text}\n`;
}

export const twinPath = (htmlPath) => htmlPath.replace(/\.html?$/i, '') + '.llm.md';

// ---------- cli ----------

function main(argv) {
	const flags = new Set(argv.filter((a) => a.startsWith('--')));
	const files = argv.filter((a) => !a.startsWith('--'));
	if (!files.length || flags.has('--help')) {
		console.error('usage: node extract-llm.mjs [--check | --stdout] <doc.html>...');
		return 2;
	}
	let failed = 0;
	for (const file of files) {
		const html = fs.readFileSync(file, 'utf8');
		const md = toMarkdown(html, path.basename(file));
		const out = twinPath(file);
		if (flags.has('--stdout')) { process.stdout.write(md); continue; }
		if (flags.has('--check')) {
			const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
			if (current === null) { console.error(`MISSING ${out}: run node extract-llm.mjs ${file}`); failed++; }
			else if (current !== md) {
				const stale = !current.includes(`sha256=${sha256(Buffer.from(html, 'utf8'))}`);
				console.error(`${stale ? 'STALE' : 'DIFFERS'} ${out}: ${stale ? 'the HTML changed since it was generated;' : 'edited by hand or made by another extractor version;'} regenerate with node extract-llm.mjs ${file}`);
				failed++;
			} else console.log(`OK ${out}`);
			continue;
		}
		fs.writeFileSync(out, md);
		console.log(`wrote ${out} (${html.length} → ${md.length} chars)`);
	}
	return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
