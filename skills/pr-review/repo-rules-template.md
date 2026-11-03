# Template for `.claude/review.md` (one per repo)

Keep it short: only what a reviewer cannot guess from the code. `pr-review` reads it and passes it to every reviewer.

```markdown
# Review rules: <repo>

## Invariants (a violation is at least high)
- Tenant-admin queries are always scoped to the caller's `tid`.
- <product> validates the identity provider's tokens and never issues its own.
- ...

## Accepted risks (not findings; link the decision)
- A pod with the trusted-client label and a valid credential can set CF-Connecting-IP (docs/SECURITY.md#...).
- ...

## Human-read paths (read line by line before merge)
- src/main/java/**/auth/** — sessions and tokens
- src/main/resources/db/migration/** — schema and data

## Where the design lives
- docs/API.md, docs/SECURITY.md, <infra repo> docs/app-requests/<app>.md
```
