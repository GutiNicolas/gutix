# Story template

One story per row of the estimate table, written so a dev builds it without going back to the doc. Translate headings
and labels into the profile's `language`. Create it with the tracker's `project`, `storyType`, `epicLinkField` and
`assigneeRequired`, in the tracker's Markdown format when it has one.

- **Summary:** verb + what + where, one line. E.g. "Consume the merchant counters endpoint in <app>".
- Criteria use WHEN / THEN / MUST / MUST NOT and are numbered `AC-REQ-<n>-<m>`.
- Every REQ has at least one **regression** criterion ("the rest stays as it is") and one **dependency failure**
  criterion (404, timeout, absent data).
- Class and file names only when checked in the code; otherwise "to confirm in the design".
- No real customer data: example documents, emails and phones.

````markdown
## Technical implementation <KEY> (<app>)

Epic: <KEY>
Refinement: <doc link>
Covers changes: 1, 1.1–1.3

Product context: two or three lines.

---

## Decision (don't reopen)

* **Chosen:** ...
* **Rejected:** ... Don't implement.
* **Explicitly out of scope:** ...

---

## REQ-1 — <title>

**Where:** `path/Class.ext`, `config/<file>` (`<key>`), ...

**What:** ...

```json
{ "example": "only when the contract changes" }
```

### Acceptance criteria

* [AC-REQ-1-1] WHEN <condition> THEN the system MUST <result>.
* [AC-REQ-1-2] WHEN <other tenant / other action> THEN it MUST keep today's behaviour.
* [AC-REQ-1-3] WHEN <dependency fails / 404 / timeout> THEN it MUST <degrade without failing the whole request>.

### Minimum tests

1. Happy path.
2. Regression: everything else is unchanged.
3. Error or absent data.

## REQ-2 — ...

---

## Out of scope

* ...

## Non-functional

* **Latency:** new calls on the critical path (yes or no) and expected cost.
* **Blast radius:** which tenants or plans it touches.
* **Idempotency:** what happens if it arrives twice.

## File map

| Area | Files |
|---|---|
| ... | ... |
````
