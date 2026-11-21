// install-cursor: black-box tests through the CLI, always against a temporary HOME.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'scripts/gutix.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-ic-'));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const read = (file) => fs.readFileSync(file, 'utf8');
const run = (home, args) => spawnSync('node', [cli, 'install-cursor', ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? [p, ...walk(p)] : [p];
  });
}
function treeHash(dir) {
  const h = crypto.createHash('sha256');
  for (const p of walk(dir).sort()) {
    h.update(path.relative(dir, p));
    if (fs.statSync(p).isFile()) h.update(fs.readFileSync(p));
  }
  return h.digest('hex');
}

// A small plugin that is not gutix: two skills that link to each other, a Claude-only one, an agent.
function fixturePlugin({ version = '1.2.3' } = {}) {
  const dir = tmp();
  write(path.join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'acme', version, description: 'Acme skills' }));
  write(path.join(dir, 'skills/alpha/SKILL.md'), [
    '---', 'name: alpha', 'description: "Alpha skill"', 'user-invocable: true', 'args:', '  - name: topic',
    '    description: What', '    required: false', '---', '', '# Alpha',
    'See [beta](../beta/SKILL.md) and run `node ../beta/scripts/x.mjs`; deeper: `../../beta/scripts/x.mjs`.',
    'Not a sibling: ../elsewhere/x.md and docs/beta/y.md', '',
    'Refs: use acme:beta, or /acme:beta, or `acme:beta`; but not acme:betas, xacme:beta, a.acme:beta or acme:unknown.',
    'Skipped in Cursor: acme:ship stays as written.', '',
  ].join('\n'));
  write(path.join(dir, 'skills/alpha/scripts/use.mjs'), "import { x } from '../../beta/scripts/x.mjs';\nexport default x;\n");
  write(path.join(dir, 'skills/beta/SKILL.md'), '---\nname: beta\ndescription: Beta skill\n---\n\n# Beta\n');
  write(path.join(dir, 'skills/beta/scripts/x.mjs'), 'export const x = 1;\n');
  write(path.join(dir, 'skills/ship/SKILL.md'), '---\nname: ship\ndescription: Claude only\nuser-invocable: true\n---\n\n# Ship\n');
  write(path.join(dir, 'agents/helper.md'), '---\nname: helper\n---\nhi\n');
  return dir;
}
const targetOf = (home, plugin = 'acme') => path.join(home, '.cursor/plugins/local', plugin);

test('another plugin and prefix: names, rewritten links, frontmatter, version, real files', () => {
  const plugin = fixturePlugin();
  const home = tmp();
  const r = run(home, [plugin, '--prefix', 'acme-']);
  assert.equal(r.status, 0, r.stderr);
  const t = targetOf(home);

  assert.deepEqual(fs.readdirSync(path.join(t, 'skills')).sort(), ['acme-alpha', 'acme-beta']); // ship is Claude-only
  for (const s of ['alpha', 'beta']) {
    assert.match(read(path.join(t, 'skills', `acme-${s}`, 'SKILL.md')), new RegExp(`^---\\nname: acme-${s}\\n`));
  }

  const alpha = read(path.join(t, 'skills/acme-alpha/SKILL.md'));
  assert.ok(!/^(args|user-invocable):/m.test(alpha) && !alpha.includes('required: false'));
  // everything else is the source, byte for byte, apart from the sibling links
  const source = read(path.join(plugin, 'skills/alpha/SKILL.md')).split('\n');
  const body = source.slice(source.indexOf('---', 1));
  assert.equal(alpha.split('\n').slice(-body.length).join('\n').replaceAll('../acme-beta/', '../beta/').replaceAll('../../acme-beta/', '../../beta/').replace('use acme-beta, or /acme-beta, or `acme-beta`;', 'use acme:beta, or /acme:beta, or `acme:beta`;'), body.join('\n'));
  assert.ok(alpha.includes('(../acme-beta/SKILL.md)') && alpha.includes('node ../acme-beta/scripts/x.mjs') && alpha.includes('`../../acme-beta/scripts/x.mjs`'));
  assert.ok(alpha.includes('use acme-beta, or /acme-beta, or `acme-beta`;'), 'plugin:skill mentions become the Cursor skill name');
  assert.ok(alpha.includes('not acme:betas, xacme:beta, a.acme:beta or acme:unknown.') && alpha.includes('acme:ship stays as written'), 'other tokens and skipped skills stay');
  assert.ok(alpha.includes('../elsewhere/x.md') && alpha.includes('docs/beta/y.md'), 'only sibling skills are rewritten');
  assert.match(read(path.join(t, 'skills/acme-alpha/scripts/use.mjs')), /'\.\.\/\.\.\/acme-beta\/scripts\/x\.mjs'/);

  assert.equal(JSON.parse(read(path.join(t, '.cursor-plugin/plugin.json'))).version, '1.2.3');
  assert.ok(exists(path.join(t, 'agents/helper.md')));
  assert.equal(walk(t).filter((p) => fs.lstatSync(p).isSymbolicLink()).length, 0);
});
const exists = fs.existsSync;

test('a Claude-only skill is skipped, and included once the plugin ships an override for it', () => {
  const plugin = fixturePlugin();
  const home = tmp();
  run(home, [plugin, '--prefix', 'acme-']);
  assert.ok(!exists(path.join(targetOf(home), 'skills/acme-ship')));

  write(path.join(plugin, 'cursor/overrides/ship.md'), '## In Cursor\nUse Task.\n');
  assert.equal(run(home, [plugin, '--prefix', 'acme-']).status, 0);
  const ship = read(path.join(targetOf(home), 'skills/acme-ship/SKILL.md'));
  assert.match(ship, /^---\nname: acme-ship\n/);
  assert.ok(ship.endsWith('# Ship\n\n## In Cursor\nUse Task.\n'));
});

test('a second run gives the same tree; a skill removed upstream disappears from the copy', () => {
  const plugin = fixturePlugin();
  const home = tmp();
  run(home, [plugin, '--prefix', 'acme-']);
  const first = treeHash(targetOf(home));
  assert.equal(run(home, [plugin, '--prefix', 'acme-']).status, 0);
  assert.equal(treeHash(targetOf(home)), first);

  fs.rmSync(path.join(plugin, 'skills/beta'), { recursive: true });
  fs.rmSync(path.join(plugin, 'agents'), { recursive: true });
  write(path.join(targetOf(home), 'skills/mine/SKILL.md'), 'not generated by us\n');
  run(home, [plugin, '--prefix', 'acme-']);
  assert.deepEqual(fs.readdirSync(path.join(targetOf(home), 'skills')).sort(), ['acme-alpha', 'mine']);
  assert.ok(!exists(path.join(targetOf(home), 'agents/helper.md')));
});

test('a git checkout at the target is refused, and backed up and replaced with --replace-port', () => {
  const plugin = fixturePlugin();
  const home = tmp();
  const t = targetOf(home);
  fs.mkdirSync(t, { recursive: true });
  execFileSync('git', ['init', '-q', t]);
  write(path.join(t, 'old.txt'), 'hand port');

  const refused = run(home, [plugin, '--prefix', 'acme-']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--replace-port/);
  assert.ok(exists(path.join(t, 'old.txt')) && !exists(path.join(t, 'skills')));

  assert.equal(run(home, [plugin, '--prefix', 'acme-', '--replace-port']).status, 0);
  assert.ok(!exists(path.join(t, 'old.txt')) && !exists(path.join(t, '.git')) && exists(path.join(t, 'skills/acme-alpha')));
  const backups = fs.readdirSync(path.join(home, '.cache/gutix/cursor-backups'));
  assert.equal(backups.length, 1);
  assert.equal(read(path.join(home, '.cache/gutix/cursor-backups', backups[0], 'old.txt')), 'hand port');
});

test('a same-named skill elsewhere, or in a passed project, warns and still exits 0', () => {
  const plugin = fixturePlugin();
  const home = tmp();
  const project = tmp();
  write(path.join(home, '.cursor/skills/acme-alpha/SKILL.md'), 'x');
  write(path.join(project, '.cursor/skills/acme-beta/SKILL.md'), 'x');
  const r = run(home, [plugin, '--prefix', 'acme-', '--project', project]);
  assert.equal(r.status, 0);
  assert.ok(r.stderr.includes(path.join(home, '.cursor/skills/acme-alpha')) && r.stderr.includes(path.join(project, '.cursor/skills/acme-beta')), r.stderr);
  assert.ok(exists(path.join(targetOf(home), 'skills/acme-alpha')));
});

test('without --prefix, or for a folder that is not a plugin, it fails and writes nothing', () => {
  const home = tmp();
  assert.equal(run(home, [fixturePlugin()]).status, 2);
  assert.equal(run(home, [tmp(), '--prefix', 'acme-']).status, 1);
  assert.ok(!exists(path.join(home, '.cursor')));
});

test('gutix itself: every skill but the Claude-only ones as gutix-<x>, same version, design-doc tests pass in the copy', () => {
  const home = tmp();
  const r = run(home, [root, '--prefix', 'gutix-']);
  assert.equal(r.status, 0, r.stderr);
  const t = targetOf(home, 'gutix');
  const expected = fs.readdirSync(path.join(root, 'skills')).filter((s) => s !== 'ship').map((s) => `gutix-${s}`).sort();
  assert.deepEqual(fs.readdirSync(path.join(t, 'skills')).sort(), expected);
  for (const s of expected) assert.match(read(path.join(t, 'skills', s, 'SKILL.md')), new RegExp(`^---\\nname: ${s}\\n`));
  assert.equal(JSON.parse(read(path.join(t, '.cursor-plugin/plugin.json'))).version, JSON.parse(read(path.join(root, '.claude-plugin/plugin.json'))).version);
  assert.match(read(path.join(t, 'skills/gutix-pr-review/SKILL.md')), /\n## In Cursor\n/);
  const all = walk(t).filter((p) => p.endsWith('.md')).map(read).join('\n');
  for (const s of expected) assert.ok(!all.includes(`gutix:${s.slice('gutix-'.length)}`), `a mention of ${s} was not rewritten`);
  assert.ok(all.includes('gutix-sign-off') && all.includes('gutix:ship'), 'copied skills are renamed, the skipped ship keeps its name');

  const tests = spawnSync('node', ['--test', path.join(t, 'skills/gutix-design-doc/scripts/test/design-doc.test.mjs')], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(tests.status, 0, tests.stdout.slice(-1500));
});

test('a regeneration that fails partway leaves the earlier copy intact, and the next good run recovers', () => {
  const plugin = fixturePlugin();
  const home = tmp();
  assert.equal(run(home, [plugin, '--prefix', 'acme-']).status, 0);
  const t = targetOf(home);
  const before = treeHash(t);

  // A dangling symlink cannot be copied (portable on macOS and Linux), and `beta` is built after `alpha`.
  fs.symlinkSync(path.join(plugin, 'nowhere'), path.join(plugin, 'skills/beta/broken'));
  const failed = run(home, [plugin, '--prefix', 'acme-']);
  assert.equal(failed.status, 1);
  assert.equal(treeHash(t), before, 'the old copy is untouched');
  assert.match(read(path.join(t, 'skills/acme-alpha/SKILL.md')), /^---\nname: acme-alpha\n/);
  assert.deepEqual(fs.readdirSync(path.dirname(t)), ['acme'], 'no staging folder left behind');

  fs.rmSync(path.join(plugin, 'skills/beta/broken'));
  write(path.join(plugin, 'skills/gamma/SKILL.md'), '---\nname: gamma\ndescription: Gamma\n---\n');
  assert.equal(run(home, [plugin, '--prefix', 'acme-']).status, 0);
  assert.ok(exists(path.join(t, 'skills/acme-gamma/SKILL.md')));
  assert.deepEqual(fs.readdirSync(path.dirname(t)), ['acme']);
});
