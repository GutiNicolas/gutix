---
name: bug-fix
description: "Fix a bug test-first: red test for the right reason, root cause, same pattern elsewhere, fix, production data impact, and what stops it coming back. Use when a bug is reported, CI fails for a real reason, or triage or pr-review hands one off."
user-invocable: true
args:
  - name: bug
    description: The bug report, failing test, log line or finding
    required: false
---

# Bug fix

Spend in proportion: a one-line bug gets a test, the fix and a commit, not a report. The steps below scale down; the
order does not change: **red test before any fix**. Exception: a bug with no logic (a typo in a text, a colour, a
spacing) gets the fix alone; a test for it would not catch a realistic bug (`test-suite-prune`).

## 1. Reproduce
- Write the test that shows the bug, at the cheapest level that shows what the user sees: unit for logic, slice or
  integration for an endpoint or a query, an product-e2e scenario for a broken user flow.
- Run it: it must fail, and for the reason the report describes. A test that fails for another reason proves nothing.
- Cannot reproduce? Collect evidence before guessing: the New Relic logs and events for the `uow` or user id, the data
  involved, the versions deployed. Ask the user for what is missing. Do not "fix" what you cannot show.

## 2. Find the root cause
Ask why until the answer is a decision in the code, not a symptom ("the token was accepted" → "the cache kept the old
state" → "the write path did not NOTIFY"). The fix goes where the cause is.

## 3. Look for the same pattern
Search the repo (and sibling repos when the pattern is shared, e.g. every product's filter) for the same mistake. Fix
the copies in the same change, or list them for the user if they are many or in other teams' code.

## 4. Fix
- The smallest change that removes the cause. The red test turns green; the rest stays green (`gutix:verify`).
- Commit test and fix together. Follow `test-suite-prune` (keep only tests that catch realistic bugs) and
  `org-observability` (log the unexpected error once, no secrets or emails).
- Risky fixes (auth, tenancy, money, migrations) go through `gutix:pr-review` before merge.

## 5. Production data
Did the bug write wrong data, expose data or skip a charge? If yes, say so plainly, with the size of the impact if it
can be measured, and propose the repair (script, migration, notice to users). Never run a repair on production data
without the user's explicit yes.

## 6. Close the gap (one line each, only what applies)
- Why was it not caught? Missing test (added in step 1), missing log or alert (add it if cheap), or a review that should
  have seen it. If the same kind of bug has happened before, run `gutix:learn` to turn it into a safeguard.
- If the bug revealed a product rule nobody had written, hand it to `gutix:triage` to record it.

## Report
What was wrong (in product terms), the root cause, the test that proves it, the fix and its commit, other places fixed,
data impact, and what now prevents it from coming back.
