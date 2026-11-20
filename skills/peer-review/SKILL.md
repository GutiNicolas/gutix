---
name: peer-review
description: "Review a teammate's PR on GitHub: design, complexity, security, concurrency, contracts and repo rules, in a throwaway worktree with hard limits. Up to ~10 kind, ranked comments plus a reading map; one review posted only after your OK."
user-invocable: true
args:
  - name: pr
    description: PR URL or number (owner/repo#N when outside the current repo)
    required: true
---

# Peer review (`gutix:peer-review`)

For someone else's PR. LLMs write more code than anyone can read, so this finds what a careful human reviewer would,
and tells you which parts to read yourself. A false positive costs the author's time and your credibility: post less,
and be sure of it. Never edit, commit or push to their branch. Your own code goes to `gutix:pr-review`.

## Hard limits (cost is the main requirement)
- Read the diff plus the **direct** callers and contracts of what changed shape. Nothing outside that blast radius.
- Never let generated files, lockfiles, snapshots, vendored or minified code enter the context: exclude them in the
  diff command (`EXCLUDES` in [design-checklist.md](design-checklist.md)).
- No builds and no test runs, in the worktree or anywhere: read `gh pr checks` once.
- One reviewer by default; a panel (≤4) only for auth, tenancy, payments or migrations. Small diff (≤ ~300 changed
  lines after excludes): review it yourself, no subagent.
- A finding you can't confirm by reading the code path in a few minutes becomes a question or is dropped. Don't chase it.
- At most ~10 comments, ranked; the rest are named as "left out", one line each.
- Reports and drafts live in the session scratchpad (`<scratch>/peer-review/<repo>-<n>/`), never in the worktree.
  Reviewers reply in ≤150 words; open a report only for the finding you are checking.

## 1. Context
- **Already reviewed?** `me=$(gh api user --jq .login)`; your last review's sha:
  `gh api repos/<o>/<r>/pulls/<n>/reviews --jq "[.[]|select(.user.login==\"$me\")]|last|.commit_id"`.
  Head equals it: say so and stop. Head moved and `git merge-base --is-ancestor <sha> <head>`: review only
  `<sha>..<head>`, and check each of your open threads (fixed, answered, still open). Not an ancestor (rebase): full
  review, and say why. Never write a review record into their PR body or files.
- `gh pr view <pr> --json title,body,author,baseRefName,headRefOid,additions,deletions,files`, the open threads cut short
  (`gh api repos/<o>/<r>/pulls/<n>/comments --jq '.[]|{path,line,user:.user.login,body:.body[:200]}'`) and
  `gh pr checks <n>`. What others already said is not repeated.
- **Throwaway worktree:** in your local clone (usually `~/projects/<r>`; else
  `gh repo clone <o>/<r> <scratch>/<r> -- --filter=blob:none`), `git -C <clone> fetch origin pull/<n>/head <base>`
  then `git -C <clone> worktree add --detach <scratch>/pr-<n> <head sha>`. No branch, no `gh pr checkout`.
- **Rules, base as the floor:** `git show origin/<base>:CLAUDE.md` and `:.claude/review.md` if present, plus the
  linter configs by name only (CI runs them). Your own standard skills apply only in your own repos; elsewhere the
  team's conventions in the repo are the bar.
- **Blast radius:** as in `gutix:pr-review` step 1 (shape-change grep, `rg -l` for callers, contracts, data, config),
  capped at direct callers. Sibling repos only for a shared contract, and only `rg -l` on its name.

## 2. Checklists and shape
- Keep only the sections whose trigger matches the diff, from both lists, all with the same weight:
  `../pr-review/catalog.md` (security, concurrency, data, contracts) and [design-checklist.md](design-checklist.md)
  (design, complexity and performance, repo rules and tests). Write down which fired and why.
- **One reviewer** (Sonnet, background) gets every section that fired. A PR too big for one reviewer stays with one,
  on the riskiest files; the rest is listed as "not reviewed".
- **Panel** (auth, tenancy, payments or migrations only): one reviewer per fired risk area plus one for "design,
  complexity, intent and tests"; ≤4 in all.

## 3. Reviewer prompt
`gutix:pr-review` step 3's fixed part, with these overrides: the diff command carries `EXCLUDES`; no builds or tests;
the report goes to `<scratch>/peer-review/<repo>-<n>/<area>.md`; each finding names the proposed label (step 4), the
exact diff line (path, line, side) and, for a fix of a few lines, the replacement lines. Severity and certainty use
pr-review step 4's rubric. Mark pre-existing problems as such.

## 4. Verify, label, rank (yourself)
- Re-read in the code every finding you keep. Not confirmable quickly → question, or drop.
- **blocking** only when it breaks a contract, breaks a repo rule, or is a bug or a measurable cost (design-checklist
  "Calibration"). Everything else is **suggestion** or **question**. **nit** only for an explicit repo rule.
- Pre-existing problems the PR doesn't make worse go to you, not to the PR.
- Rank by importance; keep ≤ ~10; the rest is "left out" with one line each.
- **Public repo** (`gh repo view <o>/<r> --json visibility`): check every comment against the global `CLAUDE.md`
  public-surfaces rule; drop or reword what reveals how the product defends itself.

## 5. Write the comments
In the PR's language. One inline comment per finding, on the diff line that causes it:
- The label, the concrete scenario ("si llegan 2 webhooks iguales a la vez, …"), the why in one line, and the fix
  (a ```` ```suggestion ```` block when it is a few lines).
- **Tone:** gentle, readable by a junior and a senior alike. Guide with questions ("¿qué pasa si…?",
  "¿consideraste…?") rather than orders. Doubtful findings are always questions. No flattery or filler: no praise
  openers, no "great work", no closing compliments. Direct, respectful, useful.
- Review body: two or three lines, the blocking points and the verdict (approve / comment / request changes). On a
  re-review, say which of your earlier threads are now addressed.
- Save the draft as `<scratch>/peer-review/<repo>-<n>/review.json` (`commit_id`, `event`, `body`, `comments[]` of
  `{path, line, side, body}`, plus `start_line` for a multi-line suggestion). A line outside a diff hunk makes
  GitHub reject the whole review: put that finding in the body instead.

## 6. Remove the worktree, then show the user (inline, in chat)
`git -C <clone> worktree remove --force <scratch>/pr-<n>` first. Then, in the user's language and the same tone (no praise,
facts only):
1. **Map:** where the PR's design risk is, the hunks worth reading yourself (`file:line` and why), and what was
   checked and is fine.
2. **Comments**, numbered: label, `file:line`, the text as it would be posted, how it was verified.
3. **Left out** (one line each), **pre-existing** (for you only), **not reviewed** (files, sections).
4. The review body and the proposed verdict.
End with one question: post these comments or not (all, some, edited, none). Nothing is posted before the answer.

## 7. Post (only after the user's OK)
Apply the edits to `review.json`, then one review, never loose comments:
`gh api repos/<o>/<r>/pulls/<n>/reviews --method POST --input review.json`. `commit_id` is the head you reviewed
(if the branch moved since, say so). Report the review URL, then delete `<scratch>/peer-review/<repo>-<n>/`.
