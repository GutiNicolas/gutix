# Changelog

## 0.18.0

- In Cursor a story is one chat, one branch, one PR. `gutix-ship dispatch` creates the story branch and one worktree
  named after the story, runs the workers itself as background `Task` subagents one after another on that branch
  (each commits and pushes, no task PRs), and launches the next on each completion notice. After the last task it
  merges the base if it moved, runs the full check once, opens the PR and ends: no merge, no waiting for CI, no
  clean-up. Teammates' review comments are fixed on the same branch; `release` is the clean-up after they merge. The
  user had to say "despachá" twice and ask for the PR by hand, because the override told dispatch to hand out prompts
  to paste and still inherited the release-branch flow.
- Dispatch in Cursor asks before the next launch when a worker's Result changes a later task, a contract or the scope;
  no answer is not consent. A request made mid-run becomes plan work that runs in turn, never in the worktree while a
  worker is in it.
- `gutix-feature-intake` gets a Cursor section: the story branch is decided (repo rule, base and PR target written as a
  `Branch:` line), not asked; hypothesis and definition of done are a round-1 choice, since `AskQuestion` takes choices
  only; the report hands over one `dispatch` prompt.
- `ship` finds a roadmap row by its task link, not its status text: matching `| in progress |` hit the wrong row three
  times in one run.
- `ship release` no longer archives sessions: it lists them in the Report for the user. The host refuses an agent's
  archive call, and release sessions retried it in loops or reported "all archived" anyway.
- `ship integrate` ends with one line, `Dispatch T-<nn>?`, and why it stopped: the host starts sessions only from a
  turn the user typed, so dispatch stalled after integrate with no word on why. Dispatch names the other refusals (the
  host's cap, "Trust repository", a missing local branch) and never swaps a worker session for a subagent.
- `ship` has one rule for a repo without CI (no remote, no workflows, billing failures): run the local check once on
  the head, log it, treat it as CI; with no remote, release merges into the local main. Sessions improvised each time.
- The whole e2e and CI suite run once, at release: task criteria name only the task's own e2e spec, and the worker
  brief says so. Workers each ran the full e2e and queued for 20 minutes on its lock.
- One step, one session: `ship` checks no other session holds its step, and a notice after the step is done gets one
  line. Integrate and release sessions grew into orchestrators that picked up other sessions' work.
- Release review fixes every "fix before merge" finding without asking and asks only about decisions, contracts or
  scope; the version bump rides in the fix commit. The user answered "fix all" almost every time.
- A task waiting on the user is a `needs you` row with a `Gate:` line in its task file, and `ship`'s Report starts
  with a `T-nn | state | PR | waits on` table and ends with the next prompt. Approvals and measurements on the user's
  machine had no state and were lost between sessions.
- `feature-intake` writes the roadmap right after step 1 and adds decisions as made, keeps inventories in
  `recon.md`, stops researching near ~200k, and drafts plans over ~8 tasks from a shared conventions file with
  parallel agents. Half the large intakes ran out of budget before writing any file.
- `pr-review` groups a release PR's task commits into at most 4 areas and stops after two rounds: it had started one
  reviewer per task commit, eight reviewers over three rounds.
- `ship`, `verify` and `pr-review` wait on long commands with the host's own wait, never a foreground `sleep` or
  `tail -f`, which the hook blocks and agents retried.
- Questions: every question is numbered first, asked in one call when the question tool takes them all (Cursor's took
  eight), else in rounds, and checked against its number before drafting. The skills claimed four per call on every
  host; what lost questions was asking part of the list and silently defaulting the rest.
- Smaller: a re-plan confirms the hypothesis and definition of done in one line instead of asking again; the
  feature-intake Report ends with a paste-ready `/gutix:ship dispatch` line and its checkout; integrate and release
  remove finished worktrees and their build output; `.claude/review.md` points at code by symbol, not line number;
  triage reads code with grep and git, not subagents.

## 0.17.2

- Cursor workers stop polling logs. A Cursor chat gets no completion notice for a background command and has no
  Claude Code hooks, so workers started a check in the background and read its log with `tail` over and over.
  `gutix-ship`'s dispatch now gives each worker prompt Cursor's own rule in place of the brief's background-command
  line: run long checks in the foreground into a log file, read its end once, never poll or `tail -f`.
- The rule fits how Cursor runs a command: one Shell call whose `block_until_ms` covers the whole check, never `&` or
  `nohup` (a worker's backgrounded `make verify` died with its call, and the worker polled the log for 20 minutes),
  and `AwaitShell` or one more long block when a run outlives it. It applies to `Task` subagents too, and the prompt no
  longer copies a "check on the run after N minutes" repo rule.

## 0.17.1

- `ship` now has a Cursor copy (`gutix-ship`), so feature-intake no longer points Cursor users to a skill they don't
  have. Cursor can't open, rename or archive chats: `dispatch` creates each worker's worktree and gives one prompt per
  task to paste into a new Agent chat, the release clean-up lists the chats to close and removes those worktrees, and
  CI is read once instead of watched.

## 0.17.0

- Feature plans are local by default: feature-intake writes the roadmap and task files git-excluded
  (`.git/info/exclude`) in the main checkout, with a `Plan: local · <path>` line, and no docs-only PR. `gutix:ship`
  edits them in place without commits and hands workers the task file by absolute path. On the last phase, `release`
  distills the lasting decisions into `docs/decisions/`, `.claude/review.md` invariants and the repo's API or design
  docs (always-loaded files only for a convention every session needs), commits that with the release, and deletes the
  plan after asking. `Plan: committed` keeps the old flow for plans needed off this machine; a roadmap with no `Plan:`
  line is treated as committed.
- The human-ownership plan is distilled and removed: its principles, with the rows 0.9.0 changed brought up to date
  and the lasting rules for changing gutix (model by cost of being wrong, no private names, local plans), are now
  `docs/PRINCIPLES.md`.
- No question is lost to a question tool's four-per-call limit (Claude Code and Cursor): feature-intake (and its
  refinement mode) and triage number every question and ask in rounds until each has an answer or a stated default;
  sign-off asks its quiz as numbered plain text.

## 0.16.0

- design-doc draws diagrams with a kit instead of hand-typed coordinates: `scripts/svg-kit.js` (shapes that return their
  geometry, computed links, text measured with the theme's fonts, a 13 px text minimum) and eight templates in
  `references/diagrams/` (architecture, class, data, ER, state, flow, rollout, sequence). `scripts/draw.mjs <slug>-figs/`
  runs each `Dxx.html` in Chrome with the doc's theme and writes a static `Dxx.svg` whose colours and fonts are still
  theme tokens, so inline, check, twin and PNG export are unchanged. Drawing an SVG by hand stays allowed. A drawing
  with event attributes, links or `url()` outside the file is refused, a source cannot load stylesheets beyond the
  theme's font css, a failed redraw removes the old `Dxx.svg`, and `draw.mjs` warns when the theme fonts did not load.

## 0.15.0

- An org plugin linked with `link-org` now loads in Cursor only inside clones whose `origin` matches its profile: the
  copy goes to `<repo>/.cursor/skills/`, hidden through `.git/info/exclude`, and nothing is installed globally.
  `update` re-runs the sweep; new command `unlink-org` (or `link-org --remove`) undoes it; `--projects-root` says where
  the clones are. An org linked earlier is migrated on the next update.
- The daily update no longer removes an org's skills when none of your clones match: it keeps the old copy and warns,
  pointing to `--projects-root`. `link-org` and `update` exit 1 when a repo could not be updated, a repo is updated all
  or nothing, `unlink-org` keeps an org folder that has unpushed commits, and a skill a teammate adds by hand with the
  org prefix is no longer hidden from git.

## 0.14.0

- New skill `e2e-add-check`: adds a check to a user-facing flow in the org's e2e suite starting from the suite's catalog
  (fixture, helper, tag), extending the flow's spec, with the test's own data, running only the affected tag.

## 0.13.0

- New skill `deck`: a self-contained HTML slide deck that explains a technical flow or change, researched fresh from
  the repo, in the org's theme, exported to PDF with the shared renderer.
- New skill `ui-evidence`: screenshots of a UI change on mobile and desktop, before and after, with the primary CTA
  measured, composed into BEFORE | AFTER images for a ticket or PR.
- `feature-intake` gains `mode=refinement`: an epic becomes a team refinement doc and tracker stories, using the org
  profile's refinement settings. `task.md` gains a few fields.
- `verify` compares lint and type diagnostics with the base branch and reports only the new ones.
- `ship` renames its session first, in every mode.

## 0.12.0

- Theme: a design doc takes its colours and fonts from `--theme`, the repo's `.design-doc-theme.css`, the linked org
  profile's theme, then the built-in one (`theme.mjs`; `--apply` writes it into the page). `check-doc.mjs` flags figure
  colours the theme does not have.
- Figures: `render.mjs` exports a doc's figures (or one `.svg`) to themed PNGs at 2x, with a size and aspect lint, and
  prints a page to PDF. It drives the system Chrome (`CHROME_PATH`, the macOS app, or `google-chrome`, `chromium`,
  `chromium-browser` on `PATH`) through Playwright installed by `setup.sh` in `~/.cache/gutix`.
- design-doc's publish step: one rule for Google Docs (paste the twin, insert the PNGs), with a clipboard fallback
  chain (`pbcopy`, `wl-copy`, `xclip`, or copy the file) instead of macOS only.
- Export hardening: figure ids become safe file names (two figures cannot write the same file), docs render with
  JavaScript off and the network closed (fonts still load), a figure with a nested svg is exported whole, timeouts
  on Chrome launch, page load, screenshots, the PDF and the npm fetch, `playwright-core` pinned, and setup or theme errors exit 2.

## 0.11.0

- Validator, Cursor installer and org profiles: `scripts/validate.mjs` checks the plugin, the Cursor installer writes
  the skills for Cursor, and org profiles link a repo to its theme and settings.
