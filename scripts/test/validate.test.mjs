import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from '../validate.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'validate.mjs');

/** A minimal valid plugin in a temp dir; `files` adds or overrides paths. */
function plugin(files = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-validate-'));
	const all = {
		'README.md': '# p\n\n| Skill | What |\n| --- | --- |\n| `p:alpha` | does alpha |\n',
		'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: Does alpha.\n---\n# Alpha\n',
		...files
	};
	for (const [file, text] of Object.entries(all)) {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), text);
	}
	return root;
}

const run = (files, privateNames = null) => validate(plugin(files), { privateNames });

test('a valid plugin passes and notes the skipped denylist', () => {
	const { problems, notices } = run();
	assert.deepEqual(problems, []);
	assert.match(notices.join('\n'), /private-names list not found/);
});

test('a private name in a skill fails, case-insensitively, without printing the name', () => {
	const { problems } = run({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: Works for AcMe teams.\n---\n' }, ['acme']);
	assert.equal(problems.length, 1);
	assert.match(problems[0], /skills\/alpha\/SKILL\.md:3: matches the private-names list/);
	assert.doesNotMatch(problems[0], /acme/i);
});

test('a private name in the README fails; blank lines in the list match nothing', () => {
	const files = { 'README.md': '| `alpha` | for Acme |\n' };
	assert.equal(run(files, ['acme']).problems.length, 1);
	assert.deepEqual(run(files, []).problems, []);
});

test('CLI: denylist match exits non-zero, missing list skips and exits zero', () => {
	const root = plugin({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: acme\n---\n' });
	const list = path.join(root, '..', `names-${path.basename(root)}.txt`);
	fs.writeFileSync(list, 'acme\n');
	const hit = spawnSync('node', [script, root], { env: { ...process.env, GUTIX_PRIVATE_NAMES: list }, encoding: 'utf8' });
	assert.equal(hit.status, 1);
	assert.doesNotMatch(hit.stdout + hit.stderr, /acme/i);
	const skipped = spawnSync('node', [script, root], { env: { ...process.env, GUTIX_PRIVATE_NAMES: path.join(root, 'nope.txt') }, encoding: 'utf8' });
	assert.equal(skipped.status, 0);
	assert.match(skipped.stdout, /skipped/);
});

test('CLI: run through a symlinked path (macOS /tmp, a linked checkout) it still checks and fails', () => {
	const root = plugin({ 'skills/alpha/SKILL.md': '---\nname: wrong\ndescription: d\n---\n' });
	const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-link-')), 'scripts');
	fs.symlinkSync(path.dirname(script), link);
	const res = spawnSync('node', [path.join(link, 'validate.mjs'), root], { encoding: 'utf8' });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /must match folder/);
});

test('personal paths fail in skills/, scripts/ and cursor/', () => {
	const home = ['', 'Users', 'someone', 'x'].join('/');
	const linux = ['', 'home', 'someone', 'x'].join('/');
	for (const dir of ['skills/alpha/a.md', 'scripts/a.mjs', 'cursor/a.md']) {
		const { problems } = run({ [dir]: `see ${home}\n` });
		assert.match(problems.join('\n'), /personal path/, dir);
	}
	assert.match(run({ 'skills/alpha/a.md': `see ${linux}\n` }).problems.join('\n'), /personal path/);
	assert.deepEqual(run({ 'skills/alpha/a.md': 'see $HOME/x and /home/<name>\n' }).problems, []);
});

test('frontmatter: name must match the folder, description is required, SKILL.md must exist', () => {
	const bad = run({
		'skills/alpha/SKILL.md': '---\nname: other\ndescription: ok\n---\n',
		'skills/beta/SKILL.md': '---\nname: beta\n---\n',
		'skills/gamma/notes.md': 'x',
		'README.md': '| `alpha` | a |\n| `beta` | b |\n| `gamma` | c |\n'
	}).problems.join('\n');
	assert.match(bad, /name "other" must match folder "alpha"/);
	assert.match(bad, /beta\/SKILL\.md: frontmatter needs description/);
	assert.match(bad, /skills\/gamma: missing SKILL\.md/);
});

test('folded YAML descriptions count as present', () => {
	assert.deepEqual(run({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: >\n  Does alpha\n  twice.\n---\n' }).problems, []);
});

test('README must list every skill', () => {
	const { problems } = run({ 'skills/beta/SKILL.md': '---\nname: beta\ndescription: b\n---\n' });
	assert.deepEqual(problems, ['README.md: skill table does not list beta']);
});

test('relative links must resolve; URLs, anchors, placeholders and template files are ignored', () => {
	const { problems } = run({
		'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: a\n---\n[ok](ref.md) [gone](missing.md) [web](https://x.test/a) [top](#t) [ph](<path>)\n',
		'skills/alpha/ref.md': 'x',
		'skills/alpha/templates/t.md': '[later](tasks/T-01.md)\n'
	});
	assert.deepEqual(problems, ['skills/alpha/SKILL.md: broken link missing.md']);
});

test('IDE tool names fail in skills/ and the README; Claude Code tool names are only counted', () => {
	const { problems, claudeToolNames } = run({
		'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: a\n---\nUse AskQuestion. Use AskUserQuestion twice: AskUserQuestion, subagent_type.\n',
		'README.md': '| `alpha` | uses block_until_ms |\n'
	});
	assert.equal(problems.length, 2);
	assert.match(problems.join('\n'), /SKILL\.md:5: IDE tool name AskQuestion/);
	assert.match(problems.join('\n'), /README\.md:1: IDE tool name block_until_ms/);
	assert.deepEqual(claudeToolNames, { AskUserQuestion: 2, subagent_type: 1 });
});

test('private names are scanned in scripts/, cursor/, CHANGELOG, plugin.json and .github, not only skills/ and the README', () => {
	for (const file of ['scripts/a.mjs', 'cursor/overrides/alpha.md', 'CHANGELOG.md', '.claude-plugin/plugin.json', '.github/workflows/v.yml', 'scripts/test/t.mjs']) {
		const { problems } = run({ [file]: 'one\nfor ACME only\n' }, ['acme']);
		assert.deepEqual(problems, [`${file}: matches the private-names list`.replace(file, `${file}:2`)], file);
	}
});

test('private names: untracked-and-ignored and git-excluded files pass, tracked and untracked-not-ignored files fail, binaries are skipped', () => {
	const root = plugin({ '.gitignore': 'ignored.md\n', 'tracked.md': 'x\n' });
	execFileSync('git', ['init', '-q', root]);
	execFileSync('git', ['-C', root, 'add', '-A']);
	fs.mkdirSync(path.join(root, 'plans'));
	fs.appendFileSync(path.join(root, '.git/info/exclude'), 'plans/\n');
	fs.writeFileSync(path.join(root, 'plans/p.md'), 'acme\n');
	fs.writeFileSync(path.join(root, 'ignored.md'), 'acme\n');
	assert.deepEqual(validate(root, { privateNames: ['acme'] }).problems, []);

	fs.writeFileSync(path.join(root, 'tracked.md'), 'acme\n');
	fs.writeFileSync(path.join(root, 'new.md'), 'acme\n');
	fs.writeFileSync(path.join(root, 'image.bin'), Buffer.from([0, 97, 99, 109, 101]));
	const { problems } = validate(root, { privateNames: ['acme'] });
	assert.deepEqual(problems.sort(), ['new.md:1: matches the private-names list', 'tracked.md:1: matches the private-names list']);
});

test('private names: a tracked file deleted from disk does not crash the scan', () => {
	const root = plugin({ 'gone.md': 'x\n' });
	execFileSync('git', ['init', '-q', root]);
	execFileSync('git', ['-C', root, 'add', '-A']);
	fs.rmSync(path.join(root, 'gone.md'));
	assert.deepEqual(validate(root, { privateNames: ['acme'] }).problems, []);
});

test('the IDE tool-name check stays on skills/ and the README: cursor/overrides may name Cursor tools', () => {
	assert.deepEqual(run({ 'cursor/overrides/alpha.md': 'Use AskQuestion and block_until_ms.\n' }).problems, []);
});
