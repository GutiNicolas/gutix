---
name: feature-intake
description: "Turn a requirement or feature request into a buildable plan across the org's repos: challenge it, map the impact, split into phases with contracts, written as a roadmap and task files that fresh worker sessions build. Use for a requirement, a plan to challenge or a feature to implement."
user-invocable: true
args:
  - name: requirement
    description: The requirement, plan or feature request
    required: false
---

# Feature intake

Spend in proportion. A small, clear feature in one repo: a five-line plan in the chat, build it, done. The full path
below is for work that crosses repos, touches security or data, or takes more than a day.

## 1. Understand and challenge
- Restate the goal in one or two sentences, in product terms: who gets what.
- Read the code and docs for what already exists (APIs, flows, design docs in `docs/` and the infra repo
  `docs/app-requests/`). Never plan on assumptions you can check.
- Challenge: what is unclear, contradictory, risky or more expensive than it looks; a simpler way to the same goal.
  For each point, give your recommendation. Ask only questions whose answer changes the plan; take conventional
  defaults for the rest and say so.

## 2. Map the impact (only what applies)
Start from `gutix:impact` for the code that already exists; then decide the rest:
- **Repos and contracts:** which repos change, and the API or event shapes between them.
- **Security:** read the change through gutix:pr-review's `catalog.md` — new surface, who may call it, tenancy,
  platform-level access, secrets. Decide the rules now, not in review.
- **Data:** migrations (expand/contract for canaries), backfills, volumes.
- **Operations:** what the infra repo must add (hosts, routes, env vars, secrets, NetworkPolicies) → an app request.
- **Observability:** the milestones and events worth recording (`org-observability`).
- **e2e:** one scenario per new user-facing flow in product-e2e.
Product decisions taken here are recorded as in gutix:triage step 4.

## 3. Shape the work into files
The plan lives in the repo, not in this conversation: this session plans and ends, and every later step runs in a
fresh session that starts from the files alone. Use the templates in `~/.claude/templates/feature/`, under
`docs/features/<slug>/` (or the repo's own plan folder; for several repos, the repo that owns the main contract).
- One phase if it fits in one reviewable change per repo. Otherwise phases, each one shippable on its own, ordered
  so nothing deployed depends on a later phase.
- `ROADMAP.md`: goal, decisions (with the reason), contracts (API/event shapes, security rules from step 2), the
  phases with a status table of tasks, open questions.
- One `tasks/T-<nn>.md` per unit: repo, base branch, scope, contract, and **executable acceptance criteria** (each
  with the command that proves it, e2e included for user-facing flows). Specific enough that a Sonnet worker builds
  it without this conversation.
- Tasks that can run in the same wave and add a migration get their `V<n>` assigned in the task file: workers cut
  from the same main all pick the same "next free" number.
- Iterate on the files: when the user edits or comments, read the change and answer it; don't restate the plan.
- When the user approves, record it in the roadmap's Log and **end this session**. Don't build from here.

## 4. Build (fresh sessions, not this one)
Each phase builds on one **release branch**, `release/<slug>-p<n>`, cut from main by the first dispatch of the
phase. Task files name it as their base branch; task PRs target it, never main. One review per release, not per task.
- **Dispatch** (a fresh, short session): read the roadmap, start one worker session per ready task (own worktree,
  Sonnet, from the release branch) with `worker-brief.md`, which points to the task file. Then end; don't wait for
  or follow the workers.
- **Workers**: implement one task, run its acceptance criteria, fill its "Result", open the PR against the release
  branch, set the roadmap row to "PR open", end. A wrong or blocked spec is written down and the row set to
  "blocked", never improvised around.
- **Integrate** (a fresh, short session, or the next dispatch): squash-merge every task PR whose `verify` is green
  into the release branch, one commit per task (`T-<nn>: <title>`), resolving the shared conflicts once (roadmap
  rows, migration numbers), then run the repo's full check once on the combined branch (its own exit code, not a
  wrapper's): green task PRs don't cover what they break together. Set the rows to "integrated". No review here. Later waves start from the release branch.
- **Review** (a fresh session, on the release PR to main): `gutix:pr-review` of the release diff, walked task commit
  by task commit against each task file; a panel by risk when the diff is large. On the main model when it holds
  contracts, security or tricky state. Fixes are commits on the release branch (`fix(T-<nn>): …`). If a wave must be
  reviewed before the next one builds on it, review only the diff since the last reviewed commit.
- **Release**: when the review is clean and CI (with the `e2e` label) is green, merge the release PR to main with a
  merge commit (keeps the per-task commits) and set the rows to "merged".
- **Status and next phase**: a fresh session reads the status table. Changes to the plan go into the roadmap and the
  task files, with a line in the Log.
- Small or tightly coupled work (the five-line-plan case above) stays in one session and skips the files.

## Report
The files written (roadmap and tasks, with paths), the phases, decisions taken, what the user must do (secrets,
dashboards, approvals), and the next step: the dispatch session to start.
