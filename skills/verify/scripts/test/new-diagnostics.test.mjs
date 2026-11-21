import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newDiagnostics } from '../new-diagnostics.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'new-diagnostics.mjs');

test('a tsc diagnostic whose line moved is not new; a different one is', () => {
	const before = "src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\n";
	const after = "src/a.ts(14,9): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/a.ts(30,1): error TS2304: Cannot find name 'x'.\n";
	assert.equal(newDiagnostics(before, after).length, 1);
	assert.match(newDiagnostics(before, after)[0], /TS2304/);
});

test('the same message in another file is new', () => {
	const before = 'src/a.ts:3:1: error no-unused-vars\n';
	assert.equal(newDiagnostics(before, 'src/b.ts:3:1: error no-unused-vars\n').length, 1);
});

test('a second copy of an old diagnostic in the same file is new', () => {
	const d = 'src/a.ts:3:1: error no-unused-vars\n';
	assert.equal(newDiagnostics(d, d + 'src/a.ts:20:1: error no-unused-vars\n').length, 1);
});

test('eslint stylish output is compared per file, ignoring lines', () => {
	const before = '/r/src/a.js\n  4:7  error  x is unused  no-unused-vars\n\n✖ 1 problem\n';
	const after = '/r/src/a.js\n  9:7  error  x is unused  no-unused-vars\n  12:1  warning  Unexpected console  no-console\n\n✖ 2 problems\n';
	const fresh = newDiagnostics(before, after);
	assert.equal(fresh.length, 1);
	assert.match(fresh[0], /no-console/);
});

test('roots are stripped so a worktree of HEAD and the working tree compare equal', () => {
	const before = '/tmp/wt/src/a.ts:3:1: error e\n';
	const after = '/work/src/a.ts:8:1: error e\n';
	assert.equal(newDiagnostics(before, after).length, 1);
	assert.equal(newDiagnostics(before, after, { before: '/tmp/wt', after: '/work' }).length, 0);
});

test('the CLI exits 1 and prints only the new diagnostics', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-'));
	fs.writeFileSync(path.join(dir, 'b.txt'), 'a.ts(1,1): error TS1: old\n');
	fs.writeFileSync(path.join(dir, 'a.txt'), 'a.ts(5,1): error TS1: old\na.ts(6,1): error TS2: new\n');
	const r = spawnSync('node', [script, path.join(dir, 'b.txt'), path.join(dir, 'a.txt')], { encoding: 'utf8' });
	assert.equal(r.status, 1);
	assert.match(r.stdout, /TS2: new/);
	assert.doesNotMatch(r.stdout, /old/);
	const clean = spawnSync('node', [script, path.join(dir, 'b.txt'), path.join(dir, 'b.txt')], { encoding: 'utf8' });
	assert.equal(clean.status, 0);
});

test('a root given as a symlink also strips the real path eslint prints (macOS /var vs /private/var)', () => {
	const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nd-real-')));
	const link = `${real}-link`;
	fs.symlinkSync(real, link);
	const before = `${real}/src/a.ts:3:1: error e\n`;
	const after = `${link}/src/a.ts:8:1: error e\n`;
	assert.equal(newDiagnostics(before, after, { before: link, after: link }).length, 0);
});

test('a root containing "=" is kept whole by the CLI flag parser', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-eq-'));
	fs.writeFileSync(path.join(dir, 'b.txt'), '/r/a=b/src/a.ts:3:1: error e\n');
	fs.writeFileSync(path.join(dir, 'a.txt'), '/w/src/a.ts:9:1: error e\n');
	const r = spawnSync('node', [script, path.join(dir, 'b.txt'), path.join(dir, 'a.txt'), '--before-root=/r/a=b', '--after-root=/w'], { encoding: 'utf8' });
	assert.equal(r.status, 0, r.stdout);
});

test('stylish file headers with a space in the path keep their diagnostics per file', () => {
	const before = '/r/my app/a.js\n  4:7  error  x is unused  no-unused-vars\n';
	const after = '/r/my app/a.js\n  4:7  error  x is unused  no-unused-vars\n\n/r/my app/b.js\n  2:1  error  x is unused  no-unused-vars\n';
	const fresh = newDiagnostics(before, after);
	assert.equal(fresh.length, 1);
	assert.match(fresh[0], /b\.js/);
});
