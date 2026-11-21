#!/usr/bin/env node
// Prints the diagnostics in <after.txt> that <before.txt> does not have, so a repo's old lint or type debt
// does not hide what a change adds. Compares by file + rule + message and ignores line and column numbers.
// Handles tsc, `eslint -f unix` and `eslint -f stylish` output; any other line is compared as it is.
//   node new-diagnostics.mjs <before.txt> <after.txt> [--before-root=<dir>] [--after-root=<dir>]
// Exit 0: nothing new. Exit 1: new diagnostics (printed). Roots are stripped from paths when the two
// runs happened in different directories (a worktree of HEAD and the working tree).
import fs from 'node:fs';

// A root can be spelled two ways in the output (macOS: /var/... given, /private/var/... printed by eslint).
const rootSpellings = (root) => {
	if (!root) return [];
	const spellings = [root.replace(/\/$/, '')];
	try { spellings.push(fs.realpathSync(root)); } catch { /* the root may not exist any more */ }
	return [...new Set(spellings)];
};

const keyed = (text, root) => {
	const out = [];
	let file = '';
	const roots = rootSpellings(root);
	const lines = text.split('\n').map((l) => {
		for (const r of roots) l = l.split(`${r}/`).join('');
		return l.replace(/\s+$/, '');
	});
	for (const [i, line] of lines.entries()) {
		const stylish = line.match(/^\s+\d+:\d+\s+(.*)$/);
		if (stylish) { out.push(`${file}: ${stylish[1].replace(/\s+/g, ' ')}`); continue; }
		// stylish file header: an unindented line whose next non-blank line is an indented "n:n" diagnostic (paths may hold spaces)
		if (/^\S/.test(line) && /^\s+\d+:\d+\s/.test(lines.slice(i + 1).find((l) => l.trim()) ?? '')) { file = line; continue; }
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
	const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
	const [beforeFile, afterFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
	if (!beforeFile || !afterFile) { console.error('usage: new-diagnostics.mjs <before.txt> <after.txt> [--before-root=<dir>] [--after-root=<dir>]'); process.exit(2); }
	const fresh = newDiagnostics(fs.readFileSync(beforeFile, 'utf8'), fs.readFileSync(afterFile, 'utf8'), { before: flag('before-root'), after: flag('after-root') });
	if (fresh.length) console.log(fresh.join('\n'));
	console.error(`${fresh.length} new diagnostic(s)`);
	process.exit(fresh.length ? 1 : 0);
}
