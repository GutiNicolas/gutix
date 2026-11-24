// An org plugin loads only in the clones whose origin matches its profile: black-box through the CLI, always a
// temporary HOME and a temporary projects root, with git repos that have an origin URL but no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gutix.mjs');
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-scope-')));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const read = (file) => fs.readFileSync(file, 'utf8');
const exists = fs.existsSync;
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gutix = (home, args) => spawnSync('node', [cli, ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
const skill = (name) => `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n`;

function orgRepo(profile = { match: ['github.com/acme/'] }, plugin = true) {
  const base = tmp();
  const bare = path.join(base, 'remote.git');
  const work = path.join(base, 'work');
  git(base, 'init', '-q', '--bare', '-b', 'main', bare);
  git(base, 'clone', '-q', bare, work);
  write(path.join(work, 'gutix-org.json'), JSON.stringify({ name: 'acme', ...profile }));
  if (plugin) {
    write(path.join(work, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'acme', version: '1.0.0' }));
    write(path.join(work, 'skills/gamma/SKILL.md'), skill('gamma'));
    write(path.join(work, 'skills/delta/SKILL.md'), skill('delta'));
  }
  git(work, 'checkout', '-q', '-b', 'main');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'init');
  git(work, 'push', '-q', 'origin', 'main');
  return { bare, work, url: `file://${bare}` };
}

// A git repo with an origin, committed once so `git status` has something to compare against.
function clone(root, rel, origin) {
  const dir = path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '.');
  git(dir, 'remote', 'add', 'origin', origin);
  write(path.join(dir, 'README.md'), 'x\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const excludeOf = (repo) => path.join(repo, '.git/info/exclude');
const status = (repo) => git(repo, 'status', '--porcelain', '--untracked-files=all');
const skillDirs = (repo) => (exists(path.join(repo, '.cursor/skills')) ? fs.readdirSync(path.join(repo, '.cursor/skills')).sort() : []);
function snapshot(dir) { // every file path and content under dir, except .git objects
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.name === 'objects' && d.endsWith('.git')) continue;
      if (e.isDirectory()) { out[`${path.relative(dir, p)}/`] = ''; walk(p); } else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}
const registry = (home) => JSON.parse(read(path.join(home, '.config/gutix/orgs.json')));

function fixture() {
  const home = tmp();
  const root = tmp();
  const match = clone(root, 'app', 'git@github.com:acme/app.git');
  const other = clone(root, 'other', 'https://github.com/elsewhere/app.git');
  return { home, root, match, other, org: orgRepo() };
}

test('link-org copies the plugin only into the matching clone, hides it from git, and installs nothing globally', () => {
  const f = fixture();
  // A global copy that an earlier link-org generated: it must go, with a backup.
  const old = path.join(f.home, '.cursor/plugins/local/acme');
  write(path.join(old, 'skills/acme-gamma/SKILL.md'), 'old');
  write(path.join(old, '.gutix-cursor.json'), JSON.stringify({ plugin: 'acme', prefix: 'acme-', skills: ['acme-gamma'], agents: [] }));
  const otherBefore = snapshot(f.other);

  const r = gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]);
  assert.equal(r.status, 0, r.stderr);

  assert.deepEqual(skillDirs(f.match), ['acme-delta', 'acme-gamma']);
  assert.match(read(path.join(f.match, '.cursor/skills/acme-gamma/SKILL.md')), /^---\nname: acme-gamma\n/);
  assert.ok(read(excludeOf(f.match)).split('\n').includes('.cursor/skills/acme-*/'));
  assert.equal(status(f.match), '', 'git sees nothing new in the matching clone');
  assert.deepEqual(snapshot(f.other), otherBefore, 'the clone that does not match is untouched');
  assert.ok(!exists(old), 'no global copy left');
  const backups = path.join(f.home, '.cache/gutix/cursor-backups');
  assert.match(read(path.join(backups, fs.readdirSync(backups)[0], 'skills/acme-gamma/SKILL.md')), /old/);
  assert.deepEqual(registry(f.home).orgs[0].projectsRoots, [f.root], 'the roots are remembered');
});

test('the sweep skips node_modules, hidden folders and clones deeper than two levels, and finds <group>/<repo>', () => {
  const f = fixture();
  const grouped = clone(f.root, 'team/api', 'https://github.com/acme/api');
  const deep = clone(f.root, 'a/b/c', 'https://github.com/acme/deep');
  const hidden = clone(f.root, '.claude/worktrees/w', 'https://github.com/acme/w');
  const modules = clone(f.root, 'node_modules/x', 'https://github.com/acme/x');
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  assert.deepEqual(registry(f.home).orgs[0].repos.map((r) => r.path).sort(), [f.match, grouped].map((p) => fs.realpathSync(p)).sort());
  for (const skipped of [deep, hidden, modules]) assert.deepEqual(skillDirs(skipped), []);
});

test('re-running the sweep (update) is idempotent: same files, no duplicate exclude line', () => {
  const f = fixture();
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  const treeBefore = snapshot(path.join(f.match, '.cursor'));
  const excludeBefore = read(excludeOf(f.match));
  const regBefore = registry(f.home);
  for (let i = 0; i < 2; i++) {
    const r = gutix(f.home, ['update']);
    assert.equal(r.status, 0, r.stderr);
  }
  assert.deepEqual(snapshot(path.join(f.match, '.cursor')), treeBefore);
  assert.equal(read(excludeOf(f.match)), excludeBefore);
  assert.equal(excludeBefore.split('\n').filter((l) => l === '.cursor/skills/acme-*/').length, 1);
  assert.deepEqual(registry(f.home), regBefore);
});

test('update gives a new matching clone the plugin, and only reports a repo that stopped matching or is gone', () => {
  const f = fixture();
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  const fresh = clone(f.root, 'fresh', 'https://github.com/acme/fresh');
  git(f.match, 'remote', 'set-url', 'origin', 'https://github.com/elsewhere/app');
  const before = snapshot(f.match);
  const r = gutix(f.home, ['update']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(skillDirs(fresh), ['acme-delta', 'acme-gamma']);
  assert.deepEqual(snapshot(f.match), before, 'a clone that no longer matches is not touched');
  assert.match(r.stderr, /no longer matches or is gone/);
  fs.rmSync(f.match, { recursive: true });
  assert.equal(gutix(f.home, ['update']).status, 0, 'a gone repo is no failure');
});

test('unlink-org leaves every clone exactly as it was, and the org can be linked again; update does not bring it back', () => {
  const f = fixture();
  const m = f.match;
  const before = { match: snapshot(m), other: snapshot(f.other) };
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  assert.notEqual(status(m) + read(excludeOf(m)), '');

  const r = gutix(f.home, ['unlink-org', 'acme']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(m), '');
  assert.deepEqual(snapshot(m), before.match, 'files and exclude bytes as before, .cursor gone');
  assert.deepEqual(snapshot(f.other), before.other);
  assert.deepEqual(registry(f.home).orgs, []);
  assert.ok(!exists(path.join(f.home, '.config/gutix/orgs/acme')));

  assert.equal(gutix(f.home, ['update']).status, 0);
  assert.deepEqual(skillDirs(m), [], 'update does not re-add what was unlinked');
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0, 'link again works');
  assert.deepEqual(skillDirs(m), ['acme-delta', 'acme-gamma']);
  assert.equal(gutix(f.home, ['link-org', '--remove', 'acme']).status, 0, '--remove does the same');
  assert.deepEqual(snapshot(m), before.match);
});

test('exclude file edge cases come back byte for byte: no trailing newline, a line that was already there, no file at all', () => {
  const f = fixture();
  const noEol = clone(f.root, 'noeol', 'https://github.com/acme/noeol');
  const had = clone(f.root, 'had', 'https://github.com/acme/had');
  const none = clone(f.root, 'none', 'https://github.com/acme/none');
  fs.writeFileSync(excludeOf(noEol), '# mine\n*.log');
  fs.writeFileSync(excludeOf(had), '# mine\n.cursor/skills/acme-*/\n');
  fs.rmSync(excludeOf(none));
  const before = [noEol, had, none].map(snapshot);
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  assert.equal(read(excludeOf(noEol)), '# mine\n*.log\n.cursor/skills/acme-*/\n');
  assert.equal(read(excludeOf(had)), '# mine\n.cursor/skills/acme-*/\n', 'not duplicated');
  assert.equal(gutix(f.home, ['unlink-org', 'acme']).status, 0);
  assert.deepEqual([noEol, had, none].map(snapshot), before);
});

test('a folder with the plugin prefix that gutix did not generate is never overwritten; the other clones still get theirs', () => {
  const f = fixture();
  write(path.join(f.match, '.cursor/skills/acme-gamma/SKILL.md'), 'hand-written');
  const other = clone(f.root, 'second', 'https://github.com/acme/second');
  const r = gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /was not generated by gutix/);
  assert.equal(read(path.join(f.match, '.cursor/skills/acme-gamma/SKILL.md')), 'hand-written');
  assert.deepEqual(skillDirs(f.match), ['acme-gamma'], 'nothing else added to that clone');
  assert.deepEqual(skillDirs(other), ['acme-delta', 'acme-gamma']);
});

test('a linked worktree is swept too, and its exclude line goes to the shared git dir', () => {
  const f = fixture();
  const wt = path.join(f.root, 'app-wt');
  git(f.match, 'worktree', 'add', '-q', '-b', 'side', wt);
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  assert.deepEqual(skillDirs(wt), ['acme-delta', 'acme-gamma']);
  assert.equal(status(wt), '');
  assert.equal(gutix(f.home, ['unlink-org', 'acme']).status, 0);
  assert.equal(status(wt), '');
  assert.deepEqual(skillDirs(wt), []);
  assert.ok(!read(excludeOf(f.match)).includes('acme-'));
});

test('an org linked before copies were scoped (generated global copy, no record of repos) is migrated by update', () => {
  const f = fixture();
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--no-cursor']).status, 0);
  const reg = registry(f.home);
  reg.orgs[0].projectsRoots = [f.root];
  write(path.join(f.home, '.config/gutix/orgs.json'), JSON.stringify(reg));
  const old = path.join(f.home, '.cursor/plugins/local/acme');
  write(path.join(old, 'skills/acme-gamma/SKILL.md'), 'old');
  write(path.join(old, '.gutix-cursor.json'), JSON.stringify({ plugin: 'acme', prefix: 'acme-', skills: ['acme-gamma'], agents: [] }));
  const r = gutix(f.home, ['update']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!exists(old));
  assert.deepEqual(skillDirs(f.match), ['acme-delta', 'acme-gamma']);
});

test('an org plugin whose profile has no match is copied nowhere, with a notice', () => {
  const f = fixture();
  const org = orgRepo({}, true);
  const r = gutix(f.home, ['link-org', org.url, '--projects-root', f.root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /no "match"/);
  assert.deepEqual(skillDirs(f.match), []);
  assert.ok(!exists(path.join(f.home, '.cursor')));
});

test('update with no matching clone keeps a legacy global copy and says so, even when quiet', () => {
  const f = fixture();
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--no-cursor']).status, 0);
  const empty = tmp(); // projects root with no clone of the org
  const reg = registry(f.home);
  reg.orgs[0].projectsRoots = [empty];
  write(path.join(f.home, '.config/gutix/orgs.json'), JSON.stringify(reg));
  const old = path.join(f.home, '.cursor/plugins/local/acme');
  write(path.join(old, 'skills/acme-gamma/SKILL.md'), 'old');
  write(path.join(old, '.gutix-cursor.json'), JSON.stringify({ plugin: 'acme', prefix: 'acme-', skills: ['acme-gamma'], agents: [] }));
  const r = gutix(f.home, ['update', '--daily']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(path.join(old, 'skills/acme-gamma/SKILL.md')), 'global copy kept');
  assert.match(r.stderr, /--projects-root/);
});

test('link-org does not suggest the Claude marketplace for a plugin scoped to repos', () => {
  const f = fixture();
  write(path.join(f.org.work, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'acme', plugins: [] }));
  git(f.org.work, 'add', '-A'); git(f.org.work, 'commit', '-q', '-m', 'mkt'); git(f.org.work, 'push', '-q', 'origin', 'main');
  const r = gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /plugin marketplace add/);
});

test('unlink-org keeps the org folder when it has a commit that is not on its upstream', () => {
  const f = fixture();
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  const dir = registry(f.home).orgs[0].path;
  write(path.join(dir, 'skills/gamma/extra.md'), 'local work');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'local');
  const r = gutix(f.home, ['unlink-org', 'acme']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(path.join(dir, 'skills/gamma/extra.md')), 'unpushed commit survives');
  assert.match(r.stdout + r.stderr, /was kept/);
});

test('a repo whose copy fails on the first install is left as it was: no exclude line, no folders', () => {
  const f = fixture();
  write(path.join(f.match, '.cursor'), 'not a folder'); // .cursor is a file, so the skills folder cannot be made
  const before = snapshot(f.match);
  const r = gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, new RegExp(f.match.replace(/[/.]/g, '.')));
  assert.deepEqual(snapshot(f.match), before);
  assert.equal(gutix(f.home, ['unlink-org', 'acme']).status, 0);
  assert.deepEqual(snapshot(f.match), before);
});

test('a failure in the middle of the per-repo swap leaves every skill exactly as before', () => {
  const f = fixture();
  assert.equal(gutix(f.home, ['link-org', f.org.url, '--projects-root', f.root]).status, 0);
  write(path.join(f.org.work, 'skills/gamma/SKILL.md'), skill('gamma') + '\nnew version\n');
  write(path.join(f.org.work, 'skills/delta/SKILL.md'), skill('delta') + '\nnew version\n');
  git(f.org.work, 'add', '-A'); git(f.org.work, 'commit', '-q', '-m', 'v2'); git(f.org.work, 'push', '-q', 'origin', 'main');
  const before = snapshot(path.join(f.match, '.cursor'));
  const stuck = path.join(f.match, '.cursor/skills/acme-gamma'); // a folder that cannot be moved: the swap fails after acme-delta moved
  fs.chmodSync(stuck, 0o555);
  try {
    const r = gutix(f.home, ['update']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /acme/);
    assert.deepEqual(snapshot(path.join(f.match, '.cursor')), before);
  } finally { fs.chmodSync(stuck, 0o755); }
  assert.equal(gutix(f.home, ['update']).status, 0);
  assert.match(read(path.join(f.match, '.cursor/skills/acme-gamma/SKILL.md')), /new version/, 'a later update succeeds');
});
