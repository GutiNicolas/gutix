# Refinement doc template

Copy the block and fill it. Sections marked *(optional)* are deleted when they don't apply, never left empty; the rest
are always filled, even with one line. Translate headings and labels into the profile's `language`. Apply its
`vocabulary` and write for its `team` only: other teams appear as dependencies, never in detail and never estimated.
Verdicts and types are written as in the code.

````markdown
[Epic <KEY>](<epic url>)

# Refinement <KEY> – <epic title>

| | |
|---|---|
| Epic | [<KEY>](<epic url>) |
| Team | <profile team> |
| Apps affected | <app>, <app> |
| Other teams' refinements | [<team> – <title>](<url>) or "—" |
| Status | Draft |
| Date | YYYY-MM-DD |

## Context

Two to four lines: what happens today and why it isn't enough.

## Goal

One sentence.

## Scope

**In:**
- ...

**Out:**
- ...

## Solution

Three to six lines: the technical decision and why. If it reuses something that exists (endpoint, job, plan), name
it. If another option was weighed: "Alternative rejected in the Annex".

## Changes by app

### <App> (<repo>)

#### 1. <Change name>

1.1 – ...
1.2 – ...

**Contract** *(optional)*

```json
{ "type": "...", "details": { "new_field": "..." } }
```

**Integrations** *(optional)*

| Service | Kind | Critical | Timeout | Events |
|---|---|---|---|---|
| <service> | <kind> | Yes / No | same as <similar> | `<Service>Request` / `<Service>Response` |

**Persistence** *(optional)*: store, new fields, migration.

**Configuration** *(optional)*: per-tenant setting, flag.

### <Other app> (<repo>)

#### 2. <Change name>

2.1 – ...

## New or changed fields *(optional)*

| Field | From | To | New / Existing | Notes |
|---|---|---|---|---|
| `details.user_id` | Request | <app> `userId` | Existing | |
| `payments[].attempt.code` | Notification | Case | New | Hashed? → Open questions |

## Flow *(optional, when there is more than one hop between services)*

```text
Client ── POST /v1/evaluations ──▶ <app A>
<app A> ── GET /users ──▶ <app B>
  ├── APPROVE ─▶ async update
  └── DENY    ─▶ unchanged
```

## Dependencies on other teams *(optional)*

| Team | What we need | Blocks? |
|---|---|---|
| <team> | ... | No |

## Risks and mitigation *(optional)*

| Risk | Mitigation |
|---|---|
| ... | ... |

## Open questions

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | ... | <role or team> | Open / Resolved: <answer> |

## Estimates

| Task | Team | <estimate.unit> |
|---|---|---|
| [<STORY-KEY>](<story url>) – <summary> | <profile team> | 1 |
| [<STORY-KEY>](<story url>) – <summary> | <profile team> | 0.5 |
| | <estimate.emptyRowFor> | |
| Total | | 1.5 |

## Annex: rejected alternatives *(optional)*

| Criterion | Chosen: <option A> | Rejected: <option B> |
|---|---|---|
| Client contract | ... | ... |
| Effort | ... | ... |
````

## Section rules

- **Context / Goal:** from the epic, rewritten short. Don't copy whole paragraphs.
- **Solution:** our technical decision, not the product one.
- **Changes by app:** only apps of the team. Each number is something one dev can build and test, numbered globally
  across apps (1, 1.1, 2, 2.1 …); each number later maps to exactly one story. Real class and file names only when
  checked in the code.
- **New or changed fields:** replaces underline or colour for "new". One row per field that crosses a boundary.
- **Open questions:** everything that would otherwise sit as "(check)" or "?" in the middle of the text lives here,
  each with an owner. They don't block the draft.
- **Estimates:** one row per story, columns Task | Team | unit; which changes a story covers goes in the story
  ("Covers changes"), not here. The row of `estimate.emptyRowFor` stays empty. Last row `Total`, the sum of what was
  estimated. Rows only for the teams in `estimate.teams` that gave their own estimate.
