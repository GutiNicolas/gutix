// install, link-org, new-org, update and the SessionStart hook: black-box through the CLI, always a temporary HOME
// and local bare git repos standing in for the org (and for gutix itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'scripts/gutix.mjs');
const REQUIRED_TOKENS = ['--ink', '--muted', '--line', '--soft', '--accent', '--accent-soft', '--warn', '--warn-soft', '--ok', '--ok-soft', '--bad', '--bad-soft', '--font-sans', '--font-mono'];

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-op-')));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const read = (file) => fs.readFileSync(file, 'utf8');
const exists = fs.existsSync;
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function gutix(home, args, env = {}) {
  return spawnSync('node', [cli, ...args], { env: { ...process.env, HOME: home, ...env }, encoding: 'utf8' });
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? [p, ...walk(p)] : [p];
  });
}

/** A bare repo with `main` and (optionally) `develop` branches. `files` go on main, `developFiles` only on develop. */
function bareRepo(files, developFiles = null) {
  const base = tmp();
  const bare = path.join(base, 'remote.git');
  const work = path.join(base, 'work');
  git(base, 'init', '-q', '--bare', '-b', 'main', bare);
  git(base, 'clone', '-q', bare, work);
  for (const [f, t] of Object.entries(files)) write(path.join(work, f), t);
  git(work, 'checkout', '-q', '-b', 'main');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'init');
  git(work, 'push', '-q', 'origin', 'main');
  if (developFiles) {
    git(work, 'checkout', '-q', '-b', 'develop');
    for (const [f, t] of Object.entries(developFiles)) write(path.join(work, f), t);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'develop');
    git(work, 'push', '-q', 'origin', 'develop');
  }
  return { bare, work, url: `file://${bare}` };
}
const push = (repo, file, text) => {
  write(path.join(repo.work, file), text);
  git(repo.work, 'add', '-A');
  git(repo.work, 'commit', '-q', '-m', `add ${file}`);
  git(repo.work, 'push', '-q', 'origin', 'HEAD');
};

const skill = (name) => `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n`;
const orgFiles = (extra = {}) => ({
  'gutix-org.json': JSON.stringify({ name: 'acme', match: ['github.com/acme/'], theme: 'theme.css' }),
  'theme.css': ':root { --ink: #000; }\n',
  '.claude-plugin/plugin.json': JSON.stringify({ name: 'acme', version: '1.0.0', description: 'Acme' }),
  'skills/gamma/SKILL.md': skill('gamma'),
  ...extra,
});
// A stand-in for gutix itself (`update` pulls GUTIX_ROOT), cloned from its own bare repo.
function gutixFixture() {
  const repo = bareRepo({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'gutix', version: '9.9.9' }),
    'skills/alpha/SKILL.md': skill('alpha'),
  });
  const checkout = path.join(tmp(), 'gutix');
  git(path.dirname(checkout), 'clone', '-q', repo.url, checkout);
  return { ...repo, checkout };
}
const registry = (home) => JSON.parse(read(path.join(home, '.config/gutix/orgs.json')));

test('link-org --branch clones that branch, installs it in Cursor with the org prefix, records it, no symlinks', () => {
  const org = bareRepo(orgFiles(), { 'develop-only.txt': 'x' });
  const home = tmp();
  const r = gutix(home, ['link-org', org.url, '--branch', 'develop']);
  assert.equal(r.status, 0, r.stderr);

  const [entry] = registry(home).orgs;
  assert.deepEqual({ name: entry.name, branch: entry.branch, git: entry.git }, { name: 'acme', branch: 'develop', git: org.url });
  assert.equal(entry.path, path.join(home, '.config/gutix/orgs/acme'));
  assert.ok(exists(path.join(entry.path, 'develop-only.txt')), 'the develop branch was cloned');
  assert.match(read(path.join(home, '.cursor/plugins/local/acme/skills/acme-gamma/SKILL.md')), /^---\nname: acme-gamma\n/);
  assert.equal(walk(home).filter((p) => fs.lstatSync(p).isSymbolicLink()).length, 0);
  assert.deepEqual(fs.readdirSync(path.join(home, '.config/gutix/orgs')), ['acme'], 'no clone leftovers');
});

test('link-org refuses a repo without gutix-org.json and an org that is already linked, leaving nothing behind', () => {
  const home = tmp();
  const bad = bareRepo({ 'README.md': 'x' });
  const r = gutix(home, ['link-org', bad.url]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /gutix-org\.json/);
  assert.ok(!exists(path.join(home, '.config/gutix/orgs.json')));

  const org = bareRepo(orgFiles());
  assert.equal(gutix(home, ['link-org', org.url]).status, 0);
  const again = gutix(home, ['link-org', org.url]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already linked/);
  assert.deepEqual(fs.readdirSync(path.join(home, '.config/gutix/orgs')), ['acme']);
});

test('link-org without a plugin in the repo records a profile only, and an unreachable link fails cleanly', () => {
  const home = tmp();
  const org = bareRepo({ 'gutix-org.json': JSON.stringify({ name: 'acme', match: [] }) });
  const r = gutix(home, ['link-org', org.url]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!exists(path.join(home, '.cursor')));
  const missing = gutix(tmp(), ['link-org', `file://${path.join(tmp(), 'nope.git')}`]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /could not clone/);
});

test('new-org writes the profile, a theme with every required token and a README, and refuses to overwrite', () => {
  const home = tmp();
  const r = gutix(home, ['new-org', 'acme']);
  assert.equal(r.status, 0, r.stderr);
  const dir = path.join(home, '.config/gutix/orgs/acme');
  const profile = JSON.parse(read(path.join(dir, 'gutix-org.json')));
  assert.equal(profile.name, 'acme');
  assert.ok(Array.isArray(profile.match) && profile.theme === 'theme.css');
  const css = read(path.join(dir, 'theme.css'));
  for (const token of REQUIRED_TOKENS) assert.match(css, new RegExp(`${token}\\s*:`), token);
  assert.equal((css.match(/:root\s*\{/g) || []).length, 1);
  assert.ok(read(path.join(dir, 'README.md')).includes('acme') && !read(path.join(dir, 'README.md')).includes('{{'));
  assert.deepEqual(registry(home).orgs, [{ name: 'acme', path: dir }]);

  write(path.join(dir, 'theme.css'), ':root { --ink: red; }\n');
  const again = gutix(home, ['new-org', 'acme']);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /not overwriting/);
  assert.equal(read(path.join(dir, 'theme.css')), ':root { --ink: red; }\n');
  assert.equal(gutix(home, ['new-org', 'Bad Name']).status, 2);
});

test('install runs without prompts when flags answer them: Cursor copy, skeleton, auto-update', () => {
  const home = tmp();
  const g = gutixFixture();
  const r = gutix(home, ['install', '--cursor', '--no-org', '--skeleton', 'acme', '--auto-update', 'daily'], { GUTIX_ROOT: g.checkout });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(path.join(home, '.cursor/plugins/local/gutix/skills/gutix-alpha/SKILL.md')));
  assert.ok(exists(path.join(home, '.config/gutix/orgs/acme/gutix-org.json')));
  assert.equal(JSON.parse(read(path.join(home, '.config/gutix/config.json'))).autoUpdate, 'daily');

  const bare = tmp();
  const none = gutix(bare, ['install'], { GUTIX_ROOT: g.checkout }); // no flags and no terminal: nothing is done, nothing hangs
  assert.equal(none.status, 0, none.stderr);
  assert.ok(!exists(path.join(bare, '.cursor')) && JSON.parse(read(path.join(bare, '.config/gutix/config.json'))).autoUpdate === 'off');
});

test('install --org links the org with the flags given', () => {
  const home = tmp();
  const g = gutixFixture();
  const org = bareRepo(orgFiles(), { 'develop-only.txt': 'x' });
  const r = gutix(home, ['install', '--cursor', '--org', org.url, '--branch', 'develop', '--auto-update', 'off'], { GUTIX_ROOT: g.checkout });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(registry(home).orgs[0].branch, 'develop');
  assert.ok(exists(path.join(home, '.cursor/plugins/local/acme/skills/acme-gamma')));
});

test('update pulls gutix and each org on its branch and regenerates the Cursor copies; a failing pull warns and exits 0', () => {
  const home = tmp();
  const g = gutixFixture();
  const org = bareRepo(orgFiles(), { 'develop-only.txt': 'x' });
  const env = { GUTIX_ROOT: g.checkout };
  assert.equal(gutix(home, ['install', '--cursor', '--org', org.url, '--branch', 'develop', '--auto-update', 'off'], env).status, 0);

  git(org.work, 'checkout', '-q', 'develop');
  push(org, 'skills/delta/SKILL.md', skill('delta'));
  push(g, 'skills/omega/SKILL.md', skill('omega'));
  const r = gutix(home, ['update'], env);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(path.join(home, '.config/gutix/orgs/acme/skills/delta/SKILL.md')), 'org pulled on its branch');
  assert.ok(exists(path.join(home, '.cursor/plugins/local/acme/skills/acme-delta/SKILL.md')), 'org Cursor copy regenerated');
  assert.ok(exists(path.join(home, '.cursor/plugins/local/gutix/skills/gutix-omega/SKILL.md')), 'gutix pulled and its copy regenerated');

  fs.renameSync(org.bare, `${org.bare}.gone`);
  const failing = gutix(home, ['update'], env);
  assert.equal(failing.status, 0);
  assert.match(failing.stderr, /acme: could not pull/);
});

test('update does not create a Cursor copy that was never installed', () => {
  const home = tmp();
  const g = gutixFixture();
  assert.equal(gutix(home, ['update'], { GUTIX_ROOT: g.checkout }).status, 0);
  assert.ok(!exists(path.join(home, '.cursor')));
});

test('update --daily is quiet and a no-op the second time on the same day', () => {
  const home = tmp();
  const g = gutixFixture();
  const env = { GUTIX_ROOT: g.checkout };
  assert.equal(gutix(home, ['install', '--cursor', '--no-org', '--no-skeleton'], env).status, 0);

  push(g, 'skills/one/SKILL.md', skill('one'));
  const first = gutix(home, ['update', '--daily'], env);
  assert.equal(first.status, 0);
  assert.equal(first.stdout, '', 'a SessionStart hook turns stdout into context');
  assert.ok(exists(path.join(g.checkout, 'skills/one/SKILL.md')) && exists(path.join(home, '.cursor/plugins/local/gutix/skills/gutix-one')));

  push(g, 'skills/two/SKILL.md', skill('two'));
  assert.equal(gutix(home, ['update', '--daily'], env).status, 0);
  assert.ok(!exists(path.join(g.checkout, 'skills/two')), 'second run the same day did nothing');
  fs.writeFileSync(path.join(home, '.config/gutix/last-update'), '2000-01-01\n');
  gutix(home, ['update', '--daily'], env);
  assert.ok(exists(path.join(g.checkout, 'skills/two/SKILL.md')), 'a stale stamp runs again');
});

test('the SessionStart hook does nothing without opt-in, and runs the daily update with it', () => {
  const hooks = JSON.parse(read(path.join(root, 'hooks/hooks.json')));
  const command = hooks.hooks.SessionStart[0].hooks[0].command;
  const run = (home, g) => spawnSync('sh', ['-c', command], { env: { ...process.env, HOME: home, CLAUDE_PLUGIN_ROOT: root, GUTIX_ROOT: g.checkout }, encoding: 'utf8' });
  const g = gutixFixture();
  push(g, 'skills/one/SKILL.md', skill('one'));
  const stamp = (home) => path.join(home, '.config/gutix/last-update');

  const home = tmp();
  assert.equal(run(home, g).status, 0); // no config at all
  write(path.join(home, '.config/gutix/config.json'), '{"autoUpdate":"off"}');
  assert.equal(run(home, g).status, 0);
  assert.ok(!exists(stamp(home)) && !exists(path.join(g.checkout, 'skills/one')), 'nothing ran');

  write(path.join(home, '.config/gutix/config.json'), '{\n  "autoUpdate" :  "daily"\n}');
  const on = run(home, g);
  assert.equal(on.status, 0, on.stderr);
  assert.equal(on.stdout, '');
  assert.ok(exists(stamp(home)) && exists(path.join(g.checkout, 'skills/one/SKILL.md')));
});
