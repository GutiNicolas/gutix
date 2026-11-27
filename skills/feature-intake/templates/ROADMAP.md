# <Feature>: roadmap

Plan: local · <absolute path of this folder>
<!-- Lives at docs/features/<slug>/ROADMAP.md (or the repo's own plan folder). Single source of truth: any fresh
     session resumes from this file alone. Keep it under ~150 lines; details go in the task files.
     `local` (default): git-excluded in the main checkout, edited in place, deleted after the last phase ships, once
     its lasting decisions are distilled into docs/decisions and .claude/review.md (gutix:ship release).
     `committed`: in git, for plans people or sessions off this machine need; removed in the last release too. -->

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
<!-- Status: todo | in progress | integrated | changes asked | needs you | merged | blocked. One line per task,
     updated by gutix:ship: dispatch (in progress), integrate (integrated: squashed into release/<slug>-p<n>; blocked
     when the task's Result says so; needs you while its Gate: waits on the user) and release (merged: the reviewed
     release PR reached main). Workers never edit this file: parallel task PRs conflict on it, and an open PR is the
     task's status. Task PRs target the phase's release branch, never main. -->
### Phase 1: <name> (shippable on its own)
Release PR: — · last reviewed: — · last signed off: — · open: —
| Task | Repo | Depends on | Status | PR | Note |
|---|---|---|---|---|---|
| [T-01](tasks/T-01.md) <title> | <repo> | — | todo | | |

## Open questions
- <question> — <who decides>

## Handoff
<!-- Written by gutix:ship handoff, replaced each time. Date; Published (what reached main); In flight (open PRs,
     running sessions, blocked tasks and why); Next steps: for each, the project and the exact prompt to paste. -->

## Log
<!-- One line per session that changed the plan: date, what changed. Sign-offs (gate mode) are logged here too. -->
