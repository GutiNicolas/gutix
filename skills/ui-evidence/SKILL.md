---
name: ui-evidence
description: "Prove a UI change with screenshots: tour the screens on mobile and desktop before and after, measure the primary CTA, and compose BEFORE | AFTER images to attach to a ticket or PR. Use for layout, scroll or CTA fixes, mobile or embedded (iframe) checks, screenshots and test evidence."
user-invocable: true
args:
  - name: target
    description: "What to prove: the ticket or the screens and the criteria to measure (default: the current diff's screens)."
    required: false
---

# UI evidence

A UI change is proven by numbers you measured and images you looked at, before and after. Each acceptance
criterion becomes a **measurement** ("CTA bottom ≤ viewport height on a small phone", "desktop button position
unchanged") and a **screenshot**.

Requires:
- Node, a system Chrome (`$CHROME_PATH`, the macOS app, or `google-chrome` / `chromium` on `PATH`) and the Playwright
  deps in `$GUTIX_DEPS` (default `~/.cache/gutix`). Missing deps → `bash <skill>/../design-doc/scripts/setup.sh` once (`<skill>` is this skill's folder; design-doc is its sibling).
  No Chrome → say so and ask for screenshots taken by hand.
- The app running locally (or a staging URL) with a way to reach each screen by URL.
- Optional: the ticket text and the design spacing, if the criteria come from them. Missing → take the criteria from
  the user's words and the existing screens, and say so.

Run the phases in order. Do not edit code before the baseline (phase 2) exists.

```
- [ ] 1 Criteria     - [ ] 4 Measure AFTER and look
- [ ] 2 Measure BEFORE   - [ ] 5 Compose evidence
- [ ] 3 Implement        - [ ] 6 Report
```

## 1. Criteria

- List the criteria and what is out of scope. Rewrite each as something measurable. One that cannot be (e.g.
  "matches the design") gets a stated target: say which values you will treat as the target.
- List the screens (URL ids) and the states each needs. If the backend cannot produce a state, mock it (below).

## 2. Measure BEFORE

Run `scripts/tour.mjs` from anywhere; it needs no packages beside the deps above:

```bash
node <skill>/scripts/tour.mjs --phase before --base http://127.0.0.1:8080/app \
  --screens home,signup,checkout --steps signup=3 --out "${TMPDIR:-/tmp}/evidence/shots" \
  [--devices iphone-se,desktop] [--cta "^(continue|next)$"] [--query lang=en] [--init-script stub.js] [--camera]
```

- Screens are `<base>/<id>?<query>` (`-` is the base itself, also in `--steps -=2`; an id may contain `/`). `--steps id=N` clicks the CTA and measures the next
  screens too; without it only the first one is measured.
- It writes `<out>/<phase>/results.json` and one PNG per screen × device × step, and records the CTA top and bottom,
  whether it is visible, the page overflow, and every inner scroller with its overflow.
- Default devices: `iphone-se` (568 px tall, the worst case), `iphone-13`, `pixel-5`, `desktop` (1280×720).
- `--cta` is a regex on the button text (default: continue, next, save, submit, confirm, done, ok, allow, get
  started). `--labels hidden=…,none=…` changes the words in the console summary.
- `--camera` grants the camera permission and a fake camera feed (only for screens that ask for it).
- A screen that fails becomes an `error` row; `results.json` is still written and the exit code is 1.
- `--init-script <file.js>` runs before the page's own scripts, for stubbing an SDK that never finishes in headless
  Chrome.
- Embedded in an iframe? Also run `scripts/iframe-shots.mjs` (see its header): it checks the CTA is on screen without
  scrolling inside a modal host and a fixed-height host; `--host-html` adds your own host.
- A full tour takes minutes: run it in the background and read the summary line per row.

Summarize the baseline as a table: screen, device, button position / viewport, hidden or visible.

### Mocking a state

When the backend cannot produce a state, mock it outside the repo. `scripts/mock-preload.mjs` answers a Node
server's `fetch` calls from a fixtures file (`scripts/fixtures.example.json` shows the shape: routes with a URL
regex, optional method and status, and a body) and passes every other request through:

```bash
MOCK_FIXTURES=/path/outside/repo/fixtures.json node --import <skill>/scripts/mock-preload.mjs ./server.js
```

Ask the user before choosing mock over a real backend when it changes what the evidence proves. Never commit the
mock or its fixtures.

## 3. Implement

Stay inside the criteria. Rules that held up:

- **Mobile first.** Change the base styles and keep the old values behind the desktop breakpoint, so desktop does not
  move.
- **Tokens, not magic numbers.** A value that repeats across screens becomes one token. A height-aware value such as
  `min(15rem, 25dvh)` shrinks only on short screens.
- **`dvh`, not `vh`.** In plain CSS keep the `vh` line first as a fallback.
- **Pin the CTA.** A `grid-rows-[1fr_auto]` layout with a scrolling content wrapper keeps the button visible and lets
  long content scroll inside.
- **Shrink an illustration's box and its SVG together**, or the SVG spills over the text and the numbers won't show it.
- If styles don't show up, check the generated stylesheet was rebuilt.

## 4. Measure AFTER and look

- Run the same tour with `--phase after` and diff `before/results.json` against `after/results.json` per screen,
  device and step. Rows that must not move (desktop) match exactly.
- **Open the PNGs.** Numbers miss overlap, clipping and spilled SVGs. Fix, re-shoot only the affected screens
  (`--phase after-fix`), and look again.
- A screen that still misses by a few px gets a tighter mobile-only spacing; tell the user how close it is.
- Run the repo's tests, lint and types, and count only what is new against `HEAD`. jsdom does not compute layout, so
  the measurements are the layout test.

## 5. Compose evidence

Write `pairs.json` with one entry per screen that matters (every screen that failed on the worst device, plus one
desktop per layout family): `[["01-checkout-iphone-se", "/abs/before.png", "/abs/after.png"]]`. Then:

```bash
node <skill>/scripts/compose.mjs --pairs pairs.json --out "${TMPDIR:-/tmp}/evidence/pairs" [--labels before=BEFORE,after=AFTER]
```

Names containing `desktop` render at 640 px per side, others at 320 px. `--labels` sets the two captions (any
language). **Open every composed PNG** before attaching it to the ticket or PR, and show them in the reply.

## 6. Report

Lead with the outcome, then: a before/after table with real numbers (CTA position vs viewport per device), the
composed images, honest risks (tight margins, headless-only quirks, out-of-scope issues noticed), and what is
committed or pushed.

Uploading to a tracker is not part of this skill: attach the composed PNGs with the tracker's own tool, or hand them
to the user.

## Anti-patterns

- Editing code before the baseline exists: there is nothing to compare against.
- Trusting `results.json` without opening the screenshots.
- Changing a base style without a desktop fallback, which moves desktop.
- Repeating one arbitrary value in ten files instead of one token.
- Counting every lint warning instead of the diff against `HEAD`.
- `git add -A` in a repo with local mocks or fixtures.
- Leaving scripts with tokens or credentials on disk.

## Scripts

Execute them, don't paste them. Shared helpers are in `scripts/lib.mjs`.
`node --test skills/ui-evidence/scripts/test/*.test.mjs` runs the unit tests; the Playwright ones skip without Chrome.
