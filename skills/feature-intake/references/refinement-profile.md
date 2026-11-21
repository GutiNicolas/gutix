# Refinement publish file

Refinement mode takes every org-specific value from one JSON file: the **publish file** of the org profile. Nothing in
the skill or its templates is tied to a company, tracker or doc tool.

## Finding it

1. `resolveOrg(process.cwd())` from [`../../design-doc/scripts/org.mjs`](../../design-doc/scripts/org.mjs) returns
   `{ name, dir, profile }` for the org whose `match` fits the repo's `origin`, or `null`.
2. `profile.publish.refinement` is a path relative to `dir`. Read that file.
3. No org, no `publish.refinement`, or an unreadable file: **write local Markdown only** (the draft and the stories,
   from the templates, in English) and say that nothing was published and why. Never ask for the values to be pasted.

## Fields

| Field | Meaning |
|---|---|
| `language` | Language of the doc, the stories and the chat. Translate the template's headings and labels into it. |
| `team` | The team the doc is written for. Other teams appear only as dependencies. |
| `doc.destination` | Where the doc is created (a folder id, space or path of the doc tool). |
| `doc.template` | The doc to copy (or the Markdown file in the org folder) that the draft follows. Empty: use `templates/refinement.md`. |
| `doc.examples[]` | Past refinement docs worth reading for decisions, field names and past estimates. |
| `tracker.project` | Project that holds the stories and the refinement task. |
| `tracker.storyType`, `tracker.taskType` | Issue types for a story and for the refinement task. |
| `tracker.epicLinkField` | The field that links a story to its epic. |
| `tracker.assigneeRequired` | `true`: set the assignee to the current user on every issue created. |
| `estimate.unit` | The unit estimates are written in. |
| `estimate.teams[]` | Teams that can own a row of the estimate table. |
| `estimate.emptyRowFor` | The team whose row stays empty for that team to fill in. Never estimate for it. |
| `estimate.references[]` | Past sizes by kind of work, as hints and not rules. |
| `vocabulary[]` | Fixed terms and spellings the doc must use, one rule per entry. |

All fields are required except `doc.template`, `doc.examples` and `estimate.references`, which may be empty. The
shape of each field is checked by `scripts/test/refinement-profile.test.mjs`.

## Example

A fictional org. The values mean nothing outside it.

```json
{
  "language": "en",
  "team": "Payments Core",
  "doc": {
    "destination": "docs-space/refinements",
    "template": "docs-space/templates/refinement-template",
    "examples": ["docs-space/refinements/ACME-120 Invoice retries"]
  },
  "tracker": {
    "project": "PAYCORE",
    "storyType": "Story",
    "taskType": "Task",
    "epicLinkField": "epic-link",
    "assigneeRequired": true
  },
  "estimate": {
    "unit": "person-weeks",
    "teams": ["Payments Core", "Mobile", "QA"],
    "emptyRowFor": "QA",
    "references": [
      "New endpoint with business logic: 1",
      "Consume an existing endpoint and pass the data on: 0.5 to 1",
      "Mostly reuse plus a config change: 0.5"
    ]
  },
  "vocabulary": [
    "Write \"Ledger service\", never \"ledger\" alone",
    "Verdicts and types exactly as in the code (`APPROVE`, `HOLD`)"
  ]
}
```

The org's `gutix-org.json` points at it:

```json
{ "name": "acme", "match": ["github.com/acme/"], "publish": { "refinement": "refinement.json" } }
```
