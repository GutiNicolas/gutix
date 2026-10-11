# gutix

Claude Code plugin with Nicolas' engineering workflows for the org's repos.

| Skill | What it does |
| --- | --- |
| `gutix:pr-review` | Reviews a PR with one reviewer or a panel by risk area, verifies every finding (critical/high with a failing test), consolidates one ranked list, and fixes the approved ones test-first. |

## Install (local)

```bash
claude plugin marketplace add ~/projects/gutix
claude plugin install gutix@gutix
```

After editing a skill: bump `version` in `.claude-plugin/plugin.json` and `marketplace.json`, then
`claude plugin update gutix@gutix` and restart Claude Code.
