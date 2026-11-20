#!/usr/bin/env node
// Pastes each diagram into the doc: every <!-- svg Dxx --> marker in <doc>.html becomes the content of
// <doc>-figs/Dxx.svg, so nobody re-types an SVG by hand. No dependencies.
//   node inline-figures.mjs <doc.html> [<figs-dir>]
// Exits 1 when a marker has no file or a file's <svg> has no <title>.
import fs from 'node:fs';
import path from 'node:path';

const [docPath, figsArg] = process.argv.slice(2);
if (!docPath) {
	console.error('usage: node inline-figures.mjs <doc.html> [<figs-dir>]');
	process.exit(2);
}
const figsDir = figsArg ?? docPath.replace(/\.html?$/i, '') + '-figs';
const problems = [];
let inlined = 0;
const html = fs.readFileSync(docPath, 'utf8').replace(/<!--\s*svg\s+(D\d+)\s*-->/g, (marker, id) => {
	const file = path.join(figsDir, `${id}.svg`);
	if (!fs.existsSync(file)) {
		problems.push(`${id}: ${file} not found`);
		return marker;
	}
	const svg = fs.readFileSync(file, 'utf8').replace(/^﻿?\s*<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/i, '').trim();
	if (!/<svg[\s>][\s\S]*?<title>\s*\S[\s\S]*?<\/title>/.test(svg)) problems.push(`${id}: the <svg> needs a <title> saying what it shows`);
	inlined++;
	return svg;
});
fs.writeFileSync(docPath, html);
console.log(`inlined ${inlined} figure(s) into ${docPath}`);
if (problems.length) {
	console.log(problems.join('\n'));
	process.exit(1);
}
