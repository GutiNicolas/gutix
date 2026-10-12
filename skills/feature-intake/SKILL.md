---
name: feature-intake
description: "Turn a requirement or feature request into a buildable plan across the org's repos: challenge it, map the impact, split into phases with contracts, build, and open PRs. Use for a requirement, a plan to challenge or a feature to implement."
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

## 3. Shape the work
- One phase if it fits in one reviewable change per repo. Otherwise phases, each one shippable on its own, ordered
  so nothing deployed depends on a later phase.
- For each phase with more than one repo, a **contract**: the decisions that complete the design, a table of units
  (unit, repo, scope), the API/event shapes, and the tests that matter. Short and specific enough that a subagent can
  build its unit without this conversation. Keep it in the scratchpad while working; what must outlive the work goes
  into the repo docs (API.md, design docs) or a decision record.
- Show the plan, get the user's yes, then build.

## 4. Build
- One branch per repo for the whole effort, one commit per topic (no PR per unit).
- Independent units in parallel through Sonnet subagents, each with its contract and the repo's rules (`CLAUDE.md`,
  `test-suite-prune`, `org-observability`). Small or tightly coupled work: do it yourself.
- Verify each unit's report against the code and run its checks (`gutix:verify`) before moving on; run the e2e
  suite across the branches.
- Open the PRs, then run `gutix:pr-review` on the big or risky ones.

## Report
What will exist when done, the phases and their status, decisions taken (with links), what the user must do (secrets,
dashboards, approvals), and the PRs.
