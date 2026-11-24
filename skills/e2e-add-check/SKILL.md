---
name: e2e-add-check
description: Add a check to a user-facing flow in the org's e2e suite starting from what exists: read the suite's catalog (`<org>-e2e catalog`), pick the fixture, helper and tag that reach the state, extend the spec of that flow, run only the affected tag. Use when asked to "check that ...", "add an e2e for ...", or when a change adds or alters a user-facing flow.
user-invocable: true
args:
  - name: check
    description: "What the e2e must prove, in the user's words (\"a member cannot see the platform tab\")."
    required: true
  - name: suite-dir
    description: "Path of the e2e suite (default: the product-e2e checkout next to this repo)."
    required: false
---

# E2E: add a check

A check goes where its flow already lives, with the fixtures that already reach its state. Never start a new suite or
a new login helper from scratch. Which tests are worth writing at all: `test-suite-prune`.

## 1. Read the catalog
Find the suite's e2e CLI and runner in its `AGENTS.md` (called `<org>-e2e` and `scripts/run-e2e.sh` below). Run
`<org>-e2e catalog --suite-dir <suite-dir>` and read only its tables:
- **Tags**: which tag (and so which specs) owns the flow.
- **Fixtures** and **Helpers**: the one that creates the people and tenants, and the one that signs in or reaches the screen.
- **Actors**: seeded people exist only for the serial lane (see 3).

Then `grep -n` the owning spec for the screen or behaviour. Read that spec's neighbouring tests, not the whole suite.

## 2. Decide where it goes
- The flow has a spec: **add a `test(...)` to it** (or an `expect` to a test that already walks the same path). Reuse its
  sign-in and its describe-level tag.
- Only a new flow (new screen, new product integration, new auth step) gets a **new spec**, tagged with the closest
  existing tag in `test.describe(..., { tag: '@x' })`. A new tag needs a catalog entry; ask before inventing one.
- Name the test after the behaviour a person sees ("a member does not see the platform area"), not the ticket.
- Assert what the user sees or can do. Add the API-level assertion only when the screen cannot show the difference.

## 3. Data (contract C2)
- People, tenants, apps and merchants come from `createTenant`-style fixtures (`createTenant`, `sampleMerchant`), never
  from seeded people, and mail is read by the tag the fixture put in the address (`latestMessage`, `latestCode`,
  `latestLink`), never by time window.
- A test that must change global state takes Playwright's test lock or lives in the serial lane. If the spec is in the
  parallel lane (`lanes/*.ts`), seeded people are not allowed there; `npm run lint:lanes` checks it.
- Leave nothing changed that another spec relies on; the serial lane's seed guard fails a test that does.

## 4. Run only what you touched
- `scripts/run-e2e.sh --grep @tag` (or `<org>-e2e run --tags @tag`), in the background, never `playwright test` or
  `docker compose` by hand and never the whole suite. First run only the new test by its title with `--grep`.
- Jars of the repos you changed are built first (`mvn -q -DskipTests package`); `npm ci` once in a fresh worktree.
- A new or moved spec in a parallel lane also passes `--repeat-each=3` on its lane before the PR.
- Read the final `e2e: passed|failed ...` line, not the log. Exit 75 means the lock queue timed out: report who holds
  it and stop.

## 5. Report
In the PR: the check added, the spec and fixture it uses, the tag run and its result line. A check that cannot be
written yet (a missing fake, a missing fixture) goes in the PR as a gap, not as a skipped test.
