# gutix

Claude Code plugin with Nicolas' engineering workflows.

| Skill | What it does |
| --- | --- |
| `gutix:triage` | Entry point when the kind or next step is unclear: classifies (bug, feature, product decision), weighs impact, proposes options, records decisions (`docs/decisions/`, review invariants) and hands off. Fast path for clear small bugs. |
| `gutix:feature-intake` | Turns a requirement into a plan in the repo: challenge, blast radius, a roadmap with contracts and one task file per unit with executable acceptance criteria. Planning only; questions or ops work outside the plan go to a new session. |
| `gutix:ship` | Builds the plan in short fresh sessions: `dispatch` (one Sonnet worker per ready task), `integrate` (task PRs squashed into `release/<slug>-p<n>`), `release` (e2e label + pr-review in parallel, merge commit, then archive sessions, delete branches, stop servers), `handoff` (published, in flight, next steps with the prompt to paste) and `status`. |
| `gutix:bug-fix` | Red test first, root cause, same pattern elsewhere, fix, production data check, close the gap. |
| `gutix:sign-off` | Catches you up on a release or PR: expected vs built, the agents' decisions, the hunks to read, what the checks don't prove. Brief by default and records nothing; `mode=gate` adds a graded quiz when you ask for it. Never a merge condition. |
| `gutix:pr-review` | Reviews a PR with one reviewer or a panel of up to 4 by risk area, verifies every finding (critical/high with a failing test), consolidates one ranked list, and fixes the approved ones test-first. Maps the blast radius itself, records the reviewed sha and skips what is already reviewed; reviewers write their reports to `.review/<sha>/` and hand back short summaries. |
| `gutix:peer-review` | Reviews a teammate's PR in a throwaway worktree with hard cost limits: design, complexity, security, concurrency, contracts and repo rules, at most ~10 ranked comments in a kind, questioning tone, and a map of what to read yourself. Shows everything in the chat and posts one review only after your OK; re-reviews only the delta. |
| `gutix:verify` | Runs the checks that prove a change works and reports each as passed, failed or not run. Keeps the repo's recipe in `.claude/verify.md` so no session rediscovers how to build and test. |
| `gutix:live-data-change` | Changes data in a live PostgreSQL without blocking it: generated dry-run and apply files, index-only access proven by a plan test, batches with commits, lock and statement timeouts, `ON_ERROR_STOP` for pipelines, verification queries; and the delta + recomputed-projection design that keeps such changes cheap. |
| `gutix:learn` | Turns mistakes that repeat into safeguards that run (test, lint rule, review invariant, recipe line), prunes stale instructions; persists only with evidence and the user's yes. |
| `gutix:design-doc` | Writes a design doc from decisions already taken: an HTML for people (browser, PDF) with inline SVG diagrams and a generated `<name>.llm.md` twin that agents read at about a third of the tokens. Writer and diagram subagents, a contradictions review against the code, a checker (`check-doc.mjs`), and routing (first-line pointer, `AGENTS.md` line, `extract-llm.mjs --check`). |
| `gutix:deck` | Builds a self-contained HTML slide deck that explains a technical flow or change, researched fresh from the repo (code over config over ticket, every number tagged read, inferred or measured), in the org's theme, and exports it to PDF with the shared renderer. |
| `gutix:ui-evidence` | Proves a UI change with screenshots: tours the screens on mobile and desktop before and after, measures the primary CTA, and composes BEFORE \| AFTER images to attach to a ticket or PR. |

## Install

### Claude Code

Two marketplaces: gutix, and your company's org plugin if it has one. Each is added once and updates on its own.

```bash
claude plugin marketplace add GutiNicolas/gutix
claude plugin install gutix@gutix
# the org's plugin, if your team has one (add #<branch> when it works on a branch other than the default):
claude plugin marketplace add <org>/<repo>#<branch>
```

- The repos are private: you need read access, and git must be able to use your credentials (`gh auth setup-git`).
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
scripts/gutix.mjs link-org <git-url> [--branch <b>]   # clone an org repo, install it in Cursor, record it
scripts/gutix.mjs new-org <name>                      # or start a personal profile in ~/.config/gutix/orgs/<name>/
```

### Update

```bash
~/projects/gutix/scripts/gutix-update
```

Pulls gutix and every linked org, then regenerates the Cursor copies. For an automatic daily update, answer yes to the
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
