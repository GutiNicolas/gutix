Implement `docs/features/<slug>/tasks/T-<nn>.md` in <repo>, starting from <base branch>.

- Read that task file and the roadmap's Decisions and Contracts; they are the whole spec. Don't re-plan.
- Run every acceptance criterion yourself and fill the task's "Result" section. Don't edit the roadmap: parallel task
  PRs conflict on it; the dispatch and integrate sessions keep its rows, and your open PR is the task's status.
- Fill every Result heading; write "none" only when it is true. A default you picked, a cut, or a requirement you
  reinterpreted because two clashed is a decision: list it. "Where to look" names what a human must read, not
  everything you changed.
- Open the PR against <base branch> (the phase's `release/` branch, never main) with the criteria results in the
  description. No review session follows per task: the release PR is reviewed once. Keep tool output small (CLAUDE.md "Context budget").
- If the spec is wrong or blocked, stop: write the problem under "Result" (in a draft PR if there is code), and end.
  Don't improvise a different design.
- A command running in the background (render, gate, e2e) is part of this turn: wait for its completion notice;
  never end the turn "waiting on" it.
- This task only. When the PR is open, end the session.
