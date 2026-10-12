---
name: verify
description: Prove a change works by running checks, never by claiming it. Keeps the repo's recipe in .claude/verify.md, runs the subset the change touches, reports each check as passed, failed or not run. Use before calling work done or opening a PR.
user-invocable: true
args:
  - name: scope
    description: "What to verify: a diff, branch, path or test scope from gutix:impact (default: the current diff). \"setup\" (re)writes the recipe."
    required: false
---

# Verify

A model saying the code is correct is not verification. A check is verified only if it ran in this session and its
output says it passed. The other gutix skills point here instead of repeating these rules.

## 1. The recipe
Read `.claude/verify.md` in the repo. If it is missing, or `scope` is `setup`, write it:
- Read only what defines how the repo builds and tests: `pom.xml` / `build.gradle`, `package.json` scripts, `Makefile`,
  `docker-compose*`, `.github/workflows/*`, the README's dev section. Do not explore the source.
- **Run each command before writing it down.** One that cannot run here (needs a secret, a cloud resource) goes under
  "Limits" with the reason, not under the checks.
- Fill [verify-template.md](verify-template.md). Keep it to what a new session needs; ~30 lines.
- Commit it with the change that needed it, or on its own.

## 2. Pick the checks
Cheapest that proves the change, deterministic first:
1. Compile / type-check and the linters CI runs.
2. The tests for what changed: the scope from `gutix:impact` if it ran, otherwise the tests next to the changed files
   and the ones that name the changed symbols (`rg`).
3. Integration or e2e only when the change crosses a boundary (endpoint, query, migration, contract, user flow).
4. Full suite before a push or PR; on a PR, also `gh pr checks`.
Never skip a check the repo or the task requires because the change looks small.

## 3. Run and read
- Run them; read failures from the output, not from memory. Quote the one line that matters, not the whole log.
- A failure the change caused: fix it (or hand it to `gutix:bug-fix`) and re-run that check.
- A failure that was already there: confirm on the base branch (`git stash` or a worktree) before calling it
  pre-existing.
- Flaky: re-run once. If it flips, say so and add it to "Limits" in the recipe.
- A recipe command that no longer works (renamed script, new dep): fix the recipe in the same change.

## Report
```
check            command                         result
compile          ./mvnw -q compile                passed
unit (changed)   ./mvnw test -Dtest=TokenSvc*     passed (14)
integration      ./mvnw verify -Pit               not run: needs Docker, not available here
```
Then one line on what is not proven (behaviour no check covers, limits hit). Do not write "should pass" or "tests
pass" for anything that did not run.
