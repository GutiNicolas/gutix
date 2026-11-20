---
name: feature-intake
description: "Turn a requirement into a buildable plan across repos: challenge it, map the blast radius, split into phases with contracts, written as a roadmap and task files. Planning only; gutix:ship builds it. Use for a requirement, a plan to challenge or a feature."
user-invocable: true
args:
  - name: requirement
    description: The requirement, plan or feature request
    required: false
---

# Feature intake

Spend in proportion. A small, clear feature in one repo: a five-line plan in the chat, build it, done. The full path
below is for work that crosses repos, touches security or data, or takes more than a day.

This session plans and nothing else. A question or ops work outside the plan (a deploy, a failing CI, a bug in
another repo, a "while you're here") goes to a new session, never into this one: offer it, and keep planning here.

## 1. Understand and challenge
- Restate the goal in one or two sentences, in product terms: who gets what.
- Before drafting, ask once for the user's **hypothesis** (what they expect to change, and why) and **definition of
  done**, in their words, and write them into the roadmap as given. If they delegate it, write "delegated" there.
- Read the code and docs for what already exists (APIs, flows, design docs in `docs/` and the infra repo's
  `docs/app-requests/`). Never plan on assumptions you can check.
- Challenge: what is unclear, contradictory, risky or more expensive than it looks; a simpler way to the same goal.
  For each point, give your recommendation. Ask only questions whose answer changes the plan; take conventional
  defaults for the rest and say so.
- A decision with real trade-offs or in a human-read area (here or in step 3): the problem and the options first, ask
  their take, then recommend. Offer to go deeper until they can argue it unaided.

## 2. Map the impact (only what applies)
Start from the code that already exists, with grep and git, no subagents (read a function only where the matching
line can't decide):
- **Blast radius:** the symbols, endpoints, columns, events and config keys the feature changes; their callers
  (`rg -l '\b<Symbol>\b'` in the repo and the product's sibling repos: back + front + e2e); the contracts that
  describe them (`docs/API.md`, OpenAPI, event schemas, front API clients, e2e scenarios); the config (env vars,
  flags, secrets); and the tests that cover them today, which become acceptance criteria.

Then decide the rest:
- **Repos and contracts:** which repos change, and the API or event shapes between them.
- **Security:** read the change through gutix:pr-review's `catalog.md` — new surface, who may call it, tenancy,
  platform-level access, secrets. Decide the rules now, not in review.
- **Data:** migrations (expand/contract for canaries), backfills, volumes.
- **Operations:** what the infra repo must add (hosts, routes, env vars, secrets, NetworkPolicies) → an app request.
- **Observability:** the milestones and events worth recording (the repo's observability standard).
- **e2e:** one scenario per new user-facing flow in the product's e2e repo.
Product decisions taken here are recorded as in gutix:triage step 4.

## 3. Shape the work into files
The plan lives in the repo, not in this conversation: this session plans and ends, and every later step runs in a
fresh session that starts from the files alone. Use the [templates](templates/) (ROADMAP, task, worker-brief), under
`docs/features/<slug>/` (or the repo's own plan folder; for several repos, the repo that owns the main contract).
- One phase if it fits in one reviewable change per repo. Otherwise phases, each one shippable on its own, ordered
  so nothing deployed depends on a later phase.
- `ROADMAP.md`: goal, hypothesis and definition of done (the user's words), decisions (with the reason), contracts
  (API/event shapes, security rules from step 2), the phases with a release line and a status table, open questions.
- One `tasks/T-<nn>.md` per unit: repo, base branch, scope, contract, and **executable acceptance criteria** (each
  with the command that proves it, e2e included for user-facing flows). Specific enough that a Sonnet worker builds
  it without this conversation. Each gets a **Review tier**: `read` when it touches a human-read path
  (`.claude/review.md`, else gutix:sign-off's default list), `evidence` otherwise.
- Tasks that can run in the same wave and add a migration get their `V<n>` assigned in the task file: workers cut
  from the same main all pick the same "next free" number.
- Iterate on the files: when the user edits or comments, read the change and answer it; don't restate the plan.
- Task files name the phase's release branch, `release/<slug>-p<n>`, as their base branch (see `gutix:ship`).
- When the user approves, record it in the roadmap's Log, get the plan files onto main (a docs-only PR the user
  merges) and **end this session**. New sessions start from the base branch, so a plan that lives only on a side
  branch is invisible to them. Don't build from here.

## 4. Build: `gutix:ship`, in fresh sessions
Everything after the plan runs through `gutix:ship`, one fresh short session per step: `dispatch` (workers, one per
ready task), `integrate` (task PRs into the release branch), `release` (review, e2e, merge, clean-up), `handoff` and
`status`. Small or tightly coupled work (the five-line-plan case above) stays in one session and skips the files.

## Report
The files written (roadmap and tasks, with paths), the phases, decisions taken, what the user must do (secrets,
dashboards, approvals), and the next step: the `gutix:ship dispatch` session to start once the plan is on main.
