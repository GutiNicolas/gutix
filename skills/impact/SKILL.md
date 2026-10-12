---
name: impact
description: "Blast radius of a change with grep and git first: callers, contracts, data, config, sibling repos, and the tests to run. Use before changing shared code, in feature-intake and pr-review, or when asked what a change affects."
user-invocable: true
args:
  - name: change
    description: "A diff, branch, commit, file or symbol (default: the current diff against the base branch)"
    required: false
---

# Impact

Cheap by design: no subagents, no full-file reads by default. Stop as soon as the evidence answers the question.

## 1. What changed
`git diff <base>...HEAD --stat`, then the changed signatures only: `git diff -U0 <base>...HEAD | rg '^[+-].*(class|interface|def|fun|function|export|public|@(Get|Post|Put|Delete|Patch)Mapping|CREATE|ALTER)'`.
List the symbols, endpoints, columns, events and config keys whose meaning or shape changed. A body-only change
with the same contract usually stops here: its callers are not affected.

## 2. Who depends on it (deterministic)
- **Callers:** `rg -l '\b<Symbol>\b'` in the repo; for shared contracts also in the product's sibling repos
  (back + front + e2e, e.g. `~/projects/product-*`).
- **Contracts:** `docs/API.md`, OpenAPI specs, event schemas, front API clients, product-e2e scenarios that call the
  endpoint.
- **Data:** migrations in the diff, and readers/writers of the touched tables or columns (`rg` the column name).
- **Config:** new or renamed env vars, flags or secrets → the infra repo must change too.
- **History:** `git log --oneline -5 -- <file>` when the area changed recently (a fix being undone is a red flag).

## 3. Read only where grep cannot decide
A caller whose use of the changed behaviour is not clear from the matching line: read that function, not the file.

## Report (max ~15 lines)
```
Changed: TokenService.issue() now rejects expired refresh tokens (contract change)
Affected (confirmed): AuthController.refresh, web-ui src/api/auth.ts (retries on 401)
Affected (probable): product-e2e session-expiry scenario
Contracts: POST /api/v1/token/refresh returns 401 instead of 200 + stale token
Data: none   Config: none
Tests to run: TokenServiceTest, AuthControllerIT, product-e2e session-expiry
Review: auth → gutix:pr-review panel
```
"Probable" means the grep matched but the code path was not traced. Hand the test scope to `gutix:verify`.
