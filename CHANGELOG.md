# Changelog

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
