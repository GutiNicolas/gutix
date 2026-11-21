
## In Cursor

This copy runs in Cursor. Where the steps above name a Claude Code tool or place, use the Cursor one:
- **Repo rules:** besides `CLAUDE.md` and `.claude/review.md`, read the repo's `AGENTS.md` and `.cursor/rules/`. The base
  branch is the floor for those too (`git show origin/<base>:AGENTS.md`).
- **Reviewers and the fix agent:** `Task` subagents in the background, all launched in one message. Use the
  `generalPurpose` type, not a read-only one: each reviewer writes its report to `.review/<sha>/`. "Sonnet" and "Opus"
  mean a fast and a stronger model from Cursor's model list; pick the closest the user has enabled, and ask before
  using a stronger one.
- **The closing question** (which findings to fix) is an `AskQuestion` with the options numbered by finding, the
  recommended one first. Fix nothing before the user answers.
