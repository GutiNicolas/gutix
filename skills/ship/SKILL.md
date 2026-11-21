---
name: ship
description: "Build a planned feature from its roadmap in short fresh sessions: dispatch workers, integrate task PRs into the release branch, review, merge and clean up the release, write the handoff, or report status. Use for \"despachá\", \"mergeá\", \"handoff\", \"cómo va\"."
user-invocable: true
args:
  - name: mode
    description: "dispatch | integrate | release | handoff | status"
    required: true
  - name: roadmap
    description: "Path or slug of the roadmap (default: the one under docs/features/ whose phase is in flight)"
    required: false
  - name: phase
    description: "Phase number (default: the first phase not merged)"
    required: false
---

# Ship

Every mode is **one fresh, short session**: it starts from the roadmap and the task files alone, does its step, writes
the result into those files, and ends. It never waits on or follows other sessions: CI is the monitor. Never two
sessions writing the same files. Keep tool output small (CLAUDE.md "Context budget").

## Common
- **Session title, first:** once the roadmap says which tasks this mode touches, rename this session (the host's
  session-rename tool on itself, e.g. `set_session_title` with `self`; skip if the host has none) to
  `<Mode> <slug> p<n>: <tasks>`, e.g. `Dispatch gutix-unify-skills p2: T-05`. A session typed in by hand otherwise
  keeps the host's title from the command line. Sessions this mode starts get a title too: `T-<nn> <task title>`.
- **Roadmap:** `docs/features/<slug>/ROADMAP.md` (or the repo's plan folder). Read Decisions, Contracts, the phase's
  release line and status table; open a task file only for a task this mode touches.
- **Release branch:** each phase builds on `release/<slug>-p<n>`, cut from main by the phase's first dispatch. Task
  PRs target it, never main. One review per release, not per task.
- **Rows:** `todo | in progress | integrated | changes asked | blocked | merged`. Only this skill edits them; workers
  never edit the roadmap (parallel task PRs would all conflict on it), and an open task PR is the task's status.
- A plan change (scope, contracts, phases) is not shipping: edit the roadmap and task files with a Log line, or go
  back to `gutix:feature-intake`.

## dispatch
1. Ready = `todo` with every dependency `integrated` or `merged`. None: say what they wait on and end.
2. Cut the release branch from main if it does not exist yet, and push it.
3. Set the ready rows to `in progress` in **one commit on the release branch**, and push.
4. Start one worker session per ready task: fresh context, **Sonnet, its own worktree**, from the release branch, with
   [worker-brief.md](../feature-intake/templates/worker-brief.md) filled in. The brief points to the task file;
   don't retype it. Tasks of the same wave that add a migration must have their `V<n>` in the task file: assign it
   first if missing.
5. End. Don't wait for the workers.

## integrate
1. For each open task PR against the release branch, read `gh pr checks`. Green `verify` → squash-merge it into the
   release branch, one commit per task: `T-<nn>: <title>`. Red or pending: leave it and say so.
2. Resolve shared conflicts once (migration numbers, lockfiles). A conflict beyond that, or red release CI: hand it to
   a Sonnet session with the conflict and the two task files; don't redesign here.
3. Don't rerun the workers' checks; rerun only what you resolved yourself.
4. Open or update the release PR to main: its CI is the one combined check (green task PRs don't cover what they
   break together). Read it, don't also run it locally. Put its link in the release line.
5. Set the rows to `integrated` (`blocked` when the task's Result says so), one commit on the release branch. End.
   Next: `dispatch` if more tasks became ready, else `release`.

## release
A fresh session on the release PR to main; on the main model when the phase holds contracts, security or tricky
state.
1. Add the `e2e` label (`gh pr edit <pr> --add-label e2e`): the whole e2e runs in CI, in the background. One
   `gh pr checks <pr> --watch --fail-fast` in the background; act on its completion notice.
2. In parallel, `gutix:pr-review` on the release PR, walked task commit by task commit against each task file. It
   skips what its records say is already reviewed (task PRs reviewed by their workers included).
3. Fixes the user approves land on the release branch (`fix(T-<nn>): …`), through pr-review's fix mode.
4. Clean = no "fix before merge" finding open and CI, e2e included, green. Then merge to main with a **merge commit**
   (keeps the per-task commits). `gutix:sign-off` (brief) is offered for the user to read, never required.
5. Set the rows to `merged`, the release line and a Log line, in one roadmap-only commit on main (a roadmap-only PR
   if main is protected).
6. **Clean up**, in this same session:
   - Archive every session of the phase that is still open, one `archive_session` call each. If one fails, stop and
     list the rest for the user; don't retry.
   - Delete the merged branches, remote and local: the task branches and the release branch, each checked merged
     first.
   - Stop leftover servers this phase started (`lsof -nP -iTCP -sTCP:LISTEN | grep node`, check each is ours).

## handoff
Write (or replace) the roadmap's `## Handoff` section, dated:
- **Published:** what reached main (release PRs, versions).
- **In flight:** open PRs, running sessions, blocked tasks and why.
- **Next steps:** for each, the project (repo or folder) and the exact prompt to paste into a fresh session, in a
  fenced block, complete enough that nothing from this conversation is needed.
Commit it alone, on the branch the roadmap lives on (the release branch while a phase is in flight, else main), and
show the user the prompts. Also used when any session passes the context budget.

## status
Read the status table and release lines, nothing else (no diffs). Per phase: merged, in flight, blocked and why, and
the next mode to run. `gh pr checks` on the release PR only if the user asks about CI.

## Report
What changed in the files (commit sha), sessions started or archived, branches deleted, and the next mode to run.
