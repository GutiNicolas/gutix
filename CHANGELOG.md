# Changelog

## 0.17.2

- Cursor workers stop polling logs. A Cursor chat gets no completion notice for a background command and has no
  Claude Code hooks, so workers started a check in the background and read its log with `tail` over and over.
  `gutix-ship`'s dispatch now gives each worker prompt Cursor's own rule in place of the brief's background-command
  line: run long checks in the foreground into a log file, read its end once, never poll or `tail -f`.

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
