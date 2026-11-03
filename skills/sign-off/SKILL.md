---
name: sign-off
description: "Before a release PR (or a PR that touches human-read paths) merges: expected vs built, the decisions the agents made, the hunks the user must read, what the checks don't prove, and a quiz the user answers and the agent grades; missed areas carry over. mode=brief catches up after time away (\"where was I\", \"what changed since\") without the quiz."
user-invocable: true
args:
  - name: target
    description: PR URL/number or branch (defaults to the current branch against its base)
    required: false
  - name: since
    description: "Commit to start from (default: the release line's last signed-off sha, else the merge base)"
    required: false
  - name: mode
    description: "gate (the default: sections 1-6, with the quiz) or brief (sections 1-4, records nothing)"
    required: false
---

# Sign-off

The user stays able to explain what merges. The agent builds the map and the questions; the user reads and answers;
the agent grades against the code. Output in the order below, short: a page, not a report.
Write the page, the quiz and the grading in the user's language, the one they write in; code and `file:line` stay as is.

## 0. Inputs, cheapest first
- **Roadmap:** the `docs/features/*/ROADMAP.md` (or the repo's plan folder) whose phase line or release line names the
  target's head branch or PR. The default branch itself has no roadmap. Read its Hypothesis, Definition of done and
  release line (`last signed off`, `open`).
- **Human-read paths:** `## Human-read paths` in `.claude/review.md`; when missing, the default: auth/sessions/
  permissions, tenant scoping, crypto/keys/erasure, migrations and data scripts, transaction boundaries and locking,
  public API/event contracts, payments, infra and security config.
- **Collection on Haiku:** one Haiku subagent gathers the task Results (decisions, assumptions, not verified, where to
  look), `git diff <since>..<head> --stat` matched against the human-read paths, the pr-review report if one exists,
  and `gh pr checks`; it returns a short list, no hunks. `brief` may run entirely on Haiku.
- **This session** (Sonnet or the main model) reads the human-read hunks itself, flags undeclared decisions, writes
  the quiz and grades it: a mistake there looks right, so it is never delegated to a cheaper model.

## 1. Expected vs built
The Hypothesis and Definition of done against what the diff does: met, partly, not met, or built but not asked for.
Then what changed in how the system works since the last sign-off, release over release, in a few lines.

## 2. Decisions and assumptions
From the task Results and the diff. A decision visible in the diff (a default, a cut, a reinterpretation, a new
dependency, a changed contract) that no Result lists is flagged **undeclared**.

## 3. Attention map
The hunks in human-read paths, plus the `Where to look` of `read`-tier tasks: `file:line` and one line why. The user
reads these now, before the quiz. Everything else is judged on evidence (section 4).

## 4. Checks
Each check (CI job, test suite, verify step, pr-review): what property it proves and what it doesn't (e.g. "unit
tests pass" proves the mapping, not the query against a real schema). Then what no check covers. `brief` stops here.

## 5. Quiz (gate only)
- First the **open areas** carried over from the release line: one new question on each.
- Then 3-5 questions (3 when every task is `evidence` tier): at least one per attention-map area and one "what happens
  when X fails". Each tied to a `file:line`, answerable from the hunk, not from the summary. No yes/no questions.
- Ask them all, then wait. The agent **never answers its own quiz** and shows no answer or hint
  before the user has answered: expected answers stay out of every message and file until then.
- Grade each answer against the code: right, partly, or wrong, with the `file:line` that settles it. A partly or
  wrong answer gets the explanation, a deeper one if the user asks, and its area becomes (or stays) an **open area**.
- Pass = every question of this round right. An open area closes only when a later question on it is answered right.

## 6. Record (gate only)
- **Pass:** in the release line, `last signed off: <reviewed head sha> (<date>, quiz <n>/<n>) · open: —` (every
  open area was answered right), and a Log line. The sha is the head that was reviewed, not the commit that writes
  the record. Commit the record alone (`sign-off: <sha>`) on the release branch: after it,
  `git diff --name-only <sha>..HEAD` must list only the roadmap. Any later change needs a new sign-off, `since=<sha>`.
- **Fail:** nothing is signed off. Record only the open areas (`open: <areas>`) and a Log line
  (`sign-off <sha> failed, <k>/<n> right`), so the next sign-off starts from them.
- **Override:** an explicit "merge anyway" from the user is logged as `override: <sha> merged without sign-off
  (<their reason>)`, never silently, and never as signed off.
- Never post on the PR without the user's yes: a comment publishes content.

## No roadmap
A bug-fix or one-off PR in human-read paths: intent comes from the PR description or the ticket; "no stated intent"
is itself a finding in section 1. Decisions come from the diff only, all marked undeclared. The record goes in the PR
body with the user's yes, or else as a line in this session's report.

## Report
The six sections (four in `brief`), then one line: signed off `<sha>`, failed (open areas), or brief only.
