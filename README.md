# gutix

Engineering workflows as skills for Claude Code, with a generated copy for Cursor: turn a requirement into a plan,
build it in short sessions, review and verify it, and write up the design. They are opinionated, built for one
person's daily work, and shared as they are.

**Needs:** git, Node.js 22 or newer, and Google Chrome or Chromium for the skills that render pages (`design-doc`,
`deck`, `ui-evidence`). macOS and Linux.

| Skill | What it does |
| --- | --- |
| `gutix:triage` | Entry point when the kind or next step is unclear: classifies (bug, feature, product decision), weighs impact, proposes options, records decisions (`docs/decisions/`, review invariants) and hands off. Fast path for clear small bugs. |
| `gutix:feature-intake` | Turns a requirement into a plan in the repo: challenge, blast radius, a roadmap with contracts and one task file per unit with executable acceptance criteria. Planning only; questions or ops work outside the plan go to a new session. `mode=refinement` turns an epic into a team refinement doc and tracker stories, for the team in the org profile. |
| `gutix:ship` | Builds the plan in short fresh sessions: `dispatch` (one Sonnet worker per ready task), `integrate` (task PRs squashed into `release/<slug>-p<n>`), `release` (e2e label + pr-review in parallel, merge commit, then archive sessions, delete branches, stop servers), `handoff` (published, in flight, next steps with the prompt to paste) and `status`. |
| `gutix:bug-fix` | Red test first, root cause, same pattern elsewhere, fix, production data check, close the gap. |
| `gutix:sign-off` | Catches you up on a release or PR: expected vs built, the agents' decisions, the hunks to read, what the checks don't prove. Brief by default and records nothing; `mode=gate` adds a graded quiz when you ask for it. Never a merge condition. |
| `gutix:pr-review` | Reviews a PR with one reviewer or a panel of up to 4 by risk area, verifies every finding (critical/high with a failing test), consolidates one ranked list, and fixes the approved ones test-first. Maps the blast radius itself, records the reviewed sha and skips what is already reviewed; reviewers write their reports to `.review/<sha>/` and hand back short summaries. |
| `gutix:peer-review` | Reviews a teammate's PR in a throwaway worktree with hard cost limits: design, complexity, security, concurrency, contracts and repo rules, at most ~10 ranked comments in a kind, questioning tone, and a map of what to read yourself. Shows everything in the chat and posts one review only after your OK; re-reviews only the delta. |
| `gutix:verify` | Runs the checks that prove a change works and reports each as passed, failed or not run. Keeps the repo's recipe in `.claude/verify.md` so no session rediscovers how to build and test. Lint and type checks are compared with the base branch, so only the diagnostics your change adds count. |
| `gutix:live-data-change` | Changes data in a live PostgreSQL without blocking it: generated dry-run and apply files, index-only access proven by a plan test, batches with commits, lock and statement timeouts, `ON_ERROR_STOP` for pipelines, verification queries; and the delta + recomputed-projection design that keeps such changes cheap. |
| `gutix:learn` | Turns mistakes that repeat into safeguards that run (test, lint rule, review invariant, recipe line), prunes stale instructions; persists only with evidence and the user's yes. |
| `gutix:design-doc` | Writes a design doc from decisions already taken: an HTML for people (browser, PDF) with inline SVG diagrams and a generated `<name>.llm.md` twin that agents read at about a third of the tokens. Writer and diagram subagents (the diagram author starts from one of eight templates and a theme-driven SVG kit, `draw.mjs`), a contradictions review against the code, a checker (`check-doc.mjs`), and routing (first-line pointer, `AGENTS.md` line, `extract-llm.mjs --check`). |
| `gutix:deck` | Builds a self-contained HTML slide deck that explains a technical flow or change, researched fresh from the repo (code over config over ticket, every number tagged read, inferred or measured), in the org's theme, and exports it to PDF with the shared renderer. |
| `gutix:ui-evidence` | Proves a UI change with screenshots: tours the screens on mobile and desktop before and after, measures the primary CTA, and composes BEFORE \| AFTER images to attach to a ticket or PR. |
| `gutix:e2e-add-check` | Adds a check to a user-facing flow in the org's e2e suite starting from what exists: reads the suite's catalog, picks the fixture, helper and tag, extends the spec of that flow (a new spec only for a new flow), keeps data to the test's own people, and runs only the affected tag through the runner. |

## Install

### Claude Code

Two marketplaces: gutix, and your company's org plugin if it has one. Each is added once and updates on its own.

```bash
claude plugin marketplace add GutiNicolas/gutix
claude plugin install gutix@gutix
# the org's plugin, if your team has one (add #<branch> when it works on a branch other than the default):
claude plugin marketplace add <org>/<repo>#<branch>
```

- An org plugin's repo is often private: git must be able to use your credentials for it (`gh auth setup-git`).
- Auto-update is per marketplace and off by default: turn it on in `/plugin`, under Marketplaces.
- Working on gutix itself: `claude plugin marketplace add ~/projects/gutix`. After editing a skill, bump `version` in
  `.claude-plugin/plugin.json` and `marketplace.json`, then `claude plugin update gutix@gutix` and restart Claude Code.

### Cursor

Cursor gets a generated copy of the skills (names prefixed `gutix-`), not a second port to maintain.

```bash
git clone https://github.com/GutiNicolas/gutix.git ~/projects/gutix
~/projects/gutix/scripts/install.sh
```

`install.sh` asks whether to make the Cursor copy, whether to link your company's org (it asks for the repo link,
`https://github.com/<org>/<repo>`, and a branch), and, without an org, whether to create a personal profile for your own
theme. It can also turn on the daily update. Every question has a flag, so it runs unattended too:
`install.sh --cursor --no-org --no-skeleton --auto-update off`.

- `--replace-port` replaces an older hand-made copy that is a git checkout in `~/.cursor/plugins/local/`, after
  backing it up to `~/.cache/gutix/cursor-backups/`. Without it the installer refuses to touch that folder.
- `--project <dir>` (repeatable) adds a project folder to the clash check. The installer warns when another skill with
  the same name is already loaded from `~/.cursor`, `~/.agents`, `~/.claude`, `~/.codex`, other local or cached
  plugins, or those project folders.
- Plugins other than gutix: `scripts/gutix.mjs install-cursor <plugin-folder> --prefix <p>-`.

### Org profiles

An org profile holds a company's own settings (theme, language, where documents are published). gutix looks for it by
comparing a repo's `origin` with the profile's `match`; the order is the repo's own files, then the profile, then
gutix's defaults.

```bash
scripts/gutix.mjs link-org <git-url> [--branch <b>] [--projects-root <dir>]...   # clone an org repo, copy it into its repos, record it
scripts/gutix.mjs unlink-org <name>                   # undo that: remove the copies and the exclude lines (link-org --remove <name> does the same)
scripts/gutix.mjs new-org <name>                      # or start a personal profile in ~/.config/gutix/orgs/<name>/
```

#### An org plugin loads only in its org's repos

An org that is also a plugin (it has `.claude-plugin/plugin.json` and its profile has `match`) is never installed
globally, and not in Claude. In Cursor its skills are copied into `<repo>/.cursor/skills/<prefix><skill>/` of each clone
whose `origin` matches the profile, so outside those repos none of its skills or descriptions load.

- **Which clones:** git clones under your projects root, `~/projects` by default (`--projects-root <dir>`, repeatable;
  gutix remembers it). It looks two folders deep and skips hidden folders and `node_modules`.
- **Nothing is committed:** gutix adds one line per generated skill (`.cursor/skills/<prefix><skill>/`) to the repo's
  `.git/info/exclude`, never to a tracked `.gitignore`, so a skill a teammate adds by hand stays visible to git. A folder
  in `.cursor/skills/` that gutix did not generate is never overwritten.
- **Keeping it current:** the update re-runs this: new matching clones get the plugin, and a clone that no longer
  matches or is gone is reported and left as it is. `unlink-org` removes the copies and the lines it added.
- **If you linked an org before this:** the next update removes its global copy (backed up to
  `~/.cache/gutix/cursor-backups/`) and copies it into the matching clones.
- An org plugin whose profile has no `match` is not copied anywhere: add the `match` first.

### Update

```bash
~/projects/gutix/scripts/gutix-update
```

Pulls gutix and every linked org, then regenerates the Cursor copies (an org plugin's in each matching clone). For an automatic daily update, answer yes to the
install question, or put `{"autoUpdate": "daily"}` in `~/.config/gutix/config.json`: a Claude Code `SessionStart` hook
then runs it at most once a day, silently, and never fails the session. Without that setting the hook does nothing.
Cursor has no equivalent wired in, so there the update stays manual.

## Flow

triage → bug-fix | feature-intake → ship (dispatch → workers → integrate → release: pr-review + e2e → merge →
clean up) (findings → bug-fix; new product rules → triage). `sign-off` whenever you want to catch up; `ship handoff`
before a break or a fresh session.

A teammate's PR → peer-review → your confirmation → one review.

Supporting skills: `verify` before calling anything done, `learn` when a mistake repeats, `design-doc` when a decided
design needs writing up.

Per-repo files the skills maintain: `.claude/verify.md` (how to build and test), `.claude/review.md` (invariants,
accepted risks and human-read paths). Feature plans start from `skills/feature-intake/templates/` (roadmap, task,
worker brief). Why sign-off exists and the bar it holds: [PRINCIPLES.md](docs/features/human-ownership/PRINCIPLES.md).

Decision records: `docs/decisions/` in the repo for one product, in the infra repo (named in the global
`CLAUDE.md`) for decisions across products.
