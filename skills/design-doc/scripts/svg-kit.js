// Shared SVG primitives for design-doc diagrams. draw.mjs injects this file into a Chrome page that holds a
// diagram source (references/diagrams/<type>.html) and writes the finished <svg> to Dxx.svg. Nothing in the
// output is a literal colour or font: every one is a theme token, `var(--ink)`, `var(--font-sans)`..., so the
// figure follows whatever theme the doc has. Text is measured with the theme's real fonts, `code` between
// backticks is drawn in the mono font, and no text is drawn below 13 px (the kit throws, naming the label).
// Every shape returns its geometry so links and layout are computed, not typed:
//   { x, y, w, h, cx, cy, r, b, left(t), right(t), top(t), bottom(t) }
// A source calls K.draw(() => { ... }) once; K.svg(w, h) opens the drawing, K.legend / K.footer close it.
(function () {
	const NS = 'http://www.w3.org/2000/svg';
	// The tokens of references/template.html. `paper` is optional in a theme, so it carries its own fallback.
	const T = {
		ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)', soft: 'var(--soft)',
		accent: 'var(--accent)', accentSoft: 'var(--accent-soft)', warn: 'var(--warn)', warnSoft: 'var(--warn-soft)',
		ok: 'var(--ok)', okSoft: 'var(--ok-soft)', bad: 'var(--bad)', badSoft: 'var(--bad-soft)',
		paper: 'var(--paper, #fff)', sans: 'var(--font-sans)', mono: 'var(--font-mono)'
	};
	// Colour roles used by the templates (C.warning, C.dark... read naturally in a source).
	const C = {
		text: T.ink, dark: T.ink, accent: T.accent, muted: T.muted, line: T.line, lineStrong: T.muted, card: T.paper,
		arrow: T.ink, error: T.bad, warning: T.warn, ok: T.ok, newFill: T.accentSoft, strongFill: T.accentSoft,
		existingFill: T.soft, paper: T.paper
	};
	const KIND = {
		new: { fill: T.accentSoft, stroke: T.accent, text: T.ink },
		plain: { fill: T.paper, stroke: T.accent, text: T.ink },
		existing: { fill: T.soft, stroke: T.muted, text: T.ink },
		dark: { fill: T.ink, stroke: T.ink, text: T.paper },
		error: { fill: T.badSoft, stroke: T.bad, text: T.ink },
		warning: { fill: T.warnSoft, stroke: T.warn, text: T.ink },
		ok: { fill: T.okSoft, stroke: T.ok, text: T.ink },
		card: { fill: T.paper, stroke: T.line, text: T.ink }
	};
	const MIN_TEXT_PX = 13;
	const LINE_HEIGHT = 1.38;
	const MONO_SCALE = 0.94;

	let root = null;
	let measureContext = null;
	let families = null;
	const figId = () => String(window.__FIG || 'fig').replace(/[^\w-]+/g, '-');
	// Ids are prefixed with the figure id, so two figures inlined in one page never share one.
	const uid = (name) => `${figId()}-${name}`;

	function el(name, attrs = {}, parent = root) {
		const node = document.createElementNS(NS, name);
		for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
		if (parent) parent.appendChild(node);
		return node;
	}

	function geom(x, y, w, h, extra = {}) {
		const g = { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h, l: x, t: y, ...extra };
		g.left = (t = 0.5) => [g.x, g.y + g.h * t];
		g.right = (t = 0.5) => [g.r, g.y + g.h * t];
		g.top = (t = 0.5) => [g.x + g.w * t, g.y];
		g.bottom = (t = 0.5) => [g.x + g.w * t, g.b];
		return g;
	}

	// The theme's actual font stacks, read from the page; canvas measures with them.
	function fontFamilies() {
		if (!families) {
			const cs = getComputedStyle(document.documentElement);
			const pick = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
			families = { sans: pick('--font-sans', 'sans-serif'), mono: pick('--font-mono', 'monospace') };
		}
		return families;
	}

	function svg(width, height, opts = {}) {
		const title = (opts.title ?? document.title ?? '').trim();
		if (!title) throw new Error('the figure has no title: set <title> in the source to a sentence that says what the diagram shows');
		const host = opts.host || document.getElementById('canvas') || document.body.appendChild(el('div', { id: 'canvas' }, null));
		root = el('svg', { xmlns: NS, width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' }, null);
		root.style.display = 'block';
		root.style.overflow = 'visible';
		host.appendChild(root);
		const t = el('title');
		t.textContent = title;
		const defs = el('defs');
		const heads = { arrow: C.arrow, 'arrow-error': C.error, 'arrow-accent': C.accent, 'arrow-muted': C.muted, 'arrow-warning': C.warning, 'arrow-ok': C.ok };
		for (const [id, color] of Object.entries(heads)) {
			const m = el('marker', { id: uid(id), viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7.5, markerHeight: 7.5, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
			el('path', { d: 'M0,0.8 L10,5 L0,9.2 Z', fill: color }, m);
		}
		const realize = el('marker', { id: uid('realize'), viewBox: '0 0 14 14', refX: 13, refY: 7, markerWidth: 13, markerHeight: 13, orient: 'auto', markerUnits: 'userSpaceOnUse' }, defs);
		el('path', { d: 'M1,1 L13,7 L1,13 Z', fill: T.paper, stroke: C.arrow, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, realize);
		return root;
	}

	// Runs a drawing once the theme's fonts are in, so every measurement uses them. Errors are reported to
	// draw.mjs through window.__error; window.__ready says the drawing is done.
	async function draw(fn, opts = {}) {
		try {
			const f = fontFamilies();
			const loads = [];
			for (const w of [400, 500, 600, 700]) for (const fam of [f.sans, f.mono]) loads.push(document.fonts.load(`${w} 14px ${fam}`).catch(() => {}));
			await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))]);
			await fn();
			finish(opts);
		} catch (e) {
			window.__error = e && e.message ? e.message : String(e);
		}
	}

	// Ends the drawing: shrinks the canvas to its content (opts.fit === false keeps the size given to svg()).
	function finish(opts = {}) {
		if (!root) throw new Error('nothing was drawn: call K.svg(width, height) first');
		if (opts.fit !== false) {
			const bb = root.getBBox();
			const m = opts.margin ?? 6;
			const x = Math.floor(bb.x - m);
			const y = Math.floor(bb.y - m);
			const w = Math.ceil(bb.width + 2 * m);
			const h = Math.ceil(bb.height + 2 * m);
			root.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
			root.setAttribute('width', w);
			root.setAttribute('height', h);
		}
		window.__ready = true;
	}

	const parts = (str) => String(str).split(/(`[^`]+`)/).filter(Boolean).map((part) => {
		const mono = part.startsWith('`') && part.endsWith('`') && part.length > 1;
		return { mono, s: mono ? part.slice(1, -1) : part };
	});
	const monoSizeOf = (size) => Math.max(size * MONO_SCALE, MIN_TEXT_PX);
	function sizeOf(size, label) {
		const s = size ?? 14;
		if (s < MIN_TEXT_PX) throw new Error(`text "${label}" is ${s}px, below the ${MIN_TEXT_PX}px minimum: raise its size`);
		return s;
	}

	// Width in px of a string as text() would draw it.
	function measure(str, opts = {}) {
		measureContext ||= document.createElement('canvas').getContext('2d');
		const size = sizeOf(opts.size, str);
		const f = fontFamilies();
		let width = 0;
		for (const part of parts(str)) {
			const mono = part.mono || opts.mono;
			const s = part.mono ? monoSizeOf(size) : size;
			measureContext.font = `${opts.weight || 400} ${s}px ${mono ? f.mono : f.sans}`;
			width += measureContext.measureText(part.s).width;
		}
		return width;
	}

	// Text with `mono` spans. opts: size, weight, color, anchor, mono (all mono), halo, baseline, spacing
	function text(x, y, str, opts = {}) {
		const size = sizeOf(opts.size, str);
		const node = el('text', {
			x, y, 'font-size': size, 'font-weight': opts.weight || 400, fill: opts.color || C.text,
			'text-anchor': opts.anchor || 'start', 'font-family': opts.mono ? T.mono : T.sans,
			'dominant-baseline': opts.baseline || 'alphabetic', 'letter-spacing': opts.spacing
		}, opts.parent || root);
		node.style.whiteSpace = 'pre';
		if (opts.halo) {
			node.setAttribute('paint-order', 'stroke');
			node.setAttribute('stroke', opts.halo === true ? T.paper : opts.halo);
			node.setAttribute('stroke-width', 5);
			node.setAttribute('stroke-linejoin', 'round');
		}
		for (const part of parts(str)) {
			const span = el('tspan', {}, node);
			if (part.mono) {
				span.setAttribute('font-family', T.mono);
				span.setAttribute('font-size', monoSizeOf(size));
			}
			span.textContent = part.s;
		}
		return node;
	}

	const norm = (line, opts = {}) => {
		const l = typeof line === 'string' ? { t: line } : line;
		const size = l.size || opts.size || 13.5;
		sizeOf(size, l.t);
		return { ...l, size, lh: l.lh || opts.lh || size * LINE_HEIGHT };
	};

	// Block of lines. lines: string | { t, size, weight, color, mono, lh }. yTop is the top of the block.
	function lines(x, yTop, list, opts = {}) {
		let y = yTop;
		const nodes = [];
		for (const raw of list) {
			const line = norm(raw, opts);
			y += line.lh;
			nodes.push(text(x, y - line.lh * 0.28, line.t, {
				size: line.size, weight: line.weight || opts.weight, color: line.color || opts.color, anchor: opts.anchor || 'middle',
				mono: line.mono, halo: opts.halo, parent: opts.parent
			}));
		}
		return { y, nodes };
	}

	function contentSize(title, body, opts = {}) {
		const all = [...(title ? [norm({ t: title, size: opts.titleSize || 15, weight: 600 })] : []), ...body.map((l) => norm(l, { size: opts.size || 13.5 }))];
		return {
			w: all.reduce((m, l) => Math.max(m, measure(l.t, l)), 0),
			h: all.reduce((s, l) => s + l.lh, 0)
		};
	}

	function content(cx, top, h, title, body, opts, colors) {
		const total = contentSize(title, body, opts).h;
		let y = top + (h - total) / 2;
		if (title) y = lines(cx, y, [{ t: title, size: opts.titleSize || 15, weight: 600, color: colors.text }], { anchor: opts.anchor }).y;
		lines(cx, y, body, { size: opts.size || 13.5, color: opts.bodyColor || colors.text, anchor: opts.anchor });
	}

	const isAuto = (v) => v === undefined || v === null || v === 'auto';
	const kindOf = (name, fallback) => {
		const k = KIND[name || fallback];
		if (!k) throw new Error(`unknown kind "${name}": use ${Object.keys(KIND).join(', ')}`);
		return k;
	};

	// Rounded box. w or h = 'auto' fits the text plus padX/padY (defaults 16/10); minW/minH apply.
	function box(x, y, w, h, opts = {}) {
		const colors = kindOf(opts.kind, 'new');
		const fit = contentSize(opts.title, opts.lines || [], opts);
		const padX = opts.padX ?? 16;
		if (isAuto(w)) w = Math.max(Math.ceil(fit.w + 2 * padX), opts.minW || 0);
		if (isAuto(h)) h = Math.max(Math.ceil(fit.h + 2 * (opts.padY ?? 10)), opts.minH || 0);
		el('rect', { x, y, width: w, height: h, rx: opts.rx ?? 8, fill: colors.fill, stroke: colors.stroke, 'stroke-width': opts.strokeWidth || 1.5, 'stroke-dasharray': opts.dash });
		const anchor = opts.anchor || 'middle';
		content(anchor === 'middle' ? x + w / 2 : x + (opts.padX ?? 14), y, h, opts.title, opts.lines || [], opts, colors);
		return geom(x, y, w, h);
	}

	// Decision diamond centered at (cx, cy). 'auto' sizes leave room for the text block.
	function diamond(cx, cy, w, h, opts = {}) {
		const colors = kindOf(opts.kind, 'plain');
		const fit = contentSize(opts.title, opts.lines || [], opts);
		if (isAuto(w)) w = Math.ceil(2 * fit.w + 36);
		if (isAuto(h)) h = Math.ceil(2 * fit.h + 28);
		el('path', { d: `M${cx},${cy - h / 2} L${cx + w / 2},${cy} L${cx},${cy + h / 2} L${cx - w / 2},${cy} Z`, fill: colors.fill, stroke: colors.stroke, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'data-shape': 'diamond' });
		content(cx, cy - h / 2, h, opts.title, opts.lines || [], opts, colors);
		return geom(cx - w / 2, cy - h / 2, w, h, { vertexOnly: true });
	}

	// Data store (cylinder).
	function cyl(x, y, w, h, opts = {}) {
		const colors = kindOf(opts.kind, 'new');
		const fit = contentSize(opts.title, opts.lines || [], opts);
		if (isAuto(w)) w = Math.max(Math.ceil(fit.w + 2 * (opts.padX ?? 18)), opts.minW || 0);
		const ry = opts.ry || Math.min(9, (isAuto(h) ? fit.h + 40 : h) * 0.12);
		if (isAuto(h)) h = Math.ceil(fit.h + 3 * ry + 2 * (opts.padY ?? 8));
		const rx = w / 2;
		el('path', { d: `M${x},${y + ry} L${x},${y + h - ry} A${rx},${ry} 0 0 0 ${x + w},${y + h - ry} L${x + w},${y + ry}`, fill: colors.fill, stroke: colors.stroke, 'stroke-width': 1.5 });
		el('ellipse', { cx: x + rx, cy: y + ry, rx, ry, fill: colors.fill, stroke: colors.stroke, 'stroke-width': 1.5 });
		content(x + w / 2, y + ry * 2, h - ry * 3, opts.title, opts.lines || [], opts, colors);
		return geom(x, y, w, h, { ry });
	}

	// Message queue (horizontal cylinder, cap on the right).
	function queue(x, y, w, h, opts = {}) {
		const colors = kindOf(opts.kind, 'new');
		const rx = opts.rx || 9;
		const fit = contentSize(opts.title, opts.lines || [], opts);
		if (isAuto(w)) w = Math.max(Math.ceil(fit.w + 2 * (opts.padX ?? 16) + rx), opts.minW || 0);
		if (isAuto(h)) h = Math.max(Math.ceil(fit.h + 2 * (opts.padY ?? 10)), opts.minH || 0);
		const ry = h / 2;
		el('path', { d: `M${x + rx},${y} L${x + w - rx},${y} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} L${x + rx},${y + h} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`, fill: colors.fill, stroke: colors.stroke, 'stroke-width': 1.5, 'stroke-dasharray': opts.dash });
		el('path', { d: `M${x + w - rx},${y} A${rx},${ry} 0 0 0 ${x + w - rx},${y + h}`, fill: 'none', stroke: colors.stroke, 'stroke-width': 1.5, 'stroke-dasharray': opts.dash });
		content(x + w / 2 - rx / 2, y, h, opts.title, opts.lines || [], opts, colors);
		return geom(x, y, w, h);
	}

	// Labeled background area (lane, package, group). Content starts at y + 40.
	function zone(x, y, w, h, label, opts = {}) {
		el('rect', { x, y, width: w, height: h, rx: opts.rx ?? 12, fill: opts.fill || C.card, stroke: opts.stroke || C.line, 'stroke-width': 1.2, 'stroke-dasharray': opts.dash });
		if (label) text(x + 14, y + 22, label, { size: opts.size || 13, weight: 600, color: opts.color || C.muted, spacing: '0.02em' });
		return geom(x, y, w, h);
	}

	// Arrowhead for a stroke colour; a marker name ('realize') is used as it is. Both carry the figure id.
	const markerFor = (color) => uid({ [C.error]: 'arrow-error', [C.accent]: 'arrow-accent', [C.muted]: 'arrow-muted', [C.warning]: 'arrow-warning', [C.ok]: 'arrow-ok' }[color] || 'arrow');

	// Polyline with rounded corners. opts: dashed, color, width, head (false = no arrowhead), start, marker,
	// label (string | lines[]), labelAt [x, yTop], labelAnchor, labelColor, labelSize, radius.
	function arrow(points, opts = {}) {
		const color = opts.color || C.arrow;
		const r = opts.radius ?? 7;
		let d = `M${points[0][0]},${points[0][1]}`;
		for (let i = 1; i < points.length; i++) {
			const [x, y] = points[i];
			if (i < points.length - 1 && r > 0) {
				const [px, py] = points[i - 1];
				const [nx, ny] = points[i + 1];
				const l1 = Math.hypot(x - px, y - py);
				const l2 = Math.hypot(nx - x, ny - y);
				const rr = Math.min(r, l1 / 2, l2 / 2);
				d += ` L${x - ((x - px) / l1) * rr},${y - ((y - py) / l1) * rr} Q${x},${y} ${x + ((nx - x) / l2) * rr},${y + ((ny - y) / l2) * rr}`;
			} else {
				d += ` L${x},${y}`;
			}
		}
		el('path', {
			d, fill: 'none', stroke: color, 'stroke-width': opts.width || 1.3,
			'stroke-dasharray': opts.dashed ? '5 4' : undefined,
			'marker-end': opts.head === false ? undefined : `url(#${opts.marker ? uid(opts.marker) : markerFor(color)})`,
			'marker-start': opts.start ? `url(#${markerFor(color)})` : undefined
		});
		if (opts.label) {
			const [lx, ly] = opts.labelAt;
			lines(lx, ly, Array.isArray(opts.label) ? opts.label : [opts.label], { size: opts.labelSize || 13, anchor: opts.labelAnchor || 'middle', halo: true, color: opts.labelColor || C.text });
		}
		return points;
	}

	// Orthogonal link between two geometries. Picks the sides from their relative position, goes straight
	// when they overlap on the cross axis, and otherwise draws an elbow at mid distance.
	// opts: from/to ('l'|'r'|'t'|'b'), y/x (force the straight coordinate or the elbow), label,
	// labelSide ('above'|'below'|'left'|'right'), plus every arrow() option.
	function link(a, b, opts = {}) {
		const gapX = b.x >= a.r ? b.x - a.r : a.x >= b.r ? a.x - b.r : -1;
		const gapY = b.y >= a.b ? b.y - a.b : a.y >= b.b ? a.y - b.b : -1;
		let { from, to } = opts;
		if (!from) from = gapX >= 0 && (gapY < 0 || gapX >= gapY) ? (b.x >= a.r ? 'r' : 'l') : (b.y >= a.b ? 'b' : 't');
		const across = (side) => side === 'l' || side === 'r';
		if (!to) to = across(from) ? (from === 'r' ? 'l' : 'r') : (from === 'b' ? 't' : 'b');
		const port = (g, side, c) => {
			if (side === 'l') return [g.x, g.vertexOnly || c == null ? g.cy : c];
			if (side === 'r') return [g.r, g.vertexOnly || c == null ? g.cy : c];
			if (side === 't') return [g.vertexOnly || c == null ? g.cx : c, g.y];
			return [g.vertexOnly || c == null ? g.cx : c, g.b];
		};
		const straight = (lo1, hi1, lo2, hi2, va, vb, forced) => {
			let c = forced ?? va ?? vb;
			if (c == null) {
				const lo = Math.max(lo1, lo2);
				const hi = Math.min(hi1, hi2);
				if (hi - lo >= 12) c = (lo + hi) / 2;
			}
			const ok = c != null && c >= lo1 && c <= hi1 && c >= lo2 && c <= hi2 && (va == null || va === c) && (vb == null || vb === c);
			return ok ? c : null;
		};
		let pts;
		if (across(from) && across(to)) {
			const y = straight(a.y, a.b, b.y, b.b, a.vertexOnly ? a.cy : null, b.vertexOnly ? b.cy : null, opts.y);
			if (y != null) pts = [port(a, from, y), port(b, to, y)];
			else {
				const p = port(a, from);
				const q = port(b, to);
				const mx = opts.x ?? (p[0] + q[0]) / 2;
				pts = [p, [mx, p[1]], [mx, q[1]], q];
			}
		} else if (!across(from) && !across(to)) {
			const x = straight(a.x, a.r, b.x, b.r, a.vertexOnly ? a.cx : null, b.vertexOnly ? b.cx : null, opts.x);
			if (x != null) pts = [port(a, from, x), port(b, to, x)];
			else {
				const p = port(a, from);
				const q = port(b, to);
				const my = opts.y ?? (p[1] + q[1]) / 2;
				pts = [p, [p[0], my], [q[0], my], q];
			}
		} else if (across(from)) {
			const q = port(b, to, opts.x);
			const p = port(a, from, opts.y);
			pts = [p, [q[0], p[1]], q];
		} else {
			const q = port(b, to, opts.y);
			const p = port(a, from, opts.x);
			pts = [p, [p[0], q[1]], q];
		}
		const { label, labelSide, ...rest } = opts;
		arrow(pts, rest);
		if (label) labelSegment(pts, label, labelSide, opts);
		return pts;
	}

	// Puts a label next to the longest segment of a polyline.
	function labelSegment(pts, label, side, opts = {}) {
		let best = 0;
		let bestLen = -1;
		for (let i = 0; i < pts.length - 1; i++) {
			const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
			if (len > bestLen) [best, bestLen] = [i, len];
		}
		const [p, q] = [pts[best], pts[best + 1]];
		const list = (Array.isArray(label) ? label : [label]).map((l) => norm(l, { size: opts.labelSize || 13 }));
		const blockH = list.reduce((s, l) => s + l.lh, 0);
		const mx = (p[0] + q[0]) / 2;
		const my = (p[1] + q[1]) / 2;
		const horizontal = Math.abs(q[1] - p[1]) < Math.abs(q[0] - p[0]);
		const style = { size: opts.labelSize || 13, halo: true, color: opts.labelColor || C.text };
		if (horizontal) {
			const below = side === 'below';
			lines(mx, below ? my + 4 : my - blockH - 4, list, { ...style, anchor: 'middle' });
		} else {
			const left = side === 'left';
			lines(left ? mx - 8 : mx + 8, my - blockH / 2, list, { ...style, anchor: left ? 'end' : 'start' });
		}
	}

	// Arrow that leaves and comes back to the same shape (self transition). side: 'r' (default) or 'l'.
	function selfLoop(g, label, opts = {}) {
		const left = opts.side === 'l';
		const xEdge = left ? g.x : g.r;
		const out = left ? xEdge - (opts.reach || 38) : xEdge + (opts.reach || 38);
		const y1 = g.y + g.h * 0.28;
		const y2 = g.y + g.h * 0.72;
		arrow([[xEdge, y1], [out, y1], [out, y2], [xEdge, y2]], opts);
		if (label) lines(left ? out - 8 : out + 8, y1 - 4, Array.isArray(label) ? label : [label], { size: 13, anchor: left ? 'end' : 'start', halo: true });
	}

	// UML-like class card. spec: { name, stereo, members (mono lines), notes (sans lines), nameSize }
	function card(x, y, w, spec) {
		const hh = spec.stereo ? 46 : 32;
		const rows = [...(spec.members || []).map((t) => ({ t, mono: true })), ...(spec.notes || []).map((t) => ({ t }))];
		const row = 19;
		if (isAuto(w)) {
			const widths = [measure(spec.name, { size: spec.nameSize || 14, weight: 600 }), ...rows.map((r) => measure(r.t, { size: 13, mono: r.mono }))];
			w = Math.ceil(Math.max(...widths) + 26);
		}
		const h = hh + 10 + rows.length * row + 6;
		const rr = 6;
		el('rect', { x, y, width: w, height: h, rx: rr, fill: T.paper });
		el('path', { d: `M${x},${y + hh} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + hh} Z`, fill: T.accentSoft });
		el('line', { x1: x, y1: y + hh, x2: x + w, y2: y + hh, stroke: T.line, 'stroke-width': 1 });
		el('rect', { x, y, width: w, height: h, rx: rr, fill: 'none', stroke: T.accent, 'stroke-width': 1.5 });
		if (spec.stereo) text(x + w / 2, y + 17, spec.stereo, { size: 13, color: C.muted, anchor: 'middle' });
		text(x + w / 2, y + hh - 11, spec.name, { size: spec.nameSize || 14, weight: 600, anchor: 'middle' });
		rows.forEach((r, i) => text(x + 12, y + hh + 10 + row * (i + 1) - 5, r.t, { size: 13, mono: r.mono }));
		return geom(x, y, w, h);
	}

	// Database table. rows: [column, type, key?, indent?] | { group: 'text' } | { note: 'text' }.
	// Returns the geometry plus centers[column] = y of that row, to attach relations.
	function table(x, y, w, name, rows) {
		const row = 22;
		const head = 36;
		let cy = y + head;
		const centers = {};
		el('rect', { x, y, width: w, height: head + 6, rx: 6, fill: T.ink });
		text(x + 14, y + 23, name, { size: 14, weight: 600, mono: true, color: T.paper });
		rows.forEach((r, i) => {
			if (r.note || r.group) {
				const hh = r.note ? 26 : 24;
				el('rect', { x, y: cy, width: w, height: hh, fill: r.note ? T.accentSoft : T.soft });
				text(x + 14, cy + hh - 7.5, r.note || r.group, { size: 13, color: C.text, weight: r.group ? 500 : 400 });
				cy += hh;
				return;
			}
			const [col, type, key, indent] = r;
			el('rect', { x, y: cy, width: w, height: row, fill: i % 2 ? T.soft : T.paper });
			if (key) text(x + 12, cy + 15.5, key, { size: 13, weight: 700, color: C.accent, spacing: '0.04em' });
			text(x + 44 + (indent ? 10 : 0), cy + 15.5, col, { size: 13, mono: true, weight: key ? 600 : 400 });
			text(x + w - 12, cy + 15.5, type, { size: 13, mono: true, color: C.muted, anchor: 'end' });
			centers[col] = cy + row / 2;
			cy += row;
		});
		el('rect', { x, y, width: w, height: cy - y, rx: 6, fill: 'none', stroke: T.ink, 'stroke-width': 1.5 });
		el('line', { x1: x, y1: y + head, x2: x + w, y2: y + head, stroke: T.ink, 'stroke-width': 1 });
		return geom(x, y, w, cy - y, { centers });
	}

	// Logical many-to-one relation (crow's foot at the first point, bar at the last), dashed, no arrowhead.
	function relation(points, opts = {}) {
		arrow(points, { dashed: true, head: false, radius: 6, ...opts });
		const [[x0, y0], [x1n]] = [points[0], points[1]];
		const dir0 = Math.sign(x1n - x0) || 1;
		for (const dy of [-6, 0, 6]) el('line', { x1: x0 + 12 * dir0, y1: y0, x2: x0, y2: y0 + dy, stroke: C.arrow, 'stroke-width': 1.3 });
		const [xe, ye] = points[points.length - 1];
		const [xp] = points[points.length - 2];
		const dirE = Math.sign(xe - xp) || 1;
		el('line', { x1: xe - 8 * dirE, y1: ye - 7, x2: xe - 8 * dirE, y2: ye + 7, stroke: C.arrow, 'stroke-width': 1.4 });
	}

	// UML pseudo-states.
	function start(cx, cy) {
		el('circle', { cx, cy, r: 10, fill: T.ink });
		return geom(cx - 10, cy - 10, 20, 20, { vertexOnly: true });
	}
	function end(cx, cy) {
		el('circle', { cx, cy, r: 12, fill: T.paper, stroke: T.ink, 'stroke-width': 1.6 });
		el('circle', { cx, cy, r: 7, fill: T.ink });
		return geom(cx - 12, cy - 12, 24, 24, { vertexOnly: true });
	}

	// Small "same state, no effect" glyph, for duplicates.
	function dupGlyph(x, y) {
		const r = 6;
		const a1 = (-30 * Math.PI) / 180;
		const a2 = (250 * Math.PI) / 180;
		el('path', { d: `M${x + r * Math.cos(a1)},${y + r * Math.sin(a1)} A${r},${r} 0 1 1 ${x + r * Math.cos(a2)},${y + r * Math.sin(a2)}`, fill: 'none', stroke: C.muted, 'stroke-width': 1.4, 'marker-end': `url(#${uid('arrow-muted')})` });
	}

	// Sequence diagram. participants: [{ id, title, lines?, kind?, shape?: 'box'|'queue'|'store' }]; steps, in order:
	//   { from, to, label?, type?: 'call' | 'return' | 'async' | 'lost' }   (from === to is a message to itself)
	//   { note: 'text' | ['lines'], over: id | [id, id] }
	//   { group: 'alt', title: 'condition', steps: [...], else?: { title, steps: [...] } }
	// Columns, row heights and the lifelines are computed from the measured text.
	function sequence(participants, steps, opts = {}) {
		const index = Object.fromEntries(participants.map((p, i) => [p.id, i]));
		const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
		const need = (id) => { if (!(id in index)) throw new Error(`sequence: unknown participant "${id}"`); return index[id]; };
		const heads = participants.map((p) => contentSize(p.title, p.lines || [], {}));
		const headW = heads.map((s, i) => Math.max(Math.ceil(s.w + 32), 110, participants[i].shape === 'queue' ? 130 : 0));
		const headH = Math.max(...heads.map((s) => s.h)) + 22;
		// Column gaps: wide enough for the widest label that crosses them.
		const gaps = participants.slice(1).map((_, i) => Math.max(40, (headW[i] + headW[i + 1]) / 2 + 24));
		const flat = [];
		const walk = (list) => list.forEach((s) => { if (s.group) { walk(s.steps); if (s.else) walk(s.else.steps); } else flat.push(s); });
		walk(steps);
		for (const s of flat.filter((m) => m.from !== undefined)) {
			const [a, b] = [need(s.from), need(s.to)];
			if (a === b) continue;
			const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
			const labelW = Math.max(0, ...asList(s.label).map((l) => measure(l, { size: 13 }))) + 36;
			let span = 0;
			for (let i = lo; i < hi; i++) span += gaps[i];
			if (span < labelW) { const add = (labelW - span) / (hi - lo); for (let i = lo; i < hi; i++) gaps[i] += add; }
		}
		const xs = [];
		let x = Math.ceil(headW[0] / 2);
		participants.forEach((_, i) => { xs.push(x); if (i < gaps.length) x += gaps[i]; });
		const x0 = xs[0] - headW[0] / 2;
		const heads2 = participants.map((p, i) => {
			const w = headW[i];
			const hx = xs[i] - w / 2;
			if (p.shape === 'queue') return queue(hx, 0, w, headH, { kind: p.kind || 'new', title: p.title, lines: p.lines || [] });
			if (p.shape === 'store') return cyl(hx, 0, w, headH + 8, { kind: p.kind || 'new', title: p.title, lines: p.lines || [] });
			return box(hx, 0, w, headH, { kind: p.kind || 'new', title: p.title, lines: p.lines || [] });
		});
		// The lifelines are drawn first, behind everything (their length is only known at the end): reserve a node.
		const lifelines = participants.map(() => el('line', { stroke: T.line, 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }));
		const marks = [];
		let y = Math.max(...heads2.map((g) => g.b)) + 26;
		const run = (list, depth) => {
			for (const s of list) {
				if (s.group) {
					const top = y;
					const inset = 16 + depth * 8;
					y += 8;
					const sections = [{ title: s.title, steps: s.steps }, ...(s.else ? [{ title: s.else.title, steps: s.else.steps, divider: true }] : [])];
					const dividers = [];
					for (const sec of sections) {
						if (sec.divider) { dividers.push({ y, title: sec.title }); y += 8; }
						else dividers.push({ y: top, title: sec.title, first: true });
						run(sec.steps, depth + 1);
					}
					marks.push({ type: 'group', kind: s.group, top, bottom: y, inset, dividers });
					y += 14;
					continue;
				}
				if (s.note !== undefined) {
					const over = asList(s.over);
					const [a, b] = [Math.min(...over.map(need)), Math.max(...over.map(need))];
					const list2 = asList(s.note).map((l) => norm(l, { size: 13 }));
					const w = Math.max(xs[b] - xs[a] + 60, Math.max(...list2.map((l) => measure(l.t, l))) + 28);
					const h = list2.reduce((n, l) => n + l.lh, 0) + 14;
					const nx = (xs[a] + xs[b]) / 2 - w / 2;
					marks.push({ type: 'note', x: nx, y, w, h, list: list2 });
					y += h + 16;
					continue;
				}
				const [a, b] = [need(s.from), need(s.to)];
				const list2 = asList(s.label).map((l) => norm(l, { size: 13 }));
				const labelH = list2.reduce((n, l) => n + l.lh, 0);
				if (a === b) {
					marks.push({ type: 'self', x: xs[a], y: y + 6, step: s, list: list2 });
					y += Math.max(labelH, 26) + 22;
				} else {
					marks.push({ type: 'msg', xa: xs[a], xb: xs[b], y: y + labelH + 6, step: s, list: list2 });
					y += labelH + 22;
				}
			}
		};
		run(steps, 0);
		const bottom = y + 6;
		participants.forEach((_, i) => { lifelines[i].setAttribute('x1', xs[i]); lifelines[i].setAttribute('x2', xs[i]); lifelines[i].setAttribute('y1', heads2[i].b); lifelines[i].setAttribute('y2', bottom); });
		const right = xs[xs.length - 1] + headW[headW.length - 1] / 2;
		for (const m of marks.filter((n) => n.type === 'group')) {
			const gx = x0 - m.inset + 16, gw = right - x0 + 2 * (m.inset - 16) + 0;
			el('rect', { x: gx, y: m.top, width: gw, height: m.bottom - m.top, rx: 4, fill: 'none', stroke: T.muted, 'stroke-width': 1.2 });
			for (const d of m.dividers) {
				if (!d.first) el('line', { x1: gx, y1: d.y, x2: gx + gw, y2: d.y, stroke: T.muted, 'stroke-width': 1, 'stroke-dasharray': '5 4' });
				const label = `${d.first ? `${m.kind} ` : 'else '}${d.title ? `[${d.title}]` : ''}`.trim();
				text(gx + 8, d.y + 17, label, { size: 13, weight: 600, color: C.muted });
			}
		}
		let n = 0;
		for (const m of marks) {
			if (m.type === 'group') continue;
			if (m.type === 'note') {
				el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, rx: 4, fill: T.warnSoft, stroke: T.warn, 'stroke-width': 1.2 });
				lines(m.x + m.w / 2, m.y + 7, m.list, { anchor: 'middle' });
			} else if (m.type === 'msg') {
				const t = m.step.type || 'call';
				const dir = Math.sign(m.xb - m.xa);
				const x1 = m.xa + dir * 0;
				const x2 = t === 'lost' ? m.xb - dir * 24 : m.xb;
				const label = opts.number ? m.list.map((l, i) => (i ? l : { ...l, t: `${++n}. ${l.t}` })) : m.list;
				el('path', { d: `M${x1},${m.y} L${x2},${m.y}`, fill: 'none', stroke: C.arrow, 'stroke-width': 1.3, 'stroke-dasharray': t === 'return' || t === 'async' ? '5 4' : undefined, 'marker-end': `url(#${uid('arrow')})` });
				if (t === 'lost') { el('line', { x1: x2 + dir * 6, y1: m.y - 6, x2: x2 + dir * 18, y2: m.y + 6, stroke: C.error, 'stroke-width': 1.6 }); el('line', { x1: x2 + dir * 6, y1: m.y + 6, x2: x2 + dir * 18, y2: m.y - 6, stroke: C.error, 'stroke-width': 1.6 }); }
				lines((m.xa + m.xb) / 2, m.y - 4 - label.reduce((s, l) => s + l.lh, 0), label, { anchor: 'middle', halo: true });
			} else {
				const label = opts.number ? m.list.map((l, i) => (i ? l : { ...l, t: `${++n}. ${l.t}` })) : m.list;
				arrow([[m.x, m.y], [m.x + 40, m.y], [m.x + 40, m.y + 22], [m.x, m.y + 22]], { dashed: m.step.type === 'return' });
				lines(m.x + 48, m.y - 4, label, { anchor: 'start', halo: true });
			}
		}
		return { xs, heads: heads2, bottom, x: (id) => xs[need(id)] };
	}

	// Layout helpers: positions from widths/heights instead of typed coordinates.
	const cols = (x0, widths, gap = 40) => widths.reduce((xs, w, i) => [...xs, i ? xs[i - 1] + widths[i - 1] + gap : x0], []);
	const rows = (y0, heights, gap = 24) => cols(y0, heights, gap);
	const below = (g, gap = 24) => g.b + gap;
	const rightOf = (g, gap = 40) => g.r + gap;
	function grid(x0, y0, cellW, cellH, gapX = 24, gapY = 24) {
		return (col, row, spanCols = 1, spanRows = 1) => ({
			x: x0 + col * (cellW + gapX), y: y0 + row * (cellH + gapY),
			w: cellW * spanCols + gapX * (spanCols - 1), h: cellH * spanRows + gapY * (spanRows - 1)
		});
	}
	// Linear scale: K.scale([0, 14], [436, 44])(9.8) → px.
	function scale([d0, d1], [r0, r1]) {
		return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
	}

	// Legend icons drawn in the SVG itself (real shapes, real text). Each draws at (x, cy) and returns its width.
	const swatch = (kind, dash) => (x, cy) => {
		const k = KIND[kind];
		el('rect', { x, y: cy - 7, width: 22, height: 14, rx: 3, fill: k.fill, stroke: k.stroke, 'stroke-width': 1.5, 'stroke-dasharray': dash });
		return 22;
	};
	const stroke = (color, dash, head) => (x, cy) => {
		el('line', { x1: x, y1: cy, x2: x + 28, y2: cy, stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': dash ? '4 3' : undefined });
		el('path', { d: `M${x + 27},${cy - 3.5} L${x + 34},${cy} L${x + 27},${cy + 3.5} Z`, fill: head ?? color });
		return 34;
	};
	const ICONS = {
		new: swatch('new'), existing: swatch('existing'), dark: swatch('dark'), errorBox: swatch('error'), tombstone: swatch('plain', '4 3'),
		store: (x, cy) => {
			el('path', { d: `M${x},${cy - 6} V${cy + 6} A11,3.5 0 0 0 ${x + 22},${cy + 6} V${cy - 6}`, fill: T.accentSoft, stroke: T.accent, 'stroke-width': 1.5 });
			el('ellipse', { cx: x + 11, cy: cy - 6, rx: 11, ry: 3.5, fill: T.accentSoft, stroke: T.accent, 'stroke-width': 1.5 });
			return 22;
		},
		queue: (x, cy) => {
			el('path', { d: `M${x + 4},${cy - 7} H${x + 28} A4,7 0 0 1 ${x + 28},${cy + 7} H${x + 4} A4,7 0 0 1 ${x + 4},${cy - 7} Z`, fill: T.accentSoft, stroke: T.accent, 'stroke-width': 1.5 });
			el('path', { d: `M${x + 28},${cy - 7} A4,7 0 0 0 ${x + 28},${cy + 7}`, fill: 'none', stroke: T.accent, 'stroke-width': 1.5 });
			return 34;
		},
		async: stroke(C.arrow, true),
		error: stroke(C.error),
		uses: stroke(C.arrow),
		decision: (x, cy) => { el('path', { d: `M${x + 11},${cy - 8} L${x + 21},${cy} L${x + 11},${cy + 8} L${x + 1},${cy} Z`, fill: T.paper, stroke: T.accent, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }); return 22; },
		milestone: (x, cy) => { el('path', { d: `M${x + 9},${cy - 8} L${x + 17},${cy} L${x + 9},${cy + 8} L${x + 1},${cy} Z`, fill: T.ink }); return 18; },
		dup: (x, cy) => { dupGlyph(x + 8, cy); return 22; },
		realize: (x, cy) => {
			el('line', { x1: x, y1: cy, x2: x + 22, y2: cy, stroke: C.arrow, 'stroke-width': 1.4, 'stroke-dasharray': '4 3' });
			el('path', { d: `M${x + 22},${cy - 5.5} L${x + 33},${cy} L${x + 22},${cy + 5.5} Z`, fill: T.paper, stroke: C.arrow, 'stroke-width': 1.3 });
			return 34;
		},
		relation: (x, cy) => {
			el('line', { x1: x, y1: cy, x2: x + 38, y2: cy, stroke: C.arrow, 'stroke-width': 1.3, 'stroke-dasharray': '5 4' });
			for (const dy of [-6, 0, 6]) el('line', { x1: x + 12, y1: cy, x2: x, y2: cy + dy, stroke: C.arrow, 'stroke-width': 1.3 });
			el('line', { x1: x + 32, y1: cy - 7, x2: x + 32, y2: cy + 7, stroke: C.arrow, 'stroke-width': 1.4 });
			return 40;
		},
		pk: (x, cy) => { text(x, cy + 4.5, 'PK', { size: 13, weight: 700, color: C.accent, spacing: '0.04em' }); return 24; }
	};
	const LEGEND = {
		new: 'New component', existing: 'Existing system', store: 'Data store', queue: 'Queue', async: 'Asynchronous',
		error: 'Failure or drop', dark: 'Highlighted block', errorBox: 'Error', decision: 'Decision', milestone: 'Milestone',
		dup: 'Duplicate event: same state, no effect', tombstone: 'Tombstone', uses: 'uses', realize: 'implements',
		relation: 'many-to-one logical relation, no physical foreign key', pk: 'primary key'
	};

	// entries: 'new' | ['existing', 'Custom label'] | { draw(x, cy) -> width, label }. Placed under the drawing so far.
	function legend(entries, opts = {}) {
		const bb = root.getBBox();
		const x0 = opts.x ?? bb.x;
		const maxX = x0 + (opts.width ?? Math.max(bb.width, 520));
		let y = (opts.y ?? bb.y + bb.height + 32) + 12;
		el('line', { x1: x0, y1: y - 22, x2: maxX, y2: y - 22, stroke: T.line, 'stroke-width': 1 });
		let x = x0;
		for (const e of entries) {
			let drawIcon, label;
			if (e && typeof e === 'object' && !Array.isArray(e)) ({ draw: drawIcon, label } = e);
			else {
				const [key, custom] = Array.isArray(e) ? e : [e];
				if (!ICONS[key]) throw new Error(`unknown legend key "${key}": use ${Object.keys(ICONS).join(', ')}`);
				drawIcon = ICONS[key];
				label = custom || LEGEND[key];
			}
			const labelW = measure(label, { size: 13 });
			if (x > x0 && x + 42 + labelW > maxX) { x = x0; y += 26; }
			const w = drawIcon(x, y);
			text(x + w + 8, y + 4.5, label, { size: 13, color: C.text });
			x += w + 8 + labelW + 24;
		}
		return y;
	}

	// Source or method note under the drawing, one line per string, muted.
	function footer(textLines, opts = {}) {
		const bb = root.getBBox();
		const list = (Array.isArray(textLines) ? textLines : [textLines]).map((t) => ({ t, size: 13, color: C.muted }));
		return lines(opts.x ?? bb.x, bb.y + bb.height + 12, list, { anchor: 'start' });
	}

	window.K = {
		C, T, KIND, ICONS, LEGEND, MIN_TEXT_PX,
		svg, draw, finish, el, text, lines, measure, box, diamond, cyl, queue, zone, arrow, link, labelSegment, selfLoop,
		card, table, relation, start, end, dupGlyph, sequence, cols, rows, below, rightOf, grid, scale, legend, footer
	};
})();
