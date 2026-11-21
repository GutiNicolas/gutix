#!/usr/bin/env node
// gutix CLI. Node built-ins only; macOS and Linux. One subcommand per entry in COMMANDS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
  const folder = path.resolve(positional[0]);
  const claudeJson = path.join(folder, '.claude-plugin/plugin.json');
  if (!exists(claudeJson)) throw new Error(`${folder} is not a Claude plugin (no .claude-plugin/plugin.json)`);
  const meta = readJson(claudeJson);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(meta.name || '')) throw new Error('plugin.json needs a simple lowercase "name"');
  if (!meta.version) throw new Error('plugin.json needs a "version"');

  const target = path.join(home(), '.cursor/plugins/local', meta.name);
  const overridesDir = path.join(folder, 'cursor/overrides');
  const hasOverride = (x) => exists(path.join(overridesDir, `${x}.md`));
  const all = listSkills(folder);
  const skills = all.filter((x) => !CLAUDE_ONLY.includes(x) || hasOverride(x));
  const skipped = all.filter((x) => !skills.includes(x));
  for (const f of listFiles(overridesDir, '.md')) {
    if (!all.includes(f.slice(0, -3))) process.stderr.write(`warning: cursor/overrides/${f} matches no skill, ignored\n`);
  }

  if (exists(target)) {
    const generated = exists(path.join(target, MANIFEST));
    const gitCheckout = exists(path.join(target, '.git'));
    const foreign = gitCheckout || (!generated && fs.readdirSync(target).length > 0);
    if (foreign && !opts['replace-port']) {
      throw new Error(`${target} was not generated by install-cursor${gitCheckout ? ' (it is a git checkout)' : ''}. Re-run with --replace-port to back it up and replace it.`);
    }
    if (foreign) process.stdout.write(`backed up ${target} to ${backupTarget(target, meta.name)}\n`);
    else if (generated) { // remove only what an earlier run generated
      const prev = readJson(path.join(target, MANIFEST));
      for (const s of prev.skills || []) fs.rmSync(path.join(target, 'skills', s), { recursive: true, force: true });
      for (const a of prev.agents || []) fs.rmSync(path.join(target, 'agents', a), { recursive: true, force: true });
    }
  }

  const siblings = skills.slice();
  for (const x of skills) {
    const dest = path.join(target, 'skills', `${opts.prefix}${x}`);
    const rewrite = (text, file) => {
      const body = rewriteSiblings(text, siblings, opts.prefix);
      // Only the skill's own top-level SKILL.md has the frontmatter Cursor reads.
      return file === 'SKILL.md' ? rewriteFrontmatter(body, `${opts.prefix}${x}`) : body;
    };
    copyTree(path.join(folder, 'skills', x), dest, rewrite);
    if (hasOverride(x)) {
      const skillMd = path.join(dest, 'SKILL.md');
      const base = fs.readFileSync(skillMd, 'utf8');
      const extra = fs.readFileSync(path.join(overridesDir, `${x}.md`), 'utf8');
      fs.writeFileSync(skillMd, `${base}${base.endsWith('\n') ? '' : '\n'}\n${extra}`);
    }
  }

  const agents = [];
  for (const dir of [path.join(folder, 'agents'), path.join(folder, 'cursor/agents')]) { // cursor/agents wins on a clash
    for (const f of listFiles(dir, '.md')) {
      fs.mkdirSync(path.join(target, 'agents'), { recursive: true });
      fs.copyFileSync(path.join(dir, f), path.join(target, 'agents', f));
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
  fs.mkdirSync(path.join(target, '.cursor-plugin'), { recursive: true });
  fs.writeFileSync(path.join(target, '.cursor-plugin/plugin.json'), `${JSON.stringify(cursorPlugin, null, 2)}\n`);
  const generatedSkills = skills.map((x) => `${opts.prefix}${x}`).sort();
  fs.writeFileSync(path.join(target, MANIFEST), `${JSON.stringify({ generator: 'gutix install-cursor', plugin: meta.name, prefix: opts.prefix, skills: generatedSkills, agents: agents.slice().sort() }, null, 2)}\n`);

  for (const c of findClashes({ names: generatedSkills, ownTarget: target, projects: opts.project.map((p) => path.resolve(p)) })) {
    process.stderr.write(`warning: clash, ${c} has the same name as a generated skill; Cursor may load both\n`);
  }
  process.stdout.write(`installed ${skills.length} skills of ${meta.name} ${meta.version} to ${target}${skipped.length ? ` (Claude-only, skipped: ${skipped.join(', ')})` : ''}\n`);
}

// ---- dispatch ------------------------------------------------------------------------------------------------

const COMMANDS = {
  'install-cursor': { run: installCursor, usage: 'install-cursor <plugin-folder> --prefix <p> [--project <dir>]... [--replace-port]' },
};

function main(argv) {
  const [cmd, ...rest] = argv;
  const entry = COMMANDS[cmd];
  if (!entry) {
    process.stderr.write(`usage:\n${Object.values(COMMANDS).map((c) => `  gutix.mjs ${c.usage}`).join('\n')}\n`);
    return cmd && cmd !== '--help' && cmd !== 'help' ? 2 : 0;
  }
  try {
    entry.run(rest);
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    if (e instanceof UsageError) process.stderr.write(`usage: gutix.mjs ${entry.usage}\n`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
