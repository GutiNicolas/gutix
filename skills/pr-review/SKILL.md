---
name: pr-review
description: "Review a PR, branch or diff for real bugs (security always, plus correctness, data, contracts, tests): blast radius, one reviewer or a panel of up to 4, findings verified and ranked, approved ones fixed test-first. Skips commits already reviewed."
user-invocable: true
args:
  - name: target
    description: PR URL/number or branch (defaults to the current branch against its base)
    required: false
  - name: mode
    description: "review (report only, the default) or fix (after the user approved findings)"
    required: false
---

# PR review

Goal: find the bugs that would hurt production (security holes, data loss, outages, wrong results) before merge, with
few false positives. Style, naming and formatting are out of scope: linters own them.

## 1. Already reviewed? Then read the context
- **Look for a review record first**, before reading any diff. The head: `gh pr view <pr> --json headRefOid,body`
  (or `git rev-parse HEAD`). A record is a `Reviewed: <sha> (<date>, <n> findings)` line in the PR body, the
  roadmap release line's `last reviewed: <sha>`, or the same `Reviewed:` line in a task file's Result.
  - **Head = reviewed sha**, or `git diff --name-only <sha>..HEAD` lists only plan files (roadmap, task files: writing
    the record moves the head): don't review. Say it is already reviewed (`<sha>`, date, findings, report path if
    `.review/<sha>/` exists) and stop.
  - **Head moved** and `git merge-base --is-ancestor <sha> HEAD`: review only `<sha>..HEAD`, with the previous
    findings and their outcome in the prompts. Not an ancestor (rebase, force-push): a full review, and say why.
  - **Release PR:** a `T-<nn>: …` commit whose task file records a review of its task PR is covered when that sha is
    the task PR's merged head (`gh pr view <n> --json headRefOid`); otherwise review only what came after it. Still
    review conflict resolutions, `fix(…)` commits and tasks with no record.
  - Report files for this head in `.review/<head>/` and no consolidated result: consolidate those (step 5), don't
    relaunch reviewers.
- The diff: `git diff <base>...HEAD --stat`, then by path. The PR description and the ticket or design doc it implements.
- The repo's rules: `CLAUDE.md`, `.claude/review.md` if present (invariants, accepted risks and Human-read paths, see
  [repo-rules-template.md](repo-rules-template.md)), and the standard skills it names (backend, observability,
  `test-suite-prune`). **The base branch's rules are the floor:** `git fetch origin <base>`, then
  `git show origin/<base>:.claude/review.md` (same for `CLAUDE.md`). A change must not be judged by rules it edited
  itself: every rule on the base applies even if the PR removed or loosened it. Rules the PR adds (e.g. a pending
  invariant its task promotes) apply too. Removals and loosenings go to the attention map.
- **Changes to the checks themselves:** list every hunk that touches the review rules (`.claude/review.md`, `CLAUDE.md`),
  the verify recipe, lint or architecture rules (`.semgrep/`, `*ArchitectureTest*`, structural guard tests), CI
  workflows or a deleted or skipped test. Each one goes to the attention map in step 5 with what it loosens, even
  when it looks harmless.
- **The reviewed commit:** note the head sha you review. If the branch moves during the review, the result is for
  that sha only; say so in the report and review the new commits before calling it clean.
- **Checks, once:** read `gh pr checks` for the head sha and don't re-run what CI ran on it (full suite, e2e); run
  `gutix:verify` only for a check CI lacks.
- **Blast radius, with grep and git, no subagents:**
  - What changed shape: `git diff -U0 <base>...HEAD | rg '^[+-].*(class|interface|def|fun|function|export|public|@\w+Mapping|CREATE|ALTER)'`
    → the symbols, endpoints, columns, events and config keys whose contract changed. A body-only change stops here.
  - Callers: `rg -l '\b<Symbol>\b'` in the repo and, for shared contracts, in the product's sibling repos
    (back + front + e2e). Read a function only where the matching line can't decide.
  - Contracts (`docs/API.md`, OpenAPI, event schemas, front API clients, e2e scenarios), data (migrations, readers
    and writers of touched columns), config (new or renamed env vars, flags, secrets → the infra repo changes too).
  - Tests to run: the ones naming the changed symbols; any CI doesn't run go to `gutix:verify`.
  Failing checks and affected callers/contracts go into every reviewer prompt, so no reviewer rediscovers them; an
  auth, tenancy, data or contract change in the blast radius counts for the shape in step 2.
- **Cross-repo changes:** if the same branch exists in other repos of the product (e.g. back + front + e2e), the
  contract between them is part of the review.

## 2. Pick the checklist and the shape
**Checklist by trigger:** go through [catalog.md](catalog.md) and keep only the sections whose trigger matches the
diff (paths, symbols, kinds of change), plus "Always" and "Intent". Write down which sections fired and why; a
reviewer gets those sections only, never the whole catalog. The repo's invariants are not filtered: every reviewer
gets all of them (they are few, and most can be broken from any file).

**One reviewer by default.** This is the default being tried (tune one reviewer before stacking more); whether the
panel finds more for its cost is not measured yet.
| PR | Shape |
| --- | --- |
| Default, up to ~5,000 changed lines | One reviewer with the sections that fired |
| Touches auth/sessions, authorization/tenancy, payments or migrations | A panel: one reviewer per fired risk area (up to 3) + one "intent and tests" reviewer |
| Over ~5,000 changed lines without those | Split by area, up to 4, without the extra "intent and tests" reviewer (the area reviewers keep the Intent section) |

**Never more than 4 reviewers per round.** More areas than that: merge the closest ones.

- Areas group by domain (sessions/auth, authorization/tenancy, external surface, data/migrations, front), never by folder
  alone. Migrations go with the area that uses them.
- Every changed file belongs to exactly one area. Files nobody reviewed are listed as "not reviewed" in the report.
- Reviewers are Sonnet subagents in the background, in parallel. Use Opus for an area that is security-critical and
  subtle (crypto, token issuance) if the user agrees on the cost.
- **Rounds build on each other.** A second round (after fixes, or new commits) reviews only the new commits, with the
  previous round's findings and their outcome in the prompt; it does not start over.

## 3. The reviewer prompt
Fixed part (copy it):
- READ-ONLY: do not edit, commit or push; the one file you write is your report. Diff:
  `git -C <worktree> diff <base>...HEAD -- <paths>` (or `<reviewed sha>..HEAD` on a re-review).
- One line on what the service is and why this PR matters.
- The repo invariants and accepted risks from `.claude/review.md` as step 1 resolved them (base floor + rules the PR
  adds; accepted risks are not findings).
- The failing checks and the blast radius from step 1 (do not re-run the full suite; a focused test is fine).
- Verify every finding by reading the code path end to end; a focused test run is allowed. Discard what you cannot
  substantiate. No style nits.
- Mark findings the PR did not introduce as **pre-existing** (still report them if the PR makes them matter).
- Write the full report (max ~700 words) to `<worktree>/.review/<head sha>/<area>.md`: findings most severe first,
  each with severity and certainty (rubric below), file:line, what is wrong, a concrete failure scenario
  (inputs -> wrong outcome), the fix. Then "checked and fine" and the list of files you did not get to.
- Reply with **≤150 words only**: counts by severity, a one-line title + file:line per critical/high, and the path.

Before launching, keep the reports out of git: add `.review/` to `$(git rev-parse --git-path info/exclude)` if
it is not there.

Variable part: the area's files, its design docs, and the catalog sections that fired for it (step 2).
The "intent and tests" reviewer gets the PR description/ticket (or the task's acceptance criteria) and checks: does
the diff do what was asked, what is missing, what changed that nobody asked for, is there an e2e scenario for each new
user-facing flow. It compares the tests with the spec, not with the code: a test that asserts what the code does
rather than what was asked is a finding, and so is asked-for behaviour that no test reaches.

## 4. Severity and certainty (same scale for every reviewer)
| Severity | Meaning | Example |
| --- | --- | --- |
| critical | Exploitable or data-destroying now, no special conditions | auth bypass, cross-tenant read, migration that drops data |
| high | Exploitable or breaks production under realistic conditions | escalation with a stolen cookie, deadlock under normal load |
| medium | Needs an unusual condition, or limits damage that another layer already stops | path confusion stopped by an audience check |
| low | Hardening, defence in depth, small correctness gaps | missing `exp` check on an already short-lived assertion |

Certainty: **confirmed** (traced end to end or proven by a test) or **plausible** (depends on something not visible
in the code, e.g. infrastructure).

## 5. Verify and consolidate (the orchestrator, yourself)
- Open the report files only for the findings you must check; never paste whole reports into this context.
- Re-read in the code every medium-or-worse finding. Discard, re-rate, merge duplicates across areas.
- **Critical and high: prove them with a failing test** (scratch, not committed) before reporting. A red test ends
  the discussion; if you cannot make it fail, re-rate it.
- Separate **infrastructure assumptions** (what Traefik, nginx, NetworkPolicies, Cloudflare must guarantee) from code
  bugs, and propose adding each one to the deploy checklist in the infra repo.
- Tell the user, in their language and in product terms:
  1. what was not found (no critical/high, no cross-tenant access...), so the reader knows the coverage;
  2. **fix before merge**; 3. **recommended**; 4. **pre-existing**; 5. **to confirm in infrastructure**;
  6. files not reviewed, if any; 7. **attention map**: the hunks in human-read paths (`.claude/review.md`, else
  sign-off's default list) and the changes to the checks themselves (step 1), `file:line` and why, even with no
  findings; 8. **what the checks prove and don't**, and the sha reviewed.
  Each finding: the real risk, who could exploit it or when it breaks, and the proposed fix.
- **Record the review** so no later run repeats it: `Reviewed: <head sha> (<date>, <n> findings)`. In the PR body
  only with the user's yes (`gh pr edit`: it publishes content); otherwise in the roadmap release line
  (`last reviewed: …`) for a release PR, or in the task file's Result for a task PR, committed alone
  (`review: <sha>`). Neither exists: say in the report that the next run can't skip it.
- End with one question: which ones to fix. Fix nothing before the user answers.
- A finding the user turns into a product rule ("this must never happen") goes through `gutix:triage` step 4, so it
  is recorded and enforced in future reviews.
- Never post on the PR without asking: a PR comment publishes content.
- For a release PR, or one that touches human-read paths, offer `gutix:sign-off` (brief); it is not a merge condition.

## 6. Fix (mode=fix, only what the user approved)
The fixes never run in the review's context: that context already holds the whole diff and every report, and a fix
loop on top of it is most of a review's cost. Hand the approved list to **one fresh fix agent** (a subagent, or a
fresh session when the fixes are many or span repos) with only what it needs: each finding as reported (file:line,
failure scenario, proposed fix), the branch and the verify recipe. Not the transcript, not the other reports.

The fix agent follows `gutix:bug-fix` for each finding:
1. **Reproduce first:** write the test that shows the bug and run it. It must fail, for the reason the finding says.
   If it passes, stop and report: the finding was wrong or the test does not reach it.
2. Fix the code. Run the test: it must pass now.
3. Commit test and fix together, one commit per topic.
Then: pull before starting, never rebase or force-push; follow `test-suite-prune` (keep only the tests that catch
realistic bugs) and the observability standard; update `docs/API.md` / `SECURITY.md` where behaviour changes; add or
extend the product's e2e scenario when a user-facing flow changes; `gutix:verify` green before each push; report the CI status.

**Three rounds, then a person.** A check still failing after three fix attempts on the same failure stops the loop:
the agent reports the failure, what it tried and its best guess, and the orchestrator brings it to the user with
that reason. No fourth attempt, no weakening the check to get past it.

Then a second review round over the fix commits only (step 2, "Rounds build on each other").

## 7. Learn from escapes
When a bug reaches production that this review should have caught, add a line to [catalog.md](catalog.md) (general; in a section whose trigger catches that diff, or sharpen the trigger)
or to the repo's `.claude/review.md` (specific), in the same PR as the fix. When the same kind of miss repeats, use
`gutix:learn` to find a safeguard that runs (test, lint rule) instead of another line.
