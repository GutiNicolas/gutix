# T-<nn>: <title>

- **Roadmap:** ../ROADMAP.md · **Phase:** <n> · **Repo:** <repo> · **Base branch:** release/<slug>-p<n> (PR targets it, not main) · **Branch:** <type>/<slug>
- **Depends on:** <T-xx integrated | none> · **Model:** sonnet · **Review tier:** <read | evidence> (`read` when it touches a human-read path)

## Goal
<What exists when this is done, in product terms.>

## Scope
- Files/areas: <paths>
- Out of scope: <what not to touch>

## Contract
<The shapes and rules this task must follow, or a link to the roadmap's Contracts section.>
- **Non-functional:** <latency or new calls on a critical path, blast radius (which tenants, plans or callers), idempotency if it runs twice | none>

## Decision (don't reopen)
<!-- What was already decided, so the worker doesn't re-litigate it. Delete the block only when nothing was decided. -->
- **Chosen:** <the approach, and why in one line>
- **Rejected:** <the alternative>. Don't implement it.
- **Explicitly out of scope:** <what a reader might assume is included>

## Acceptance criteria (executable)
<!-- Each line is a check the worker runs itself; the reviewer re-checks against the diff. -->
- [ ] <behavior> — `<command that proves it>`
- [ ] <what must stay exactly as it is> still holds (required regression criterion) — `<existing test or command>`
- [ ] When <dependency> is down, absent or times out, <it degrades like this and doesn't break the rest> (required dependency failure criterion; "n/a: no dependency" if true) — `<command>`
- [ ] Unit/integration tests pass — `<command>`
- [ ] e2e scenario <name> in the product's e2e repo passes — `<command>` (user-facing flows only)
- [ ] Repo rules: the repo's `CLAUDE.md` and the standards it lists

## Result (filled by the worker)
<!-- PR link first. Every heading filled; "none" only when true. -->
### Evidence
<!-- Each criterion: pass/fail, the command and the one output line that proves it. -->
### Decisions not in the spec
<!-- Defaults picked, scope cut or added, a requirement reinterpreted because two clashed. -->
### Assumptions
### Not verified
### Where to look
<!-- ≤5 `file:line` a human must read, one line why each. Not everything you touched. -->
