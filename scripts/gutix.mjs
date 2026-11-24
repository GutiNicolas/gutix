#!/usr/bin/env node
// gutix CLI. Node built-ins only; macOS and Linux. One subcommand per entry in COMMANDS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeRemote, prefixMatches, remoteOf } from '../skills/design-doc/scripts/org.mjs';

// Skills that only make sense in Claude Code. They are skipped by install-cursor unless the plugin ships an
// override for them in cursor/overrides/<skill>.md.
const CLAUDE_ONLY = ['ship'];
const TEXT_EXT = new Set(['.md', '.mdc', '.mjs', '.js', '.cjs', '.sh', '.json', '.html', '.css', '.txt', '.yml', '.yaml']);
const MANIFEST = '.gutix-cursor.json';
const DROP_KEYS = new Set(['args', 'user-invocable']);

const home = () => process.env.HOME || os.homedir();
const exists = (p) => fs.existsSync(p);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

class UsageError extends Error {}

function parseArgs(argv, { values = [], lists = [], bools = [] }) {
  const opts = Object.fromEntries([...lists.map((k) => [k, []]), ...values.map((k) => [k, undefined]), ...bools.map((k) => [k, false])]);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const k = a.slice(2);
    if (bools.includes(k)) opts[k] = true;
    else if (values.includes(k) || lists.includes(k)) {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`--${k} needs a value`);
      if (lists.includes(k)) opts[k].push(v); else opts[k] = v;
    } else throw new UsageError(`unknown option --${k}`);
  }
  return { opts, positional };
}

// ---- install-cursor ------------------------------------------------------------------------------------------

// Frontmatter: set `name`, drop `args` and `user-invocable` (with their indented list). Every other byte is kept.
function rewriteFrontmatter(text, newName) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(nl);
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) throw new Error('SKILL.md has no frontmatter');
  const out = [];
  let skipping = false;
  let named = false;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (skipping && /^(\s|-\s)/.test(line)) continue;
    skipping = false;
    const key = /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1];
    if (DROP_KEYS.has(key)) { skipping = true; continue; }
    if (key === 'name') { out.push(`name: ${newName}`); named = true; continue; }
    out.push(line);
  }
  if (!named) out.unshift(`name: ${newName}`);
  return ['---', ...out, ...lines.slice(end)].join(nl);
}

// `../<y>/` (any depth) -> `../<prefix><y>/` for the sibling skills that are copied.
function rewriteSiblings(text, siblings, prefix) {
  if (!siblings.length) return text;
  const alt = siblings.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return text.replace(new RegExp(`(?<![\\w.-])((?:\\.\\./)+)(${alt})/`, 'g'), (_, up, name) => `${up}${prefix}${name}/`);
}

// `<plugin>:<skill>` -> `<prefix><skill>` for the skills that are copied (a whole token: `gutix:sign-off`, not
// `gutix:sign-offs` or `x.gutix:sign-off`). A skill that is skipped keeps its Claude name.
function rewritePluginRefs(text, plugin, skills, prefix) {
  if (!skills.length) return text;
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = skills.map(esc).join('|');
  return text.replace(new RegExp(`(?<![\\w.:-])${esc(plugin)}:(${alt})(?![\\w-])`, 'g'), (_, name) => `${prefix}${name}`);
}

function copyTree(src, dest, transform, rel = '') {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === 'node_modules' || entry.name === '.git') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    const st = fs.statSync(from); // follows symlinks: the copy is always real files
    if (st.isDirectory()) copyTree(from, to, transform, path.posix.join(rel, entry.name));
    else if (st.isFile()) {
      const raw = fs.readFileSync(from);
      fs.writeFileSync(to, TEXT_EXT.has(path.extname(entry.name)) ? transform(raw.toString('utf8'), path.posix.join(rel, entry.name)) : raw, { mode: st.mode & 0o777 });
    }
  }
}

function listSkills(folder) {
  const dir = path.join(folder, 'skills');
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && isDir(path.join(dir, e.name)) && exists(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name).sort();
}

function listFiles(dir, ext) {
  return isDir(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext) && fs.statSync(path.join(dir, f)).isFile()).sort() : [];
}

function findClashes({ names, ownTarget, projects }) {
  const h = home();
  const roots = [
    path.join(h, '.cursor/skills'), path.join(h, '.cursor/skills-cursor'), path.join(h, '.agents/skills'),
    path.join(h, '.claude/skills'), path.join(h, '.codex/skills'),
  ];
  for (const p of projects) for (const rel of ['.cursor/skills', '.agents/skills', '.claude/skills']) roots.push(path.join(p, rel));
  const localDir = path.join(h, '.cursor/plugins/local');
  if (isDir(localDir)) {
    for (const e of fs.readdirSync(localDir)) {
      const plugin = path.join(localDir, e);
      if (path.resolve(plugin) !== path.resolve(ownTarget)) roots.push(path.join(plugin, 'skills'));
    }
  }
  const walk = (dir, depth) => { // plugin cache: any `skills` folder within a few levels
    if (depth > 6 || !isDir(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.name === 'skills') roots.push(p); else walk(p, depth + 1);
    }
  };
  walk(path.join(h, '.cursor/plugins/cache'), 0);
  const clashes = [];
  for (const root of roots) for (const name of names) if (exists(path.join(root, name))) clashes.push(path.join(root, name));
  return clashes;
}

function backupTarget(target, plugin) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  // Outside ~/.cursor/plugins/local: every folder there is loaded as a plugin, so a backup there would be a duplicate.
  const dest = path.join(home(), '.cache/gutix/cursor-backups', `${plugin}-${stamp}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(target, dest, { recursive: true, dereference: true });
  fs.rmSync(target, { recursive: true, force: true });
  return dest;
}

function installCursor(argv) {
  const { opts, positional } = parseArgs(argv, { values: ['prefix'], lists: ['project'], bools: ['replace-port'] });
  if (positional.length !== 1) throw new UsageError('install-cursor needs exactly one plugin folder');
  if (!opts.prefix || !/^[a-z0-9-]+$/.test(opts.prefix)) throw new UsageError('--prefix is required (lowercase letters, digits, dashes), e.g. --prefix gutix-');
  installCursorCopy({ folder: positional[0], prefix: opts.prefix, projects: opts.project, replacePort: opts['replace-port'] });
}

// Says what is at the Cursor target, and refuses (throws) when it is not ours and --replace-port was not given.
function checkCursorTarget(target, replacePort) {
  if (!exists(target)) return { foreign: false, previous: null };
  const generated = exists(path.join(target, MANIFEST));
  const gitCheckout = exists(path.join(target, '.git'));
  const foreign = gitCheckout || (!generated && fs.readdirSync(target).length > 0);
  if (foreign && !replacePort) {
    throw new Error(`${target} was not generated by install-cursor${gitCheckout ? ' (it is a git checkout)' : ''}. Re-run with --replace-port to back it up and replace it.`);
  }
  return { foreign, previous: generated && !foreign ? readJson(path.join(target, MANIFEST)) : null };
}

// Which skills of a plugin get a Cursor copy: all, minus the Claude-only ones that have no override.
function pickSkills(folder) {
  const overridesDir = path.join(folder, 'cursor/overrides');
  const hasOverride = (x) => exists(path.join(overridesDir, `${x}.md`));
  const all = listSkills(folder);
  const skills = all.filter((x) => !CLAUDE_ONLY.includes(x) || hasOverride(x));
  for (const f of listFiles(overridesDir, '.md')) {
    if (!all.includes(f.slice(0, -3))) process.stderr.write(`warning: cursor/overrides/${f} matches no skill, ignored\n`);
  }
  return { all, skills, skipped: all.filter((x) => !skills.includes(x)) };
}

// Writes `<destDir>/<prefix><skill>/` for each skill: real files, renamed, links rewritten, override appended.
function buildSkillCopies({ folder, meta, prefix, skills, destDir }) {
  const overridesDir = path.join(folder, 'cursor/overrides');
  const hasOverride = (x) => exists(path.join(overridesDir, `${x}.md`));
  for (const x of skills) {
    const dest = path.join(destDir, `${prefix}${x}`);
    const rewrite = (text, file) => {
      const body = rewritePluginRefs(rewriteSiblings(text, skills, prefix), meta.name, skills, prefix);
      // Only the skill's own top-level SKILL.md has the frontmatter Cursor reads.
      return file === 'SKILL.md' ? rewriteFrontmatter(body, `${prefix}${x}`) : body;
    };
    copyTree(path.join(folder, 'skills', x), dest, rewrite);
    if (hasOverride(x)) {
      const skillMd = path.join(dest, 'SKILL.md');
      const base = fs.readFileSync(skillMd, 'utf8');
      const extra = fs.readFileSync(path.join(overridesDir, `${x}.md`), 'utf8');
      fs.writeFileSync(skillMd, `${base}${base.endsWith('\n') ? '' : '\n'}\n${extra}`);
    }
  }
}

function installCursorCopy({ folder: folderArg, prefix, projects = [], replacePort = false, quiet = false }) {
  const opts = { prefix, project: projects, 'replace-port': replacePort };
  const folder = path.resolve(folderArg);
  const claudeJson = path.join(folder, '.claude-plugin/plugin.json');
  if (!exists(claudeJson)) throw new Error(`${folder} is not a Claude plugin (no .claude-plugin/plugin.json)`);
  const meta = readJson(claudeJson);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(meta.name || '')) throw new Error('plugin.json needs a simple lowercase "name"');
  if (!meta.version) throw new Error('plugin.json needs a "version"');

  const target = path.join(home(), '.cursor/plugins/local', meta.name);
  const { skills, skipped } = pickSkills(folder);

  const { foreign, previous } = checkCursorTarget(target, replacePort);

  // Build everything in a staging folder next to the target (same filesystem), and touch the target only once the
  // build has succeeded: a failure partway leaves the earlier copy as it was.
  const stage = path.join(path.dirname(target), `.${meta.name}.staging-${process.pid}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const e of fs.readdirSync(path.dirname(target))) { // leftovers of a run that was killed
    if (e.startsWith(`.${meta.name}.staging-`)) fs.rmSync(path.join(path.dirname(target), e), { recursive: true, force: true });
  }
  const agents = [];
  try {
    buildSkillCopies({ folder, meta, prefix, skills, destDir: path.join(stage, 'skills') });

    for (const dir of [path.join(folder, 'agents'), path.join(folder, 'cursor/agents')]) { // cursor/agents wins on a clash
      for (const f of listFiles(dir, '.md')) {
        fs.mkdirSync(path.join(stage, 'agents'), { recursive: true });
        fs.copyFileSync(path.join(dir, f), path.join(stage, 'agents', f));
        if (!agents.includes(f)) agents.push(f);
      }
    }

    const cursorPlugin = {
      name: meta.name,
      displayName: meta.name.charAt(0).toUpperCase() + meta.name.slice(1),
      version: meta.version,
      description: meta.description || '',
      ...(meta.author ? { author: meta.author } : {}),
      ...(meta.keywords ? { keywords: meta.keywords } : {}),
      category: 'developer-tools',
      skills: './skills/',
      ...(agents.length ? { agents: './agents/' } : {}),
    };
    fs.mkdirSync(path.join(stage, '.cursor-plugin'), { recursive: true });
    fs.writeFileSync(path.join(stage, '.cursor-plugin/plugin.json'), `${JSON.stringify(cursorPlugin, null, 2)}\n`);
    const generatedSkills = skills.map((x) => `${opts.prefix}${x}`).sort();
    fs.writeFileSync(path.join(stage, MANIFEST), `${JSON.stringify({ generator: 'gutix install-cursor', plugin: meta.name, prefix: opts.prefix, skills: generatedSkills, agents: agents.slice().sort() }, null, 2)}\n`);

    // The build worked: swap it in.
    if (foreign) process.stdout.write(`backed up ${target} to ${backupTarget(target, meta.name)}\n`);
    else if (previous) { // remove only what an earlier run generated
      for (const s of previous.skills || []) fs.rmSync(path.join(target, 'skills', s), { recursive: true, force: true });
      for (const a of previous.agents || []) fs.rmSync(path.join(target, 'agents', a), { recursive: true, force: true });
    }
    const move = (rel) => {
      fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
      fs.rmSync(path.join(target, rel), { recursive: true, force: true });
      fs.renameSync(path.join(stage, rel), path.join(target, rel));
    };
    for (const x of skills) move(path.join('skills', `${opts.prefix}${x}`));
    for (const f of agents) move(path.join('agents', f));
    move('.cursor-plugin/plugin.json');
    move(MANIFEST);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  const generatedSkills = skills.map((x) => `${opts.prefix}${x}`).sort();

  if (quiet) return;
  for (const c of findClashes({ names: generatedSkills, ownTarget: target, projects: opts.project.map((p) => path.resolve(p)) })) {
    process.stderr.write(`warning: clash, ${c} has the same name as a generated skill; Cursor may load both\n`);
  }
  process.stdout.write(`installed ${skills.length} skills of ${meta.name} ${meta.version} to ${target}${skipped.length ? ` (Claude-only, skipped: ${skipped.join(', ')})` : ''}\n`);
}

// ---- org profiles, install, update ----------------------------------------------------------------------------

const cfgDir = () => path.join(home(), '.config/gutix');
const orgsDir = () => path.join(cfgDir(), 'orgs');
const registryFile = () => path.join(cfgDir(), 'orgs.json');
const configFile = () => path.join(cfgDir(), 'config.json');
const stampFile = () => path.join(cfgDir(), 'last-update');
// GUTIX_ROOT lets tests point `update` at a fixture instead of this checkout.
const gutixRoot = () => path.resolve(process.env.GUTIX_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const ORG_NAME = /^[a-z0-9][a-z0-9-]*$/;
const note = (m) => process.stdout.write(`${m}\n`);
const warn = (m) => process.stderr.write(`warning: ${m}\n`);

function readRegistry() {
  if (!exists(registryFile())) return { orgs: [] };
  const reg = readJson(registryFile());
  if (!Array.isArray(reg.orgs)) throw new Error(`${registryFile()} has no "orgs" list`);
  return reg;
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function readConfig() {
  try { return readJson(configFile()); } catch { return {}; }
}

function git(args, { cwd, timeout = 120000 } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'],
    // Never prompt: not for HTTPS credentials, and not for an ssh passphrase (it would block on /dev/tty).
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes' } });
  const err = (r.error ? r.error.message : r.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' ');
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err };
}

function pluginName(folder) {
  try { return readJson(path.join(folder, '.claude-plugin/plugin.json')).name; } catch { return null; }
}

function linkOrg({ url, branch, cursor = true, projects = [], projectsRoots = [], replacePort = false }) {
  if (!url) throw new UsageError('link-org needs the org repo link, e.g. https://github.com/<org>/<repo>');
  fs.mkdirSync(orgsDir(), { recursive: true });
  const tmp = path.join(orgsDir(), `.clone-${process.pid}-${Date.now()}`);
  const clone = git(['clone', '--quiet', ...(branch ? ['--branch', branch] : []), '--', url, tmp]);
  if (!clone.ok) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error(`could not clone ${url}${branch ? ` (branch ${branch})` : ''}: ${clone.err}`); }
  try {
    if (!exists(path.join(tmp, 'gutix-org.json'))) throw new Error('that repo has no gutix-org.json at its root, so it is not an org profile (gutix new-org writes one)');
    const profile = readJson(path.join(tmp, 'gutix-org.json'));
    if (!ORG_NAME.test(profile.name || '')) throw new Error('gutix-org.json needs a "name" of lowercase letters, digits and dashes');
    const isPlugin = exists(path.join(tmp, '.claude-plugin/plugin.json'));
    // Refuse before recording anything, so a retry with --replace-port is not met by "already linked".
    if (isPlugin && cursor && pluginName(tmp)) checkCursorTarget(path.join(home(), '.cursor/plugins/local', pluginName(tmp)), replacePort);
    const scoped = isScoped(tmp, profile);
    if (scoped && cursor && !/^[a-z0-9][a-z0-9._-]*$/.test(pluginName(tmp) || '')) throw new Error('plugin.json needs a simple lowercase "name"');
    const reg = readRegistry();
    const dest = path.join(orgsDir(), profile.name);
    if (exists(dest) || reg.orgs.some((o) => o.name === profile.name)) throw new Error(`org "${profile.name}" is already linked; run gutix update to pull it`);
    fs.renameSync(tmp, dest);
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dest }).out;
    reg.orgs.push({ name: profile.name, path: dest, git: url, ...(branch || current ? { branch: branch || current } : {}) });
    writeJson(registryFile(), reg);
    note(`linked org ${profile.name} at ${dest}`);
    if (isPlugin && cursor && scoped) {
      const entry = reg.orgs[reg.orgs.length - 1];
      sweepOrg(entry, { roots: projectsRoots, replacePort });
      writeJson(registryFile(), reg);
      for (const c of findClashes({ names: pickSkills(dest).skills.map((x) => `${entry.prefix}${x}`), ownTarget: path.join(home(), '.cursor/plugins/local', pluginName(dest)), projects: [] })) warn(`clash, ${c} has the same name as a generated skill; Cursor may load both`);
    } else if (isPlugin && cursor) { sweepOrg(reg.orgs[reg.orgs.length - 1]); }
    else if (!isPlugin) note(`${profile.name} is a profile only (no .claude-plugin/plugin.json), so there is no Cursor copy`);
    if (!scoped && exists(path.join(dest, '.claude-plugin/marketplace.json'))) note(`Claude Code: /plugin marketplace add ${url}${branch ? `#${branch}` : ''}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- org plugins scoped to their repos ------------------------------------------------------------------------
// An org plugin (a plugin whose profile has `match`) is copied into `<repo>/.cursor/skills/<prefix><skill>/` of every
// clone whose origin matches, and hidden from git through that repo's info/exclude. Nothing is written globally.

const GENERATED = '.gutix-generated'; // marker inside each generated skill folder: only marked folders are ever replaced or removed
const defaultRoots = () => [path.join(home(), 'projects')];
const excludeLine = (prefix) => `.cursor/skills/${prefix}*/`;
const rmdirIfEmpty = (d) => { try { fs.rmdirSync(d); } catch { /* not empty or gone */ } };

// Clones under the roots, two levels deep: <root>/<repo> and <root>/<group>/<repo>. A clone is never searched for more
// clones; dot folders (.claude/worktrees among them) and node_modules are skipped.
function findOrgRepos(roots, match) {
  const found = new Set();
  const consider = (dir) => {
    if (!exists(path.join(dir, '.git'))) return false;
    const remote = normalizeRemote(remoteOf(dir));
    if (remote && match.some((m) => prefixMatches(remote, m))) found.add(fs.realpathSync(dir));
    return true;
  };
  const walk = (dir, depth) => {
    if (consider(dir) || depth >= 2) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (isDir(p)) walk(p, depth + 1);
    }
  };
  for (const r of roots) { if (isDir(r)) walk(r, 0); else warn(`projects root ${r} does not exist, skipped`); }
  return [...found].sort();
}

function excludeFile(repo) {
  const r = git(['rev-parse', '--git-path', 'info/exclude'], { cwd: repo });
  if (!r.ok || !r.out) throw new Error('could not locate the repo\'s info/exclude');
  return path.resolve(repo, r.out);
}

// Adds the line to info/exclude if it is not there. Returns what is needed to put the file back as it was.
function addExclude(file, line) {
  const had = exists(file);
  const text = had ? fs.readFileSync(file, 'utf8') : '';
  if (text.split('\n').includes(line)) return { added: false };
  const noEol = text !== '' && !text.endsWith('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}${noEol ? '\n' : ''}${line}\n`);
  return { added: true, created: !had, noEol };
}
function removeExclude(file, line, { created, noEol }) {
  if (!exists(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const i = lines.indexOf(line);
  if (i < 0) return;
  lines.splice(i, 1);
  let text = lines.join('\n');
  if (noEol && text.endsWith('\n')) text = text.slice(0, -1);
  if (created && text.trim() === '') fs.rmSync(file, { force: true }); else fs.writeFileSync(file, text);
}

// Puts the staged skill folders into one repo. Nothing in the repo changes until every copy is staged; a folder that
// carries our marker is replaced, one that does not is somebody else's and stops this repo.
function installIntoRepo({ repo, staged, skills, prefix, prev }) {
  const skillsDir = path.join(repo, '.cursor/skills');
  for (const s of skills) {
    const t = path.join(skillsDir, s);
    if (exists(t) && !exists(path.join(t, GENERATED))) throw new Error(`${t} exists and was not generated by gutix; left alone`);
  }
  const state = prev ? { ...prev } : { cursorCreated: !exists(path.join(repo, '.cursor')), skillsDirCreated: !exists(skillsDir) };
  const line = excludeLine(prefix);
  const file = excludeFile(repo);
  const ex = addExclude(file, line); // before any file lands, so git never sees one
  if (ex.added) Object.assign(state, { excludeAdded: true, excludeCreated: ex.created, excludeNoEol: ex.noEol });
  const stage = path.join(skillsDir, `${prefix}.staging-${process.pid}`); // covered by the exclude pattern
  fs.mkdirSync(skillsDir, { recursive: true });
  try {
    for (const s of skills) {
      copyTree(path.join(staged, s), path.join(stage, s), (t) => t);
      fs.writeFileSync(path.join(stage, s, GENERATED), `${JSON.stringify({ generator: 'gutix' })}\n`);
    }
    for (const old of prev?.skills || []) if (!skills.includes(old) && exists(path.join(skillsDir, old, GENERATED))) fs.rmSync(path.join(skillsDir, old), { recursive: true, force: true });
    for (const s of skills) {
      fs.rmSync(path.join(skillsDir, s), { recursive: true, force: true });
      fs.renameSync(path.join(stage, s), path.join(skillsDir, s));
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return { path: repo, skills: skills.slice(), ...Object.fromEntries(Object.entries(state).filter(([k]) => k !== 'path' && k !== 'skills')) };
}

function removeFromRepo(state, prefix) {
  for (const s of state.skills || []) {
    const t = path.join(state.path, '.cursor/skills', s);
    if (exists(path.join(t, GENERATED))) fs.rmSync(t, { recursive: true, force: true });
  }
  if (state.excludeAdded) { try { removeExclude(excludeFile(state.path), excludeLine(prefix), { created: state.excludeCreated, noEol: state.excludeNoEol }); } catch (e) { warn(`${state.path}: ${e.message}`); } }
  if (state.skillsDirCreated) rmdirIfEmpty(path.join(state.path, '.cursor/skills'));
  if (state.cursorCreated) rmdirIfEmpty(path.join(state.path, '.cursor'));
}

const isScoped = (folder, profile) => exists(path.join(folder, '.claude-plugin/plugin.json')) && Array.isArray(profile.match) && profile.match.length > 0;

// The global copy an earlier link-org left (recognised by our manifest): backed up, then removed.
function retireGlobalCopy(plugin, say) {
  const target = path.join(home(), '.cursor/plugins/local', plugin);
  if (exists(path.join(target, MANIFEST)) && !exists(path.join(target, '.git'))) say(`removed the global copy of ${plugin} (backup: ${backupTarget(target, plugin)}); it now loads only in its repos`);
}

// Regenerates an org plugin's copies in every matching clone. Mutates the registry entry; the caller saves it.
function sweepOrg(entry, { roots, quiet = false, replacePort = false } = {}) {
  const say = quiet ? () => {} : note;
  const profile = readJson(path.join(entry.path, 'gutix-org.json'));
  if (!isScoped(entry.path, profile)) {
    if (exists(path.join(entry.path, '.claude-plugin/plugin.json'))) warn(`${entry.name}: gutix-org.json has no "match", so there is nowhere to scope the plugin; nothing was copied`);
    return;
  }
  const meta = readJson(path.join(entry.path, '.claude-plugin/plugin.json'));
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(meta.name || '')) throw new Error('plugin.json needs a simple lowercase "name"');
  const prefix = entry.prefix || `${entry.name}-`;
  if (roots?.length) entry.projectsRoots = roots.map((r) => path.resolve(r));
  const useRoots = entry.projectsRoots?.length ? entry.projectsRoots : defaultRoots();
  const matches = findOrgRepos(useRoots, profile.match);
  const { skills } = pickSkills(entry.path);
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'gutix-sweep-'));
  const prevByPath = new Map((entry.repos || []).map((r) => [r.path, r]));
  const repos = [];
  try {
    buildSkillCopies({ folder: entry.path, meta, prefix, skills, destDir: staged });
    for (const repo of matches) {
      try {
        repos.push(installIntoRepo({ repo, staged, skills: skills.map((x) => `${prefix}${x}`), prefix, prev: prevByPath.get(repo) }));
        say(`${entry.name}: ${skills.length} skills in ${repo}/.cursor/skills`);
      } catch (e) { warn(`${entry.name}: ${repo}: ${e.message}`); if (prevByPath.has(repo)) repos.push(prevByPath.get(repo)); }
    }
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  for (const [p, st] of prevByPath) {
    if (!matches.includes(p)) { warn(`${entry.name}: ${p} no longer matches or is gone; its copy is left as it is (gutix unlink-org removes it)`); repos.push(st); }
  }
  if (!repos.length) warn(`${entry.name}: no clone under ${useRoots.join(', ')} has an origin that matches ${profile.match.join(', ')}; any earlier global copy is kept. Point gutix at your clones with --projects-root <dir>`);
  Object.assign(entry, { prefix, cursor: 'repos', repos });
  const target = path.join(home(), '.cursor/plugins/local', meta.name);
  if (replacePort && exists(target) && !exists(path.join(target, MANIFEST))) say(`backed up ${target} to ${backupTarget(target, meta.name)}`);
  if (repos.length) retireGlobalCopy(meta.name, say); // never take the skills away before they are somewhere else
}

function unlinkOrg(name) {
  if (!name) throw new UsageError('unlink-org needs the org name');
  const reg = readRegistry();
  const entry = reg.orgs.find((o) => o.name === name);
  if (!entry) throw new Error(`org "${name}" is not linked`);
  const prefix = entry.prefix || `${entry.name}-`;
  for (const st of entry.repos || []) {
    if (isDir(st.path)) { removeFromRepo(st, prefix); note(`${name}: removed from ${st.path}`); } else note(`${name}: ${st.path} is gone, nothing to remove`);
  }
  const plugin = pluginName(entry.path);
  const manifest = plugin && path.join(home(), '.cursor/plugins/local', plugin, MANIFEST);
  if (manifest && exists(manifest)) {
    const dir = path.dirname(manifest);
    for (const s of readJson(manifest).skills || []) fs.rmSync(path.join(dir, 'skills', s), { recursive: true, force: true });
    for (const a of readJson(manifest).agents || []) fs.rmSync(path.join(dir, 'agents', a), { recursive: true, force: true });
    for (const f of [path.join('.cursor-plugin/plugin.json'), MANIFEST]) fs.rmSync(path.join(dir, f), { force: true });
    for (const d of ['.cursor-plugin', 'skills', 'agents']) rmdirIfEmpty(path.join(dir, d));
    rmdirIfEmpty(dir);
  }
  reg.orgs = reg.orgs.filter((o) => o !== entry);
  writeJson(registryFile(), reg);
  // Only a clone with nothing to lose is deleted: no local edits, and every commit is on its upstream (none upstream: kept).
  const nothingToLose = () => git(['status', '--porcelain'], { cwd: entry.path }).out === ''
    && git(['rev-parse', '--abbrev-ref', '@{u}'], { cwd: entry.path }).ok
    && git(['rev-list', '--count', '@{u}..HEAD'], { cwd: entry.path }).out === '0';
  const cloned = entry.git && path.dirname(path.resolve(entry.path)) === orgsDir() && isDir(entry.path) && nothingToLose();
  if (cloned) { fs.rmSync(entry.path, { recursive: true, force: true }); note(`unlinked org ${name}`); } else note(`unlinked org ${name}; its folder ${entry.path} was kept`);
}

function newOrg(name) {
  if (!ORG_NAME.test(name || '')) throw new UsageError('new-org needs a name of lowercase letters, digits and dashes, e.g. acme');
  const dest = path.join(orgsDir(), name);
  const reg = readRegistry();
  if ((exists(dest) && fs.readdirSync(dest).length > 0) || reg.orgs.some((o) => o.name === name)) {
    throw new Error(`org "${name}" already exists at ${dest}; not overwriting`);
  }
  const skeleton = path.join(path.dirname(fileURLToPath(import.meta.url)), 'org-skeleton');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(skeleton)) {
    fs.writeFileSync(path.join(dest, f), fs.readFileSync(path.join(skeleton, f), 'utf8').replaceAll('{{name}}', name));
  }
  reg.orgs.push({ name, path: dest });
  writeJson(registryFile(), reg);
  note(`created ${dest}: edit "match" in gutix-org.json and the colors in theme.css (README.md explains each file)`);
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Atomic check-and-write for the daily run: whichever session creates today's claim file first does the update, the
// others (two sessions starting at once) skip it. Claims of earlier days are removed. Never throws, never waits.
function claimToday() {
  const prefix = 'last-update.claim-';
  const mine = `${prefix}${today()}`;
  try {
    for (const f of fs.readdirSync(cfgDir())) if (f.startsWith(prefix) && f !== mine) fs.rmSync(path.join(cfgDir(), f), { force: true });
    fs.closeSync(fs.openSync(path.join(cfgDir(), mine), 'wx'));
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    warn(`update: could not record the daily claim (${e.message})`); // carry on: better a repeat than a skipped update
  }
  try { fs.writeFileSync(stampFile(), `${today()}\n`); } catch (e) { warn(`update: ${e.message}`); }
  return true;
}

// Pulls gutix and every linked org, then regenerates the Cursor copies that exist. Never throws: a session must not fail.
function update({ daily = false, ifOptedIn = false } = {}) {
  const say = daily ? () => {} : note; // daily runs print nothing on stdout: a SessionStart hook's stdout becomes context
  try {
    if (ifOptedIn && readConfig().autoUpdate !== 'daily') return;
    if (daily && exists(stampFile()) && fs.readFileSync(stampFile(), 'utf8').trim() === today()) return;
    // Claim the day before any pull: the hook is killed after 60 s, and a run that never reached the end must not
    // make every later session start wait again. A failed pull counts as done for the day.
    fs.mkdirSync(cfgDir(), { recursive: true });
    if (daily && !claimToday()) return;
    const targets = [{ name: 'gutix', dir: gutixRoot() }];
    let reg = { orgs: [] };
    try { reg = readRegistry(); for (const o of reg.orgs) targets.push({ name: o.name, dir: o.path, entry: o }); } catch (e) { warn(e.message); }
    for (const t of targets) {
      try {
        if (!isDir(t.dir)) { warn(`${t.name}: ${t.dir} is missing, skipped`); continue; }
        if (exists(path.join(t.dir, '.git'))) {
          const pull = git(['pull', '--ff-only', '--quiet'], { cwd: t.dir, timeout: daily ? 20000 : 120000 });
          if (pull.ok) say(`${t.name}: pulled`); else warn(`${t.name}: could not pull (${pull.err || 'git failed'}); keeping what is here`);
        } else say(`${t.name}: not a git checkout, pull skipped`);
        const plugin = pluginName(t.dir);
        const manifest = plugin && path.join(home(), '.cursor/plugins/local', plugin, MANIFEST);
        let profile = {};
        if (t.entry) { try { profile = readJson(path.join(t.dir, 'gutix-org.json')); } catch { /* sweepOrg reports it */ } }
        if (t.entry && isScoped(t.dir, profile)) {
          // Also migrates an org linked before copies were scoped: its generated global copy counts as opted in.
          if (t.entry.cursor === 'repos' || (manifest && exists(manifest))) { sweepOrg(t.entry, { quiet: daily }); writeJson(registryFile(), reg); }
        } else if (manifest && exists(manifest)) installCursorCopy({ folder: t.dir, prefix: readJson(manifest).prefix, quiet: daily });
      } catch (e) { warn(`${t.name}: ${e.message}`); }
    }
  } catch (e) { warn(`update: ${e.message}`); }
}

async function install(argv) {
  const { opts } = parseArgs(argv, {
    values: ['org', 'branch', 'skeleton', 'auto-update'], lists: ['project', 'projects-root'],
    bools: ['cursor', 'no-cursor', 'no-org', 'no-skeleton', 'replace-port', 'yes'],
  });
  const interactive = Boolean(process.stdin.isTTY) && !opts.yes;
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  // Without a terminal an unanswered question means "no" (or "skip"), never the interactive default.
  const ask = async (question, def, silent = '') => {
    if (!rl) return silent;
    const a = (await rl.question(`${question} `)).trim();
    return a === '' ? def : a;
  };
  const yes = (a) => /^y/i.test(String(a));
  try {
    const wantCursor = opts.cursor ? true : opts['no-cursor'] ? false : yes(await ask('Make a Cursor copy of gutix? [Y/n]', 'y', 'n'));
    if (wantCursor) installCursorCopy({ folder: gutixRoot(), prefix: 'gutix-', projects: opts.project, replacePort: opts['replace-port'] });

    let orgUrl = opts['no-org'] ? '' : opts.org;
    let branch = opts.branch;
    if (orgUrl === undefined) {
      orgUrl = await ask("Link your company's org plugin? Paste its git link (https://github.com/<org>/<repo>) or press Enter to skip:", '');
      if (orgUrl && branch === undefined) branch = (await ask('Branch to follow (Enter for the default branch):', '')) || undefined;
    }
    if (orgUrl) linkOrg({ url: orgUrl, branch, cursor: wantCursor, projects: opts.project, projectsRoots: opts['projects-root'], replacePort: opts['replace-port'] });
    else {
      const skeleton = opts['no-skeleton'] ? '' : opts.skeleton ?? await ask('Create a personal org profile for your own theme? Enter a name (e.g. acme) or press Enter to skip:', '');
      if (skeleton) newOrg(skeleton);
    }

    const auto = opts['auto-update'] ?? (await ask('Update gutix and your orgs automatically, once a day, when a Claude Code session starts? [y/N]', readConfig().autoUpdate === 'daily' ? 'y' : 'n', readConfig().autoUpdate === 'daily' ? 'y' : 'n'));
    const mode = auto === 'daily' || yes(auto) ? 'daily' : 'off';
    writeJson(configFile(), { ...readConfig(), autoUpdate: mode });
    note(`auto-update: ${mode}`);
    note(`To update later: ${path.join(path.dirname(fileURLToPath(import.meta.url)), 'gutix-update')}`);
  } finally {
    rl?.close();
  }
}

// ---- dispatch ------------------------------------------------------------------------------------------------

const COMMANDS = {
  'install-cursor': { run: installCursor, usage: 'install-cursor <plugin-folder> --prefix <p> [--project <dir>]... [--replace-port]' },
  install: { run: install, usage: 'install [--cursor|--no-cursor] [--org <git-url> [--branch <b>] | --no-org] [--skeleton <name> | --no-skeleton] [--auto-update daily|off] [--project <dir>]... [--projects-root <dir>]... [--replace-port] [--yes]' },
  'link-org': {
    run: (argv) => {
      const { opts, positional } = parseArgs(argv, { values: ['branch'], lists: ['project', 'projects-root'], bools: ['no-cursor', 'replace-port', 'remove'] });
      if (positional.length !== 1) throw new UsageError(opts.remove ? 'link-org --remove needs exactly one org name' : 'link-org needs exactly one git link');
      if (opts.remove) return unlinkOrg(positional[0]);
      linkOrg({ url: positional[0], branch: opts.branch, cursor: !opts['no-cursor'], projects: opts.project, projectsRoots: opts['projects-root'], replacePort: opts['replace-port'] });
    },
    usage: 'link-org <git-url> [--branch <b>] [--no-cursor] [--projects-root <dir>]... [--project <dir>]... | link-org --remove <name>',
  },
  'unlink-org': {
    run: (argv) => {
      const { positional } = parseArgs(argv, {});
      if (positional.length !== 1) throw new UsageError('unlink-org needs exactly one org name');
      unlinkOrg(positional[0]);
    },
    usage: 'unlink-org <name>',
  },
  'new-org': {
    run: (argv) => {
      const { positional } = parseArgs(argv, {});
      if (positional.length !== 1) throw new UsageError('new-org needs exactly one name');
      newOrg(positional[0]);
    },
    usage: 'new-org <name>',
  },
  update: {
    run: (argv) => {
      const { opts } = parseArgs(argv, { bools: ['daily', 'if-opted-in'] });
      update({ daily: opts.daily, ifOptedIn: opts['if-opted-in'] });
    },
    usage: 'update [--daily] [--if-opted-in]',
  },
};

async function main(argv) {
  const [cmd, ...rest] = argv;
  const entry = COMMANDS[cmd];
  if (!entry) {
    process.stderr.write(`usage:\n${Object.values(COMMANDS).map((c) => `  gutix.mjs ${c.usage}`).join('\n')}\n`);
    return cmd && cmd !== '--help' && cmd !== 'help' ? 2 : 0;
  }
  try {
    await entry.run(rest);
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    if (e instanceof UsageError) process.stderr.write(`usage: gutix.mjs ${entry.usage}\n`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
