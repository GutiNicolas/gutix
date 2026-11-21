#!/usr/bin/env node
// Static checks for the plugin. Node built-ins only.
//   node scripts/validate.mjs [pluginRoot]
// Exits 1 and prints every problem. Env: GUTIX_PRIVATE_NAMES = path to the private-names list
// (default $HOME/.config/gutix/private-names.txt). The list lives outside the repo on purpose and is
// never printed: a match is reported as file:line only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git']);
// Built so this file doesn't contain the literal paths it forbids.
const PERSONAL_PATH = new RegExp(`/(?:Users|home)/[A-Za-z0-9._-]+`);
const IDE_TOOL_NAMES = ['AskQuestion', 'required_permissions', 'block_until_ms', 'GetDynamicTools', 'generalPurpose'];
const CLAUDE_TOOL_NAMES = ['AskUserQuestion', 'subagent_type'];

export function parseFrontmatter(text) {
	if (!text.startsWith('---\n')) return null;
	const end = text.indexOf('\n---', 4);
	if (end === -1) return null;
	const fields = {};
	const lines = text.slice(4, end).split('\n');
	for (let i = 0; i < lines.length; i++) {
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
		if (!match) continue;
		let value = match[2].trim();
		if (/^[>|][+-]?$/.test(value)) {
			const block = [];
			while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
			value = block.join(' ');
		}
		fields[match[1]] = value.replace(/^["']|["']$/g, '');
	}
	return { fields, body: text.slice(end + 4) };
}

export function extractLinks(markdown) {
	const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
	return [...withoutCode.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
}

function isLocalLink(target) {
	return !/^([a-z][a-z0-9+.-]*:|#)/i.test(target) && !/[<>{}]/.test(target);
}

function walk(dir) {
	if (!fs.existsSync(dir)) return [];
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...walk(full));
		else files.push(full);
	}
	return files;
}

// Every file that belongs to the repo: tracked, plus untracked that git does not ignore. A walk would also reach
// git-excluded folders (local plans, .claude/worktrees). Outside git (temp plugins in tests) it falls back to a walk.
function repoFiles(root) {
	const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) return walk(root);
	return r.stdout.split('\0').filter((f) => f && !f.endsWith('/')).map((f) => path.join(root, f)).filter((f) => {
		try { return fs.statSync(f).isFile(); } catch { return false; }
	});
}

function readText(file) {
	const buffer = fs.readFileSync(file);
	return buffer.includes(0) ? null : buffer.toString('utf8');
}

export function privateNamesPath(env = process.env) {
	return env.GUTIX_PRIVATE_NAMES || path.join(env.HOME || os.homedir(), '.config/gutix/private-names.txt');
}

export function loadPrivateNames(file) {
	if (!fs.existsSync(file)) return null;
	return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean);
}

function countOccurrences(text, needle) {
	return text.split(needle).length - 1;
}

/** Returns { problems, notices, claudeToolNames } */
export function validate(root, { privateNames = undefined } = {}) {
	const problems = [];
	const notices = [];
	const rel = (f) => path.relative(root, f);
	const names = privateNames === undefined ? loadPrivateNames(privateNamesPath()) : privateNames;

	const skillsDir = path.join(root, 'skills');
	const readme = path.join(root, 'README.md');
	const skillNames = fs.existsSync(skillsDir)
		? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
		: [];
	if (skillNames.length === 0) problems.push('skills/: no skills found');

	// Frontmatter
	for (const name of skillNames) {
		const file = path.join(skillsDir, name, 'SKILL.md');
		if (!fs.existsSync(file)) {
			problems.push(`skills/${name}: missing SKILL.md`);
			continue;
		}
		const parsed = parseFrontmatter(fs.readFileSync(file, 'utf8'));
		if (!parsed) {
			problems.push(`${rel(file)}: missing or unterminated frontmatter`);
			continue;
		}
		if (!parsed.fields.name) problems.push(`${rel(file)}: frontmatter needs name`);
		else if (parsed.fields.name !== name) problems.push(`${rel(file)}: name "${parsed.fields.name}" must match folder "${name}"`);
		if (!parsed.fields.description) problems.push(`${rel(file)}: frontmatter needs description`);
	}

	// README lists every skill
	if (!fs.existsSync(readme)) problems.push('README.md: missing');
	else {
		const text = fs.readFileSync(readme, 'utf8');
		for (const name of skillNames) {
			if (!new RegExp(`^\\|\\s*\`(?:[a-z0-9-]+:)?${name}\``, 'm').test(text)) problems.push(`README.md: skill table does not list ${name}`);
		}
	}

	// Personal paths
	for (const dir of ['skills', 'scripts', 'cursor']) {
		for (const file of walk(path.join(root, dir))) {
			const text = readText(file);
			if (text === null) continue;
			text.split('\n').forEach((line, i) => {
				if (PERSONAL_PATH.test(line)) problems.push(`${rel(file)}:${i + 1}: personal path (use $HOME or a placeholder)`);
			});
		}
	}

	// Docs published with the plugin: skills/ and the README
	const docFiles = [...walk(skillsDir), ...(fs.existsSync(readme) ? [readme] : [])];
	const claudeToolNames = Object.fromEntries(CLAUDE_TOOL_NAMES.map((n) => [n, 0]));
	for (const file of docFiles) {
		const text = readText(file);
		if (text === null) continue;
		const lines = text.split('\n');
		for (const tool of IDE_TOOL_NAMES) {
			lines.forEach((line, i) => {
				if (line.includes(tool)) problems.push(`${rel(file)}:${i + 1}: IDE tool name ${tool}`);
			});
		}
		for (const tool of CLAUDE_TOOL_NAMES) claudeToolNames[tool] += countOccurrences(text, tool);
		// Templates link to files that exist only once copied into a feature folder.
		if (file.endsWith('.md') && !file.split(path.sep).includes('templates')) {
			for (const link of extractLinks(text)) {
				if (!isLocalLink(link)) continue;
				const target = path.resolve(path.dirname(file), link.split('#')[0]);
				if (!fs.existsSync(target)) problems.push(`${rel(file)}: broken link ${link}`);
			}
		}
	}
	// Private names: every file of the repo (help text, cursor/, CHANGELOG, plugin.json, workflows, tests...).
	if (names && names.length) {
		for (const file of repoFiles(root)) {
			const text = readText(file);
			if (text === null) continue;
			text.toLowerCase().split('\n').forEach((line, i) => {
				if (names.some((n) => line.includes(n))) problems.push(`${rel(file)}:${i + 1}: matches the private-names list`);
			});
		}
	}
	if (!names) notices.push('private-names list not found: skipped that check (set GUTIX_PRIVATE_NAMES to run it)');

	return { problems, notices, claudeToolNames };
}

// realpath on both sides: Node resolves symlinks in import.meta.url but not in argv[1] (macOS /tmp, linked checkouts).
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
	const { problems, notices, claudeToolNames } = validate(root);
	for (const notice of notices) console.log(`validate: ${notice}`);
	const total = Object.values(claudeToolNames).reduce((a, b) => a + b, 0);
	console.log(`validate: Claude Code tool names in skills/ and README: ${total} (${Object.entries(claudeToolNames).map(([k, v]) => `${k} ${v}`).join(', ')})`);
	if (problems.length > 0) {
		console.error(problems.map((p) => `- ${p}`).join('\n'));
		process.exit(1);
	}
	console.log('validate: ok');
}
