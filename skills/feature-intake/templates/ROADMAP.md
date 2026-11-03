# <Feature>: roadmap

<!-- Lives at docs/features/<slug>/ROADMAP.md (or the repo's own plan folder). Single source of truth: any fresh
     session resumes from this file alone. Keep it under ~150 lines; details go in the task files. -->

## Goal
<Who gets what, in one or two sentences.>

## Hypothesis
<!-- The user's own words, written before Claude drafts: what they expect to change and why. "delegated" if they
     handed it over. -->

## Definition of done
<!-- The user's own words: what must be true to call this finished. -->

## Decisions
<!-- Settled choices, one line each, with the reason. Never re-open without the user. -->
- <decision> — <why>

## Contracts
<!-- API/event shapes and rules shared by more than one task. Link to API.md / design docs when they exist. -->

## Phases and tasks
<!-- Status: todo | in progress | integrated | changes asked | merged | blocked. One line per task, updated by the
     dispatch (in progress), the integrate session (integrated: squashed into release/<slug>-p<n>; blocked when the
     task's Result says so) and the release (merged: the reviewed release PR reached main). Workers never edit this
     file: parallel task PRs conflict on it, and an open PR is the task's status. Task PRs target the phase's release
     branch, never main. -->
### Phase 1: <name> (shippable on its own)
Release PR: — · last reviewed: — · last signed off: — · open: —
| Task | Repo | Depends on | Status | PR | Note |
|---|---|---|---|---|---|
| [T-01](tasks/T-01.md) <title> | <repo> | — | todo | | |

## Open questions
- <question> — <who decides>

## Log
<!-- One line per session that changed the plan: date, what changed. Sign-offs and overrides are logged here too. -->
