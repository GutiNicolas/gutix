import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
