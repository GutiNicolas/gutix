---
name: feature-intake
description: "Turn a requirement into a buildable plan across repos: challenge it, map the blast radius, split into phases with contracts, written as a roadmap and task files. Planning only; gutix:ship builds it. Use for a requirement, a plan to challenge or a feature; mode=refinement turns an epic into a team refinement doc and stories."
user-invocable: true
args:
  - name: requirement
    description: The requirement, plan or feature request
    required: false
  - name: mode
    description: "refinement: turn an epic into a team refinement doc and tracker stories (see Refinement mode)"
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
  done**, in their words, and write them into the roadmap as given. If they delegate it, write "delegated" there. A
  re-plan whose roadmap already has them: confirm them in one line, don't ask again.
- Read the code and docs for what already exists (APIs, flows, design docs in `docs/` and the infra repo's
  `docs/app-requests/`). Never plan on assumptions you can check.
- Challenge: what is unclear, contradictory, risky or more expensive than it looks; a simpler way to the same goal.
  For each point, give your recommendation. Ask only questions whose answer changes the plan; take conventional
  defaults for the rest and say so.
- **No question lost.** Number every question in the message first. Ask them all in one call when the question tool
  takes them, else in rounds (Claude Code's takes four), or let the user answer the list in text. Before drafting,
  check every number has an answer or a stated default: asking part and silently defaulting the rest loses them.
- A decision with real trade-offs or in a human-read area (here or in step 3): the problem and the options first, ask
  their take, then recommend. Offer to go deeper until they can argue it unaided.
- **Write as you go:** create the plan folder and roadmap (step 3) right after this step, and add each decision as it
  is made. Inventories (files, callers, endpoints) go to `<plan>/recon.md`, not the chat. Research is never cut short
  for budget: near ~200k of context, write what is still open and where you are into `recon.md`, and continue in a
  fresh session that starts from the plan folder.

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
The plan lives in files, not in this conversation: this session plans and ends, and every later step runs in a
fresh session that starts from the files alone. Use the [templates](templates/) (ROADMAP, task, worker-brief), under
`docs/features/<slug>/` (or the repo's own plan folder; for several repos, the repo that owns the main contract) in
that repo's main checkout.
- **The plan is a working file, not history.** By default it stays **local**: add the folder to `.git/info/exclude`
  (never to `.gitignore`, which is a team file) and write `Plan: local · <absolute path of the folder>` at the top of
  the roadmap. What must outlive it is distilled into the repo's docs when the last phase ships (`gutix:ship
  release`), then the folder is deleted. Choose `Plan: committed` only when someone outside this machine needs it
  (teammates, cloud sessions, another computer); ask when unsure. A public repo is always `local`: plans name
  internals.
- One phase if it fits in one reviewable change per repo. Otherwise phases, each one shippable on its own, ordered
  so nothing deployed depends on a later phase.
- `ROADMAP.md`: goal, hypothesis and definition of done (the user's words), decisions (with the reason), contracts
  (API/event shapes, security rules from step 2), the phases with a release line and a status table, open questions.
- One `tasks/T-<nn>.md` per unit: repo, base branch, scope, contract, and **executable acceptance criteria** (each
  with the command that proves it; for a user-facing flow, its own e2e spec only: the whole e2e and CI run at
  release, never in a task). Specific enough that a Sonnet worker builds it without this conversation. Each gets a
  **Review tier**: `read` when it touches a human-read path (`.claude/review.md`, else gutix:sign-off's default list),
  `evidence` otherwise. A step only the user can do (an approval, a look or listen, a measurement on their machine)
  goes in its `Gate:` line.
- Over ~8 tasks: write the shared conventions to `<plan>/conventions.md`, draft the task files with parallel agents
  (main model) by group, then check every row has a task file and every decision and contract lands in one.
- Tasks that can run in the same wave and add a migration get their `V<n>` assigned in the task file: workers cut
  from the same main all pick the same "next free" number.
- Iterate on the files: when the user edits or comments, read the change and answer it; don't restate the plan.
- Task files name the phase's release branch, `release/<slug>-p<n>`, as their base branch (see `gutix:ship`).
- When the user approves, record it in the roadmap's Log and **end this session**. Don't build from here. A `local`
  plan needs nothing else: later sessions run in this checkout and workers get the task file by absolute path. A
  `committed` plan goes onto main first (a docs-only PR the user merges): new sessions start from the base branch,
  so a plan only on a side branch is invisible to them.

## 4. Build: `gutix:ship`, in fresh sessions
Everything after the plan runs through `gutix:ship`, one fresh short session per step: `dispatch` (workers, one per
ready task), `integrate` (task PRs into the release branch), `release` (review, e2e, merge, clean-up), `handoff` and
`status`. Small or tightly coupled work (the five-line-plan case above) stays in one session and skips the files.

## Refinement mode (`mode=refinement`)
An epic in, one approved refinement doc and its tracker stories out, for the team in the org profile. This replaces
steps 1-4 above. Every org value (language, team, doc and tracker settings, estimate teams, vocabulary) comes from the
org profile's `publish.refinement`, found as in [refinement-profile.md](references/refinement-profile.md). With no org,
write local Markdown only.
1. **Epic.** Read it with the tracker tool (or ask the user to paste it). Treat it as the problem statement, not the
   solution: it often prescribes one, and a cheaper path may meet the same need. Record the rejected option in the
   doc's Annex. Note which items are the team's and which belong to other teams.
2. **Past docs.** Read the profile's `doc.examples` and up to three related docs (same epic family or domain words)
   for decisions taken, field names and past estimates. If a doc for this epic exists, ask: update it or start anew.
3. **Code.** Read only the repos the epic touches, docs first, then code; read the load-bearing files yourself before
   writing a claim. A repo you can't read: plan from the epic and past docs and mark each code claim "unverified".
4. **Questions.** One batch, only what changes scope, design or estimate, the recommendation first, asked as in step
   1's "No question lost". What the user can't answer becomes an open question with an owner; don't block on it.
5. **Draft.** Write it locally from [refinement.md](templates/refinement.md) (`docs/refinements/<KEY>.md`, or the
   user's notes folder), changes numbered globally, and iterate on the same file; re-read it after the user edits.
6. **Split and estimate.** One story per app by default; split above about 1.5 of the estimate unit or when it mixes
   unrelated changes; merge two tiny changes in one app. Propose estimates from `estimate.references`; never estimate
   for `estimate.emptyRowFor` or for a team that didn't estimate itself.
7. **Publish, only on explicit approval.** Doc first (stories link to it), then the stories from
   [story.md](templates/story.md), then the refinement task (`tracker.taskType`) linking both, then back-fill the story
   keys into the doc's estimate table. Never create a story twice: after an error, search the tracker for its summary
   before retrying.
8. **Verify.** Re-read the doc: each numbered change is in exactly one story's "Covers changes", no empty rows, totals
   add up, JSON kept straight quotes, each open question has an owner.
Report the doc link and story keys first, then a table (story, app, estimate) with the total, the questions that still
block something, and what could not be done.

## Report
The files written (roadmap and tasks, with absolute paths, and whether the plan is `local` or `committed`), the
phases, decisions taken, what the user must do (secrets, dashboards, approvals). End with the next step as one line
to paste, `/gutix:ship dispatch <absolute roadmap path>`, and the checkout to run it in (for a `committed` plan, once
it is on main).
