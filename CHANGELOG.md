# Changelog

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
