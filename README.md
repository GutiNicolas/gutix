# gutix

Claude Code plugin with Nicolas' engineering workflows for the org's repos.

| Skill | What it does |
| --- | --- |
| `gutix:triage` | Entry point when the kind or next step is unclear: classifies (bug, feature, product decision), weighs impact, proposes options, records decisions (`docs/decisions/`, review invariants) and hands off. Fast path for clear small bugs. |
| `gutix:feature-intake` | Turns a requirement into a plan: challenge, impact map, phases with a contract per phase and units per repo, build, PRs. |
| `gutix:bug-fix` | Red test first, root cause, same pattern elsewhere, fix, production data check, close the gap. |
| `gutix:pr-review` | Reviews a PR with one reviewer or a panel by risk area, verifies every finding (critical/high with a failing test), consolidates one ranked list, and fixes the approved ones test-first. |

## Install (local)

```bash
claude plugin marketplace add ~/projects/gutix
claude plugin install gutix@gutix
```

After editing a skill: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json`, then
`claude plugin update gutix@gutix` and restart Claude Code.

## Flow

triage → bug-fix | feature-intake → PR → pr-review (its findings → bug-fix; new product rules → triage).

Decision records: `docs/decisions/` in the repo for one product, in the infra repo for decisions across products.
