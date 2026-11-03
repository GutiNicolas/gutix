---
name: peer-review
description: "Review a teammate's pull request on GitHub: find the real bugs with gutix:pr-review's method, turn them into inline comments for the author, show them to the user to keep, edit or drop, and post one review only after their OK. Re-reviews look only at what changed since the last one. Use for someone else's PR; for your own code use gutix:pr-review."
user-invocable: true
args:
  - name: pr
    description: PR URL or number (owner/repo#N when outside the current repo)
    required: true
---

# Peer review

Same bug hunt as `gutix:pr-review`, different output: comments for someone else to act on. A false positive costs the
author's time and your credibility, so post less and be sure of it. Never edit, commit or push to their branch.

## 1. Context
- `gh pr view <pr> --json title,body,author,baseRefName,headRefOid,files,reviews,comments` and the open review threads
  (`gh api repos/<o>/<r>/pulls/<n>/comments`). What others already said is not repeated.
- **Re-review:** if you reviewed it before, review only `git diff <last reviewed commit>..<head>` and check whether each
  of your open threads was addressed (fixed, answered, or still open).
- Check it out away from your work: `git worktree add <scratchpad>/pr-<n>` + `gh pr checkout <n>` inside it.
- Rules that apply: the repo's `CLAUDE.md` and `.claude/review.md`. Your own standard skills (the ones your global
  `CLAUDE.md` names: backend, observability, `test-suite-prune`, the e2e repo) apply only in your repos; elsewhere,
  the team's own conventions in the repo are the bar, not ours.

## 2. Review
Run `gutix:pr-review` steps 2–5 on the PR (shape, reviewer prompt, severity and certainty, verify and consolidate),
with these changes:
- Default to one reviewer; a panel only for big PRs or auth, tenancy, payments or migrations.
- Proving tests stay in the worktree; they are never pushed. Mention in the comment that you reproduced it.
- Pre-existing problems are not comments on this PR unless the PR makes them worse; list them for the user apart.
- Skip `gutix:pr-review` step 6 (fix) entirely.

## 3. Draft the comments
One inline comment per finding, on the line in the diff that causes it, in the author's language (the PR's):
- A label: **blocking** (must change before merge), **suggestion**, **question** (you are not sure, ask), **nit**
  (only if it breaks an explicit repo rule).
- What happens and when: the concrete failure scenario, not "this could be a problem".
- The fix, as a GitHub ```` ```suggestion ```` block when it is a few lines.
- Plausible findings are written as questions, never as defects.
Plus a short summary for the review body: what the PR does well if worth saying, the blocking points, and the verdict
you propose (approve / comment / request changes).

## 4. Confirm with the user (always, before anything is posted)
Show, in the user's language, a numbered list: label, file:line, the comment text as it would be posted, and why you
believe it (how it was verified). Then the summary and the proposed verdict. Ask which to post, drop or reword, and
whether to change the tone or the verdict. Apply what they say and show the final version again only if it changed
substantially.

## 5. Post
Only after the user's OK, as one review (not loose comments):
`gh api repos/<o>/<r>/pulls/<n>/reviews --method POST --input review.json` with `commit_id` (the head you reviewed),
`event` (`APPROVE`, `COMMENT` or `REQUEST_CHANGES`), `body`, and `comments[]` of `{path, line, side: "RIGHT", body}`.
Report the review URL. Remove the worktree. Remember the head commit you reviewed for the next round (it is in the
review on GitHub: `gh api .../reviews` → your last `commit_id`).
