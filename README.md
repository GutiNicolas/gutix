# gutix

Claude Code plugin with Nicolas' engineering workflows for the org's repos.

| Skill | What it does |
| --- | --- |
| `gutix:triage` | Entry point when the kind or next step is unclear: classifies (bug, feature, product decision), weighs impact, proposes options, records decisions (`docs/decisions/`, review invariants) and hands off. Fast path for clear small bugs. |
| `gutix:feature-intake` | Turns a requirement into a plan: challenge, impact map, phases with a contract per phase and units per repo, build, PRs. |
| `gutix:bug-fix` | Red test first, root cause, same pattern elsewhere, fix, production data check, close the gap. |
| `gutix:pr-review` | Reviews a PR with one reviewer or a panel by risk area, verifies every finding (critical/high with a failing test), consolidates one ranked list, and fixes the approved ones test-first. |
| `gutix:peer-review` | Reviews a teammate's PR with pr-review's method, drafts labelled inline comments, confirms each one with you, then posts one review. Re-reviews only the delta. |
| `gutix:verify` | Runs the checks that prove a change works and reports each as passed, failed or not run. Keeps the repo's recipe in `.claude/verify.md` so no session rediscovers how to build and test. |
| `gutix:impact` | Blast radius with grep and git first: callers, contracts, data, config, sibling repos, and the tests to run. |
| `gutix:learn` | Turns mistakes that repeat into safeguards that run (test, lint rule, review invariant, recipe line), prunes stale instructions; persists only with evidence and the user's yes. |

## Install (local)

```bash
claude plugin marketplace add ~/projects/gutix
claude plugin install gutix@gutix
```

After editing a skill: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json`, then
`claude plugin update gutix@gutix` and restart Claude Code.

## Flow

triage → bug-fix | feature-intake → PR → pr-review (its findings → bug-fix; new product rules → triage).
A teammate's PR → peer-review → your confirmation → one review on GitHub.

Supporting skills: `impact` before changing shared code or picking a review shape, `verify` before calling anything
done, `learn` when a mistake repeats.

Per-repo files the skills maintain: `.claude/verify.md` (how to build and test), `.claude/review.md` (invariants and
accepted risks).

Decision records: `docs/decisions/` in the repo for one product, in the infra repo for decisions across products.
