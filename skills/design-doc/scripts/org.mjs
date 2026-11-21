// Finds the org profile for a repo: the first linked org whose `match` prefix fits the repo's `origin`.
//   import { resolveOrg } from './org.mjs';  resolveOrg(process.cwd()) -> { name, dir, profile } | null
// The registry is $HOME/.config/gutix/orgs.json; each org folder holds gutix-org.json. Node built-ins only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const home = () => process.env.HOME || os.homedir();

/** `git@host:owner/repo.git`, `ssh://git@host/owner/repo.git`, `https://user@host/owner/repo.git` -> `host/owner/repo`. */
export function normalizeRemote(url) {
  let u = String(url ?? '').trim();
  if (!u) return '';
  u = u.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');                 // scheme
  u = u.replace(/^[^@/]+@/, '');                                  // user@
  u = u.replace(/^([^/:]+):(?!\d+\/)/, '$1/');                    // scp-like host:path (not host:port/)
  u = u.replace(/^([^/:]+):\d+\//, '$1/');                        // host:port/path
  return u.replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
}

function remoteOf(dir) {
  const r = spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0 ? r.stdout.trim() : '';
}

function prefixMatches(remote, match) {
  const m = normalizeRemote(match);
  if (!m) return false;
  if (!remote.startsWith(m)) return false;
  return match.trim().endsWith('/') || remote.length === m.length || remote[m.length] === '/';
}

export function resolveOrg(startDir, { warn = (m) => process.stderr.write(`warning: ${m}\n`) } = {}) {
  const registry = path.join(home(), '.config/gutix/orgs.json');
  if (!fs.existsSync(registry)) return null;
  let orgs;
  try { orgs = JSON.parse(fs.readFileSync(registry, 'utf8')).orgs; } catch (e) { warn(`${registry} is not valid JSON, ignored`); return null; }
  if (!Array.isArray(orgs) || orgs.length === 0) return null;
  const remote = normalizeRemote(remoteOf(path.resolve(startDir)));
  if (!remote) return null;

  let best = null;
  for (const entry of orgs) {
    try {
      const dir = path.resolve(entry.path);
      const profile = JSON.parse(fs.readFileSync(path.join(dir, 'gutix-org.json'), 'utf8'));
      if (!Array.isArray(profile.match) || profile.match.some((m) => typeof m !== 'string')) throw new Error('"match" must be a list of strings');
      for (const m of profile.match) {
        if (prefixMatches(remote, m) && (!best || normalizeRemote(m).length > best.len)) {
          best = { len: normalizeRemote(m).length, org: { name: profile.name || entry.name, dir, profile } };
        }
      }
    } catch (e) {
      warn(`org "${entry?.name ?? '?'}" in ${registry} ignored: ${e.message}`);
    }
  }
  return best ? best.org : null;
}
