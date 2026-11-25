## In Cursor

This copy runs in Cursor, where an agent can't start, rename or archive chats. Where the steps above need that, do
this instead:
- **Sessions are chats.** "A fresh session" is a new Agent chat; the user opens it. Skip the session title.
- **Models:** "Sonnet" means a fast model from Cursor's model list, "the main model" a stronger one; pick the closest
  the user has enabled, and ask before using a stronger one.
- **Repo rules:** besides `CLAUDE.md`, read the repo's `AGENTS.md` and `.cursor/rules/`.
- **dispatch, step 4:** for each ready task, create its worktree yourself:
  `git worktree add <repo>-worktrees/T-<nn> -b <task branch> origin/release/<slug>-p<n>`, next to the main checkout.
  Then show the user one prompt per task, each in its own fenced block: the filled worker brief, starting with
  `Work only in <absolute worktree path>` and naming the model. The user pastes each into a new Agent chat. End
  there: don't run the workers in this chat, and don't wait for them.
- **Worker prompts:** a Cursor chat gets no completion notice for a background command, and it loads neither the
  user's global `CLAUDE.md` nor Claude Code's hooks. So in each prompt, replace the brief's background-command line
  and its "Context budget" pointer with: "Run long checks (build, tests, the repo's e2e script) in the foreground with
  their output to a file, then read the end once: `<cmd> > <log> 2>&1; echo exit=$? >> <log>; tail -n 40 <log>`, and
  `grep` the log for more. Never start a check in the background and poll it (`tail`, `sleep`, reading the log again),
  and never `tail -f`. Read files by line range, and run `git diff --stat` before a full diff."
- **integrate, step 2:** a conflict beyond the shared ones becomes one more prompt for a new chat, as in dispatch.
- **release, step 2:** run `gh pr checks <pr> --watch --fail-fast` as a background command and read its result once,
  after the review; don't poll it.
- **release, clean up:** there is no `archive_session`. List the phase's chats for the user to close, and remove the
  worktrees dispatch created (`git worktree remove <path>`, each after its branch is merged), then their branches.
- **handoff:** the next steps are prompts to paste into a new Agent chat, opened on the checkout they name.
