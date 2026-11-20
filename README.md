# gutix

Claude Code plugin with Nicolas' engineering workflows.

| Skill | What it does |
| --- | --- |
| `gutix:triage` | Entry point when the kind or next step is unclear: classifies (bug, feature, product decision), weighs impact, proposes options, records decisions (`docs/decisions/`, review invariants) and hands off. Fast path for clear small bugs. |
| `gutix:feature-intake` | Turns a requirement into a plan in the repo: challenge, impact map, a roadmap with contracts and one task file per unit with executable acceptance criteria; dispatch, workers and review then run in fresh sessions. |
| `gutix:bug-fix` | Red test first, root cause, same pattern elsewhere, fix, production data check, close the gap. |
| `gutix:sign-off` | Before a release (or a PR in human-read paths) merges: expected vs built, the agents' decisions, the hunks to read, what the checks don't prove, and a quiz you answer and it grades; missed areas carry over. `mode=brief` catches up after time away. |
| `gutix:pr-review` | Reviews a PR with one reviewer or a panel by risk area, verifies every finding (critical/high with a failing test), consolidates one ranked list, and fixes the approved ones test-first. |
| `gutix:peer-review` | Reviews a teammate's PR with pr-review's method, drafts labelled inline comments, confirms each one with you, then posts one review. Re-reviews only the delta. |
| `gutix:verify` | Runs the checks that prove a change works and reports each as passed, failed or not run. Keeps the repo's recipe in `.claude/verify.md` so no session rediscovers how to build and test. |
| `gutix:impact` | Blast radius with grep and git first: callers, contracts, data, config, sibling repos, and the tests to run. |
| `gutix:live-data-change` | Changes data in a live PostgreSQL without blocking it: generated dry-run and apply files, index-only access proven by a plan test, batches with commits, lock and statement timeouts, `ON_ERROR_STOP` for pipelines, verification queries; and the delta + recomputed-projection design that keeps such changes cheap. |
| `gutix:learn` | Turns mistakes that repeat into safeguards that run (test, lint rule, review invariant, recipe line), prunes stale instructions; persists only with evidence and the user's yes. |
| `gutix:design-doc` | Writes a design doc from decisions already taken: an HTML for people (browser, PDF) with inline SVG diagrams and a generated `<name>.llm.md` twin that agents read at about a third of the tokens. Writer and diagram subagents, a contradictions review against the code, a checker (`check-doc.mjs`), and routing (first-line pointer, `AGENTS.md` line, `extract-llm.mjs --check`). |

## Install (local)

```bash
claude plugin marketplace add ~/projects/gutix
claude plugin install gutix@gutix
```

After editing a skill: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json`, then
`claude plugin update gutix@gutix` and restart Claude Code.

## Flow

triage → bug-fix | feature-intake → PR → pr-review → sign-off → merge (findings → bug-fix; new product rules → triage).
A teammate's PR → peer-review → your confirmation → one review on GitHub.

Supporting skills: `impact` before changing shared code or picking a review shape, `verify` before calling anything
done, `learn` when a mistake repeats, `design-doc` when a decided design needs writing up.

Per-repo files the skills maintain: `.claude/verify.md` (how to build and test), `.claude/review.md` (invariants,
accepted risks and human-read paths). Feature plans start from `skills/feature-intake/templates/` (roadmap, task,
worker brief). Why sign-off exists and the bar it holds: [PRINCIPLES.md](docs/features/human-ownership/PRINCIPLES.md).

Decision records: `docs/decisions/` in the repo for one product, in the infra repo (named in the global
`CLAUDE.md`) for decisions across products.
