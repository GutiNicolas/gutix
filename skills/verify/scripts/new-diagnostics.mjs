#!/usr/bin/env node
// Prints the diagnostics in <after.txt> that <before.txt> does not have, so a repo's old lint or type debt
// does not hide what a change adds. Compares by file + rule + message and ignores line and column numbers.
// Handles tsc, `eslint -f unix` and `eslint -f stylish` output; any other line is compared as it is.
//   node new-diagnostics.mjs <before.txt> <after.txt> [--before-root=<dir>] [--after-root=<dir>]
// Exit 0: nothing new. Exit 1: new diagnostics (printed). Roots are stripped from paths when the two
// runs happened in different directories (a worktree of HEAD and the working tree).
import fs from 'node:fs';

const keyed = (text, root) => {
	const out = [];
	let file = '';
	for (let line of text.split('\n')) {
		if (root) line = line.split(`${root.replace(/\/$/, '')}/`).join('');
		line = line.replace(/\s+$/, '');
		const stylish = line.match(/^\s+\d+:\d+\s+(.*)$/);
		if (stylish) { out.push(`${file}: ${stylish[1].replace(/\s+/g, ' ')}`); continue; }
		if (/^[^\s].*\.[a-z]+$/i.test(line) && !/\s/.test(line)) { file = line; continue; } // stylish file header
		if (/^\s|^$|^\S? ?\d+ problems?/.test(line) || /^Found \d+ errors?/.test(line)) continue; // blanks, summaries, continuations
		out.push(line.replace(/[(:]\d+[,:]\d+\)?/, '').replace(/\s+/g, ' '));
	}
	return out;
};

export function newDiagnostics(before, after, roots = {}) {
	const seen = new Map();
	for (const k of keyed(before, roots.before)) seen.set(k, (seen.get(k) ?? 0) + 1);
	return keyed(after, roots.after).filter((k) => {
		const n = seen.get(k) ?? 0;
		if (n > 0) { seen.set(k, n - 1); return false; } // each old diagnostic cancels one new one, so a second copy is new
		return true;
	});
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
	const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
	const [beforeFile, afterFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
	if (!beforeFile || !afterFile) { console.error('usage: new-diagnostics.mjs <before.txt> <after.txt> [--before-root=<dir>] [--after-root=<dir>]'); process.exit(2); }
	const fresh = newDiagnostics(fs.readFileSync(beforeFile, 'utf8'), fs.readFileSync(afterFile, 'utf8'), { before: flag('before-root'), after: flag('after-root') });
	if (fresh.length) console.log(fresh.join('\n'));
	console.error(`${fresh.length} new diagnostic(s)`);
	process.exit(fresh.length ? 1 : 0);
}
