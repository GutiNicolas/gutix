---
name: pr-review
description: Review a pull request (any repo, any size) for real bugs. Security in every PR, plus correctness against the intent, data and migrations, concurrency, failure handling, contracts, performance, operability, tests and observability. Small PRs get one reviewer; big or risky ones a panel of parallel read-only reviewers, one per risk area. Every finding is verified in the code (critical/high ones with a failing test), then consolidated into one ranked list for the user to decide on. Approved findings are fixed test-first, one commit per topic. Use when asked to review a PR, a branch or a diff.
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

## 1. Read the context
- The diff: `git diff <base>...HEAD --stat`, then by path. The PR description and the ticket or design doc it implements.
- The repo's rules: `CLAUDE.md`, `.claude/review.md` if present (invariants and accepted risks, see
  [repo-rules-template.md](repo-rules-template.md)), and the standard skills that apply (`org-backend-standard`,
  `test-suite-prune`, `org-observability`).
- **Cross-repo changes:** if the same branch exists in other repos of the product (e.g. back + front + e2e), the
  contract between them is part of the review.

## 2. Pick the shape
| PR | Shape |
| --- | --- |
| Under ~1,500 changed lines and no auth, payments, tenancy or migrations | One reviewer with every area of the catalog |
| Bigger, or touches any of those | A panel: 2-4 risk areas of up to ~5,000 lines each + one cross-cutting "intent and tests" reviewer |

- Areas group by domain (sessions/auth, authorization/tenancy, external surface, data/migrations, front), never by folder
  alone. Migrations go with the area that uses them.
- Every changed file belongs to exactly one area. Files nobody reviewed are listed as "not reviewed" in the report.
- Reviewers are Sonnet subagents in the background, in parallel. Use Opus for an area that is security-critical and
  subtle (crypto, token issuance) if the user agrees on the cost.

## 3. The reviewer prompt
Fixed part (copy it):
- READ-ONLY: do not edit, commit or push. Diff: `git -C <worktree> diff <base>...HEAD -- <paths>`.
- One line on what the service is and why this PR matters.
- The repo invariants and accepted risks from `.claude/review.md` (accepted risks are not findings).
- Verify every finding by reading the code path end to end; a focused test run is allowed. Discard what you cannot
  substantiate. No style nits.
- Mark findings the PR did not introduce as **pre-existing** (still report them if the PR makes them matter).
- Report (max ~700 words): findings most severe first, each with severity and certainty (rubric below), file:line,
  what is wrong, a concrete failure scenario (inputs -> wrong outcome), the fix. Then "checked and fine" and the list
  of files you did not get to.

Variable part: the area's files, its design docs, and its lines from [catalog.md](catalog.md).
The "intent and tests" reviewer gets the PR description/ticket and checks: does the diff do what was asked, what is
missing, what changed that nobody asked for, do the tests catch realistic bugs, is there an e2e scenario for each new
user-facing flow.

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
- Re-read in the code every medium-or-worse finding. Discard, re-rate, merge duplicates across areas.
- **Critical and high: prove them with a failing test** (scratch, not committed) before reporting. A red test ends
  the discussion; if you cannot make it fail, re-rate it.
- Separate **infrastructure assumptions** (what Traefik, nginx, NetworkPolicies, Cloudflare must guarantee) from code
  bugs, and propose adding each one to the deploy checklist in the infra repo.
- Tell the user, in their language and in product terms:
  1. what was not found (no critical/high, no cross-tenant access...), so the reader knows the coverage;
  2. **fix before merge**; 3. **recommended**; 4. **pre-existing**; 5. **to confirm in infrastructure**;
  6. files not reviewed, if any.
  Each item: the real risk, who could exploit it or when it breaks, and the proposed fix.
- End with one question: which ones to fix. Fix nothing before the user answers.
- A finding the user turns into a product rule ("this must never happen") goes through `gutix:triage` step 4, so it
  is recorded and enforced in future reviews.
- Never post on the PR without asking: a PR comment publishes content.

## 6. Fix (mode=fix, only what the user approved)
One fix agent with the approved list, following `gutix:bug-fix` for each finding:
1. **Reproduce first:** write the test that shows the bug and run it. It must fail, for the reason the finding says.
   If it passes, stop and report: the finding was wrong or the test does not reach it.
2. Fix the code. Run the test: it must pass now.
3. Commit test and fix together, one commit per topic.
Then: pull before starting, never rebase or force-push; follow `test-suite-prune` (keep only the tests that catch
realistic bugs) and `org-observability`; update `docs/API.md` / `SECURITY.md` where behaviour changes; add or
extend the product-e2e scenario when a user-facing flow changes; full suite green before each push; report the CI status.

## 7. Learn from escapes
When a bug reaches production that this review should have caught, add a line to [catalog.md](catalog.md) (general)
or to the repo's `.claude/review.md` (specific), in the same PR as the fix.
