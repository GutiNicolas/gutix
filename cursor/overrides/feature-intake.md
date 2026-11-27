## In Cursor

In Cursor a story is built in one chat, on one branch, and ends at one PR that teammates review and merge (see
`gutix-ship`'s Cursor section). Where the steps above disagree, this wins:
- **The branch is decided, not asked.** One branch per story, named by the repo's branch rule (e.g. `feature/<KEY>`).
  Its base is the branch the repo's PRs target, or the branch of a story this one builds on while that one is not
  merged. Write it under the `Plan:` line of the roadmap: `Branch: <branch> · base: <base> · PR to: <PR target>`.
  Task files name that branch as both base and branch; there is no `release/` branch and no task PR. Phases are
  groups of tasks on that same branch.
- **Questions:** `AskQuestion` takes choices only; put every numbered question in one call when it takes them, else
  ask in rounds. The hypothesis and definition of done go in round 1 as a choice ("Delegate: the ticket's acceptance
  criteria and a green check (recommended)" or "I'll write them"); ask for their words in the message only when they
  pick the second. Every other open point is a numbered question in a round, never a "tell me if…" left at the end of
  a message.
- **Report:** the next step is one prompt to paste into a new Agent chat on the main checkout,
  `/gutix-ship dispatch <absolute roadmap path>`; that chat runs every task and opens the PR.
