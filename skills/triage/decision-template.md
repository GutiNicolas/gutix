# Decision record template

File: `docs/decisions/NNNN-<slug>.md` (next free number in that folder). Half a page at most.

```markdown
# NNNN. <The decision as a sentence>

- Date: YYYY-MM-DD
- Status: accepted | superseded by NNNN
- Applies to: <repos / products>

## Context
What happened or was asked, and why it needs a rule. Two to four sentences.

## Decision
The rule, stated so a reviewer can check code against it.

## Options considered
- <option>: why not (one line each). Omit if there was no real choice.

## Consequences
What changes now (code, docs, operations) and what it costs.

## Enforcement
- Invariant line in `<repo>/.claude/review.md` (if the code must always follow it)
- Tests or e2e scenarios that guard it
```
