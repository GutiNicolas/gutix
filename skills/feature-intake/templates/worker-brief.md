Implement `<absolute path of the plan folder>/tasks/T-<nn>.md` in <repo>, starting from <base branch>.

- A local plan is not in your worktree: read and fill the task file at that absolute path, commit no plan file, and
  copy the whole Result into the PR body too (the plan folder is deleted when the feature ships; the PR stays).

- Read that task file and the roadmap's Decisions and Contracts; they are the whole spec. Don't re-plan.
- Run every acceptance criterion yourself, never the whole e2e or CI suite (they run once at release), and fill the
  task's "Result" section. Don't edit the roadmap: parallel task PRs conflict on it; the dispatch and integrate
  sessions keep its rows, and your open PR is the task's status.
- Fill every Result heading; write "none" only when it is true. A default you picked, a cut, or a requirement you
  reinterpreted because two clashed is a decision: list it. "Where to look" names what a human must read, not
  everything you changed.
- Open the PR against <base branch> (the phase's `release/` branch, never main) with the criteria results in the
  description. No review session follows per task: the release PR is reviewed once. If you do review your PR
  (gutix:pr-review), record it in the task's Result as `Reviewed: <sha> (<date>, <n> findings)`, so the release
  review skips it. Keep tool output small (CLAUDE.md "Context budget").
- If the spec is wrong or blocked, stop: write the problem under "Result" (in a draft PR if there is code), and end.
  Don't improvise a different design.
- A command running in the background (render, gate, e2e) is part of this turn: wait for its completion notice;
  never end the turn "waiting on" it.
- This task only. When the PR is open, end the session.
