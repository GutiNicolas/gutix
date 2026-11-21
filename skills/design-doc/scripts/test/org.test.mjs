import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveOrg, normalizeRemote } from '../org.mjs';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-org-')));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

/** A temporary HOME with the given orgs registered, and a repo whose origin is `remote`. */
function setup(remote, orgs) {
  const home = tmp();
  const entries = Object.entries(orgs).map(([name, profile]) => {
    const dir = path.join(home, '.config/gutix/orgs', name);
    if (profile !== null) write(path.join(dir, 'gutix-org.json'), typeof profile === 'string' ? profile : JSON.stringify(profile));
    return { name, path: dir };
  });
  write(path.join(home, '.config/gutix/orgs.json'), JSON.stringify({ orgs: entries }));
  const repo = tmp();
  execFileSync('git', ['init', '-q', repo]);
  if (remote) execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', remote]);
  return { home, repo };
}
function resolve({ home, repo }) {
  const saved = process.env.HOME;
  process.env.HOME = home;
  const warnings = [];
  try { return { org: resolveOrg(repo, { warn: (m) => warnings.push(m) }), warnings }; } finally { process.env.HOME = saved; }
}

const acme = { name: 'acme', match: ['github.com/acme/'] };

test('ssh, scp-like and https origins all match the same prefix', () => {
  for (const remote of ['git@github.com:acme/app.git', 'ssh://git@github.com/acme/app.git', 'ssh://git@github.com:2222/acme/app', 'https://github.com/acme/app.git', 'https://user:token@github.com/acme/app', 'https://GitHub.com/Acme/app/']) {
    const s = setup(remote, { acme });
    const { org, warnings } = resolve(s);
    assert.equal(org?.name, 'acme', remote);
    assert.equal(org.dir, path.join(s.home, '.config/gutix/orgs/acme'));
    assert.deepEqual(org.profile, acme);
    assert.deepEqual(warnings, []);
  }
  assert.equal(normalizeRemote('git@github.com:acme/app.git'), 'github.com/acme/app');
});

test('no match, no origin or no registry gives null', () => {
  assert.equal(resolve(setup('git@github.com:other/app.git', { acme })).org, null);
  assert.equal(resolve(setup('https://github.com/acme-labs/app.git', { acme: { name: 'acme', match: ['github.com/acme'] } })).org, null, 'a prefix ends at a path boundary');
  assert.equal(resolve(setup(null, { acme })).org, null);
  const s = setup('git@github.com:acme/app.git', {});
  fs.rmSync(path.join(s.home, '.config/gutix/orgs.json'));
  assert.equal(resolve(s).org, null);
});

test('a broken entry is ignored with a warning and the others still resolve', () => {
  const orgs = { missing: null, garbage: '{ not json', nomatch: { name: 'nomatch' }, acme };
  const { org, warnings } = resolve(setup('git@github.com:acme/app.git', orgs));
  assert.equal(org?.name, 'acme');
  assert.equal(warnings.length, 3);
  assert.ok(warnings.every((w) => /ignored/.test(w)));
});

test('the longest matching prefix wins', () => {
  const orgs = { wide: { name: 'wide', match: ['github.com/acme/'] }, narrow: { name: 'narrow', match: ['github.com/acme/app'] } };
  assert.equal(resolve(setup('git@github.com:acme/app.git', orgs)).org.name, 'narrow');
  assert.equal(resolve(setup('git@github.com:acme/other.git', orgs)).org.name, 'wide');
});
