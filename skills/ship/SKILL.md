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
- **Session title, first:** once the roadmap says which tasks this mode touches, rename this session (with the
  host's session-rename tool, on this session; skip if the host has none) to
  `<Mode> <slug> p<n>: <tasks>`, e.g. `Dispatch gutix-unify-skills p2: T-05`. A session typed in by hand otherwise
  keeps the host's title from the command line. Sessions this mode starts get a title too: `T-<nn> <task title>`.
- **Roadmap:** `docs/features/<slug>/ROADMAP.md` (or the repo's plan folder). Read Decisions, Contracts, the phase's
  release line and status table; open a task file only for a task this mode touches.
- **Writing the plan** depends on the roadmap's `Plan:` line. `local` (what feature-intake writes by default): the
  folder is git-excluded in the main checkout, so run this mode there, edit the files in place and commit nothing;
  worktrees don't contain it, so give paths to it as absolute paths. `committed` (also a roadmap with no `Plan:`
  line, the old behaviour): each write below is one plan-only commit, on the branch named there.
- **Release branch:** each phase builds on `release/<slug>-p<n>`, cut from main by the phase's first dispatch. Task
  PRs target it, never main. One review per release, not per task.
- **Rows:** `todo | in progress | integrated | changes asked | needs you | blocked | merged`. Only this skill edits
  them; workers never edit the roadmap (parallel task PRs would all conflict on it), and an open task PR is the task's
  status. Find a row by its task link (`[T-<nn>]`), never by its status text, which other rows share. `needs you`: it
  waits on the user (an approval, a look or listen, a measurement on their machine), named in the task's `Gate:` line.
- **One step, one session.** Check no other open session holds this step for this phase (the host's session list);
  if one does, stop. A notice that arrives after your step is done gets one line, then stop.
- **Waiting** on a long command: the host's own wait (Claude Code: `run_in_background` and its completion notice),
  never `sleep`, `tail -f` or a polling loop in the foreground.
- **No CI** (no remote, no workflows, or checks failing in seconds on billing): run the repo's local check once on the
  head, with nothing else running, write the command and result in the Log, and treat it as CI. No remote: no
  release PR; `release` merges the release branch into the local main with a merge commit.
- A plan change (scope, contracts, phases) is not shipping: edit the roadmap and task files with a Log line, or go
  back to `gutix:feature-intake`.

## dispatch
1. Ready = `todo` with every dependency `integrated` or `merged`. None: say what they wait on and end.
2. Cut the release branch from main if it does not exist yet, and push it.
3. Set the ready rows to `in progress` (committed plan: one commit on the release branch, pushed).
4. Start one worker session per ready task: fresh context, **Sonnet, its own worktree**, from the release branch, with
   [worker-brief.md](../feature-intake/templates/worker-brief.md) filled in. The brief points to the task file (by
   absolute path for a local plan); don't retype it. Tasks of the same wave that add a migration must have their
   `V<n>` in the task file: assign it first if missing. Never swap a worker session for a subagent. The host starts
   sessions only from a turn the user typed; when it refuses anyway: over its cap, start 5 and list the rest; "Trust
   repository", ask once for every target repo; a missing local branch, `git fetch` it first.
5. End. Don't wait for the workers.

## integrate
1. For each open task PR against the release branch, read `gh pr checks`. Green `verify` → squash-merge it into the
   release branch, one commit per task: `T-<nn>: <title>`, then remove that worker's worktree if clean (`git worktree
   remove`), else delete its git-ignored build output (`target`, `node_modules`, `dist`). Red or pending: leave it and
   say so.
2. Resolve shared conflicts once (migration numbers, lockfiles). A conflict beyond that, or red release CI: hand it to
   a Sonnet session with the conflict and the two task files; don't redesign here.
3. Don't rerun the workers' checks; rerun only what you resolved yourself.
4. Open or update the release PR to main: its CI is the one combined check (green task PRs don't cover what they
   break together). Read it, don't also run it locally. Put its link in the release line.
5. Set the rows to `integrated` (`blocked` when the task's Result says so, `needs you` while its `Gate:` is open);
   committed plan: one commit on the release branch. End with one line: `Dispatch T-<nn>?` (or `Release?`) and why
   it stops here (a new session needs a turn the user typed). If the user's command already said to go on, run
   `dispatch` here.

## release
A fresh session on the release PR to main; on the main model when the phase holds contracts, security or tricky
state.
1. **Last phase only, first: distill.** The plan goes after this release; keep what a future change must know, where
   it is read on demand, never in always-loaded files by default:
   - a product decision or a choice between options → `docs/decisions/NNNN-<slug>.md` (gutix:triage step 4's place
     and format);
   - a rule the code must always follow → one `Invariants` line in `.claude/review.md`, linking that decision;
   - a contract → the repo's API or design doc;
   - `CLAUDE.md` / `AGENTS.md` / `.cursor/rules` → only a convention every session in that repo needs, one line.
   Everything else (status, task details, handoff) is dropped: the PRs and commits keep it, the task Results included
   (workers copy them into their PR body). Commit it on the release branch as `docs: decisions from <slug>` before
   step 2, so CI, e2e and the review run once on it. A review fix that changes a decision updates its doc in the same
   fix commit. Public repos: the org's public-surface rules apply to what is distilled.
2. Add the `e2e` label (`gh pr edit <pr> --add-label e2e`): the whole e2e runs in CI, in the background. One
   `gh pr checks <pr> --watch --fail-fast` in the background; act on its completion notice.
3. In parallel, `gutix:pr-review` on the release PR, its unreviewed task commits grouped into at most 4 areas, each
   checked against its task files. It skips what its records say is already reviewed (task PRs reviewed by their
   workers included).
4. Fix every "fix before merge" finding without asking, through pr-review's fix mode, on the release branch
   (`fix(T-<nn>): …`); ask only about findings that change a decision, a contract or the scope. A version bump and
   CHANGELOG entry ride in that fix commit.
5. Clean = no "fix before merge" finding open and CI, e2e included, green. Then merge to main with a **merge commit**
   (keeps the per-task commits). `gutix:sign-off` (brief) is offered for the user to read, never required; it reads
   the plan, so it comes before the plan is removed.
6. Set the rows to `merged`, the release line and a Log line. Committed plan: one roadmap-only commit on main (a
   roadmap-only PR if main is protected); on the last phase that commit `git rm`s the plan folder instead. Local
   plan, last phase: ask the user, then delete the folder and its `.git/info/exclude` line (it is not in git: this is
   final).
7. **Clean up**, in this same session:
   - Don't archive sessions (the host refuses it from an agent): list the phase's sessions in the Report for the user
     to archive.
   - Delete the merged branches, remote and local: the task branches and the release branch, each checked merged
     first. Remove the phase's leftover worktrees and their build output as in `integrate`; say how much it freed.
   - Stop leftover servers this phase started (`lsof -nP -iTCP -sTCP:LISTEN | grep node`, check each is ours).

## handoff
Write (or replace) the roadmap's `## Handoff` section, dated:
- **Published:** what reached main (release PRs, versions).
- **In flight:** open PRs, running sessions, blocked tasks and why.
- **Next steps:** for each, the project (repo or folder) and the exact prompt to paste into a fresh session, in a
  fenced block, complete enough that nothing from this conversation is needed.
Committed plan: commit it alone, on the branch the roadmap lives on (the release branch while a phase is in flight,
else main). Show the user the prompts; for a local plan, each prompt names the checkout to run in. Also used when any
session passes the context budget.

## status
Read the status table and release lines, nothing else (no diffs). Per phase: merged, in flight, blocked or waiting on
the user and why, and the next mode to run. `gh pr checks` on the release PR only if the user asks about CI.

## Report
Start with a table `T-<nn> | state | PR | waits on`. Then what changed in the files (commit sha for a committed
plan), sessions started, sessions for the user to archive, branches deleted. End with the next prompt to paste
(after integrate, its `Dispatch T-<nn>?` line).
