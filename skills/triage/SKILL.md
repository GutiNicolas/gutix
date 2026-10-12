---
name: triage
description: "Entry point when the kind, impact or next step of a problem, request or product decision is unclear: classifies, weighs impact, proposes options, records decisions and hands off to bug-fix or feature-intake. Not for clear, small tasks."
user-invocable: true
args:
  - name: topic
    description: What to triage (a bug report, request, finding or decision); defaults to the current conversation
    required: false
---

# Triage

Triage earns its cost only when the next step is unclear or a decision would otherwise be lost in a chat. Spend in
proportion: a clear small bug takes one line and goes to `gutix:bug-fix`.

## 0. Fast path (check first)
If it is clearly a bug with an obvious scope (one repo, no product question, no security or data risk): say
"bug, <repo>, <one-line impact>" and hand off to `gutix:bug-fix`. Same for a small, well-defined feature: hand off to
`gutix:feature-intake`. Stop here.

## 1. Classify
- **Bug:** the product does not do what it promises or what was decided, including wrong text or visuals.
- **Feature:** the product should do something new.
- **Product decision:** a rule about how the product must behave (who may do what, what is allowed, defaults). It often
  opens work of both kinds: code that violates the new rule is a bug, what is missing is a feature.
- **Question:** answer it; no hand-off.

## 2. Weigh the impact (only what applies, a few lines)
- Who is affected: tenants, tenant admins, staff, integrations, everyone.
- Security or data risk: exposure, escalation, loss, wrong results. Any of these raises urgency.
- Which repos and products it touches; whether it crosses products.
- Size (hours, days, phases) and urgency (now, this release, backlog).
Look at the code before judging; do not guess what exists. Anything you could not check is marked "(not verified)"
in the card.

## 3. Propose (only when there is a real choice)
Skip this step when the user already decided ("this must never happen"): go to step 4 with their words.
Two or three options, each with what it costs and what it risks, and one recommendation. Ask only questions whose answer
changes what happens next. The user decides.

## 4. Record the decision (product decisions and choices between options)
- One product: `docs/decisions/NNNN-<slug>.md` in the repo that enforces the rule (for several repos of one product, the
  backend). Across products (e.g. identity and apps, the edge, staff access): `docs/decisions/` in the infra repo. NNNN is
  the next free number in that folder (list it; never invent one). Format: [decision-template.md](decision-template.md). Keep it short.
- Write the rule with the user's meaning; show it in the card. Ask again only if you had to narrow or extend it.
- If the decision is a rule the code must always follow, add one line to the `Invariants` of `.claude/review.md` in each
  repo that could break it (create it from gutix:pr-review's template if missing), linking the decision. `gutix:pr-review` then
  enforces it on every PR.
- Record it in the same branch as the work it starts; if no work starts, commit it on its own.
- Not recorded: bug fixes without a product choice, implementation details (they live in the code and the PR).

## 5. Hand off
- Bugs → `gutix:bug-fix`, one per root cause.
- New behaviour → `gutix:feature-intake`.
- Pass what triage learned (impact, decision, affected repos) so the next skill does not redo it.

## Output
A short card, then the hand-off:
```
Kind: product decision (+ bug)
Impact: tenant admins with users:manage can disable or reset MFA of higher admins; security, every tenant.
Decision: nobody acts on a user who holds permissions they do not hold; nobody touches platform admins via the tenant API.
Recorded: identity-service docs/decisions/NNNN-no-acting-above-your-level.md; invariant in .claude/review.md.
Next: gutix:bug-fix in identity-service (destructive user actions skip the check).
```
