## In Cursor

This copy runs in Cursor, where an agent can't start, rename or archive chats, and where a story ends at its pull
request: teammates review and merge it, not this skill. So in Cursor a story (one ticket, one roadmap) is built in
**one chat, on one branch, with one PR**. This section replaces the steps above wherever they disagree: nothing above
about `release/` branches, task PRs, squash-merging, merging to main, archiving sessions or deleting branches applies
here.

- **Sessions are chats.** "A fresh session" is a new Agent chat; the user opens it. Skip the session title and
  Common's session-list check. Dispatch's step is the whole story: a worker's completion notice comes before its end
  (step 3 below acts on it).
- **Models:** "Sonnet" means a fast model from Cursor's model list, "the main model" a stronger one; pick the closest
  the user has enabled, and ask before using a stronger one.
- **Repo rules:** besides `CLAUDE.md`, read the repo's `AGENTS.md` and `.cursor/rules/`.
- **One story, one branch.** The roadmap's `Branch:` line names it and its base (feature-intake writes it). Without
  that line: the repo's branch rule applied to the ticket (e.g. `feature/<KEY>`), cut from the branch the repo's PRs
  target; ask only if the repo has no rule. Every task and every phase commits to that branch: phases are groups of
  tasks, not branches. One worktree for the story, next to the main checkout and named after it:
  `<repo>-worktrees/<story>`.
- **Rows:** `integrated` means committed on the story branch with its criteria green; there is no `merged` row (the
  PR is the story's status).

### dispatch: runs the story to its PR, in this chat
Replaces dispatch, integrate and release above.
1. Create the story branch and its worktree if missing (`git worktree add <path> -b <branch> <base>`).
2. Launch the first ready task as a `Task` subagent in the background (`generalPurpose`, a fast model) working in the
   story worktree, with the worker prompt below. **One writer at a time:** tasks run one after another on the branch;
   a ready task waits for the running one.
3. On each completion notice: check the worker's commit is on the branch, the worktree is clean and its Result says
   the criteria passed; set the row `integrated` (`blocked`, or `needs you` while its `Gate:` is open) with a Log
   line. Then launch the next ready task without waiting for the user. Notices from a worker's own shell commands (an
   intermediate check) are not completions: one line at most, nothing else.
4. **Ask before the next launch** when a Result holds a decision that changes a later task, a contract or the scope (a
   default the worker picked, a gap no task covers, a reinterpreted requirement): `AskQuestion`, options numbered,
   recommendation first. No answer is not consent: wait. A `blocked` task: stop, say why, ask.
5. A user request mid-run (a fix, an index, a missing piece) becomes work in the plan: a line in a later task's
   criteria, or a new task file and row. It runs in turn, never in the worktree while a worker is in it. "Do it here"
   means this chat does it, after the running worker ends, on the same branch.
6. **After the last task, close the story:**
   - Last phase: distill (release step 1 above), committed on the story branch.
   - If the base moved, merge it into the branch (never rebase or force-push), then run the repo's full check once on
     the head, as in the worker prompt.
   - Push and open the PR against the base with the repo's PR template: what each task did, the decisions a reviewer
     should look at, the check results, and each task's Result (a local plan is not in git).
   - **End there.** Don't merge, don't wait for CI or approvals, don't delete the branch, the worktree or the plan.
     Offer `gutix-pr-review` on the PR as a prompt for a new chat.

### After the PR
- **Review comments** (a teammate's, a bot's, or pasted by the user): check each against the code, then one
  `AskQuestion` with an option per finding, recommended first. Fix the approved ones with one worker on the story
  branch, test first, one commit per finding; push and update the PR body. Conflicts with the base: merge it in, rerun
  the check, push. Never merge the PR.
- **release** in Cursor is the clean-up after teammates merged the PR (the user says so, or `gh pr view` shows
  `MERGED`): remove the story worktree and the local branch, then ask before deleting a local plan folder and its
  `.git/info/exclude` line. List the story's chats for the user to close.
- **status:** the rows, plus the PR's state and review decision.
- **handoff:** the next steps are prompts to paste into a new Agent chat, opened on the checkout they name.

### Worker prompt
The filled worker brief, starting with `Work only in <absolute story worktree path>`, with these changes (Cursor loads
neither the user's global `CLAUDE.md` nor Claude Code's hooks):
- Replace its PR lines with: "Commit on `<story branch>`, one commit per task (`<KEY>: T-<nn> <title>`), and push it.
  Don't open a PR and don't merge. Your task file's Result is your report. If the spec is wrong or blocked, write
  that in the Result, commit nothing broken, and end."
- Replace its background-command line and its "Context budget" pointer with: "Run each long check (build, tests, the
  repo's e2e script) as one Shell call whose `block_until_ms` covers the whole run (up to 600000), with its output to
  a file, then read the end once: `<cmd> > <log> 2>&1; echo exit=$? >> <log>; tail -n 40 <log>`, and `grep` the log
  for more. Never start a check with `&` or `nohup`: it can die when the call ends, and you poll a log that never
  finishes. Never poll (`sleep` loops, `tail -f`, reading the log again). If a run outlives the block, wait with
  `AwaitShell` if you have it, otherwise with one more call that has a long block. Read files by line range, and run
  `git diff --stat` before a full diff." Don't copy a repo rule into the prompt that says to check on a run after
  some minutes; it turns into polling.
