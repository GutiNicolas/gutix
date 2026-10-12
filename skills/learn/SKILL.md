---
name: learn
description: Turn repeated mistakes into safeguards that run (test, lint rule, review invariant, verify recipe, skill edit) and prune stale instructions. Persists only what happened twice or the user stated, after approval. Use after corrections or long tasks.
user-invocable: true
args:
  - name: topic
    description: "The mistake or correction to learn from (default: the current conversation)"
    required: false
---

# Learn

Every line added to an instruction file is paid for in every future session. Prefer what runs over what is read, and
remove as much as you add.

## 1. Collect
From the conversation (or `topic`): corrections the user made, attempts that failed and why, findings a review caught
late, commands that had to be rediscovered. One line each, with where it happened.

## 2. Filter
Keep a lesson only if:
- it happened **at least twice** (here, in git history, in an existing note), or the user stated it as a rule; and
- it is not already written down (`rg` the instruction files first). If it is written and was still missed, the
  problem is where or how it is written: fix that instead of adding a copy.
A single observation goes in the report as "seen once", not in a file.

## 3. Pick the highest level that works
1. **Executable:** a test, a lint/ArchUnit/Semgrep rule, a CI step, a script.
2. **Review rule:** an invariant in the repo's `.claude/review.md`, or a line in gutix:pr-review's `catalog.md` if it
   applies to every repo.
3. **Verify recipe:** `.claude/verify.md` (a command, a dependency, a flaky test).
4. **Skill edit:** the gutix skill whose step led to the mistake.
5. **Instruction line:** the repo's `CLAUDE.md`. Last resort; never the global one from a single repo's lesson.
A product rule ("this must never happen") goes through `gutix:triage` step 4 instead.

## 4. Prune
While in those files: remove lines that are obsolete (the code or tool they name is gone), duplicated elsewhere, or
contradicted by what just happened.

## 5. Propose, then write
Show each change as file + diff + the evidence (the two occurrences or the user's words). Write nothing before the
user says yes. Commit in the branch of the work that taught it, or on its own.

## Report
Lessons kept (level and file), lessons seen once (not persisted), lines removed.
