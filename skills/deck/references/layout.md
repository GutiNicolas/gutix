# Deck layout

The runnable spec is [template.html](template.html). Copy it and delete the archetypes you do not need. This page
says when to use each one and which layout rules must survive an edit.

## Archetypes

Numbered as in the template.

| # | Archetype | For |
|---|---|---|
| 1 | Title | Cover: title, date, author or team |
| 2 | Section divider | Big number plus a light title; one per section |
| 3 | Bullets on dark | The problem or an idea; three short points at most |
| 4 | Filled blocks | Impact numbers and consequences; one such slide per section |
| 5 | Metrics on light | A row of numbers, each with its caption and its tag (read, inferred, measured) |
| 6 | Code or config sheet | Real text, never a screenshot of text |
| 7 | Dependency chain | Indented chain, `(value)` per node, a total; the footnote says which number it is |
| 8 | Two chains | Before and after side by side; the workhorse for a change |
| 9 | Statement | One phrase on dark (questions, takeaway) |
| 10 | Closing | Last slide |

Alternate the surfaces: light for technical content (code, config, chains, comparisons, metrics), dark for narrative
(the problem, an idea, a statement). An all-dark or all-light deck reads as unfinished.

Reach for a chain (7, 8) before inventing a bar chart: each node carries its own number and the footnote names the
kind (reserved ceiling, configured value, measured p99). Chains of different kinds are not comparable.

## Theme

Colours and fonts come from the theme, never from a literal: `--ink`, `--muted`, `--line`, `--soft`, `--accent`,
`--accent-soft`, `--warn`, `--ok`, `--bad`, `--font-sans`, `--font-mono`, plus the optional `--paper`, `--off`,
`--accent-on-dark`, `--accent-fill`, `--accent-dark`.
- Accent on a light slide is `--accent`; on a dark slide it is `--accent-on-dark`. Using the wrong one is the most
  common way a slide ships with invisible text. A theme whose accent is bright on white sets `--accent-on-dark`.
- Dark slides and dark filled cards use `--accent-dark`; filled cards use `--accent-fill`.
- A new colour the theme lacks is a new token in the theme, not a literal in the deck.

## Layout invariants

Already in the template; keep each one if you touch the CSS. Each broke a real deck.

| Invariant | Why |
|---|---|
| `.slide-inner { justify-content: center }` | Without it every slide hugs the top and the empty bottom half reads as a rendering bug |
| `.slide-inner` bottom inset of at least `132px` | The control bar is viewport-anchored; at exactly 16:9 it lands on the footnote |
| Cards are `display: flex; flex-direction: column` | Block cards let long content spill past the border instead of growing |
| Big number `line-height: 1` plus a caption `margin-top` | A line height under 1 makes the caption climb under the digits |
| Uppercase tracked labels of about 18 characters or fewer, on one line | A wrapping label pushes one card's number down and breaks the row baseline |
| No `min-height` or `flex: 1` on card rows | It forces empty vertical stretch |
| Filled cards restate every text colour | Miss one selector and the text renders the same colour as its fill |
| `@media print` shows every slide at 1920×1080, one per page, reveals off | The PDF export prints the page as it is |
