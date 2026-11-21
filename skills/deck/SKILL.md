---
name: deck
description: "Build a self-contained HTML slide deck that explains a technical flow or change (an evaluation flow, a job, a queue, a ticket), researched fresh from the repo, in the org's theme, and export it to PDF. Use for a deck, slides, a presentation or a talk about how a part of the system works."
user-invocable: true
args:
  - name: topic
    description: "What the deck explains, and who it is for (dev, product or ops)."
    required: false
---

# Deck

An internal talk about one part of a system. The output is one self-contained `.html` file, 16:9, keyboard-driven,
in the repo's theme, plus a PDF on request. The deck is written in the language of the repo's docs (or the user's).

Requires:
- The repo that holds the topic, as the workspace. Another repo → say so and ask whether to research that
  one instead.
- Chrome or Chromium for the PDF and the visual check (`$CHROME_PATH`, the macOS app, or `google-chrome`,
  `chromium`, `chromium-browser` on `PATH`; `node ../design-doc/scripts/render.mjs --find-chrome` prints the one it
  would use). None → skip the screenshots and the PDF, and say so.
- Optional: a metrics MCP for measured numbers.

> **This skill carries method, not facts.** Every number, flag and name in its templates is a placeholder. Re-read
> the source before anything goes on a slide: a deck that faithfully repeats a stale note launders old information
> as current.

Four phases, in order. Do not write HTML in phase 1.

```
- [ ] 1 Research   - [ ] 3 Build
- [ ] 2 Validate   - [ ] 4 Verify and export
```

## 1. Research

Never skip it, and never shortcut it with what you already believe about the repo.

1. **Orient.** The repo's own map: README, architecture or steering docs, package layout. Necessary, not sufficient:
   a summary lags and flattens detail.
2. **Go into the code.** Open the classes that implement the behaviour and read the method bodies, not the names.
   What happens on failure, what the fallback is, which branch is reachable: they only exist in the bodies.
3. **Read config for the values.** Defaults in the committed config, runtime values per environment.
4. **Read the ticket last, if there is one.** It records intent at design time and parts of it never shipped. It
   tells you what the author meant, which serves the narrative and never the behaviour.

Whatever the topic, find it with `rg` for the term, then the docs for the package it lands in.

## 2. Validate

Every claim earns its slide. Mark each draft fact:
- **Sources disagree:** code, then config, then the ticket, then wiki or docs. If code and a ticket contradict each
  other, show the code and footnote the ticket.
- **`rg` anything you present as live behaviour**, flags above all. Would the slide still be true if the ticket had
  been abandoned?
- **Tag every number** as `read` (from code or config), `inferred` (you walked a graph or a chain) or `measured` (a
  metric). Never blend them silently, and put the tag on the slide, not only in your head.
- **Name the environment** for any runtime value.
- **Parallel work is never summed into a duration.** Adding every timeout of a stage gives a big number nothing can
  reach. Use the longest serial path through the dependency graph, the budget that caps it, and the floor the change
  guarantees the final step.

## 3. Build

Start from [references/template.html](references/template.html); [references/layout.md](references/layout.md) says
when to use each archetype and which layout invariants to keep.

1. Draft the outline as slide titles in chat, one screen. If the user already said to go ahead, generate at once.
2. Copy the template to `docs/decks/<slug>.html`. Keep the archetypes you need, delete the rest, fill them.
3. **Theme.** `node ../design-doc/scripts/theme.mjs --apply docs/decks/<slug>.html [--theme <css>]` writes the
   resolved theme (`--theme`, the nearest `.design-doc-theme.css`, the org profile's theme, the built-in one) between
   the `gutix-theme` markers. Use only `var(--token)` in the deck; a colour the theme lacks is a new token in the
   theme, not a literal.
4. Diagrams are CSS, HTML or inline SVG inside the 1920×1080 stage. No scroll inside a slide.
5. Set `DECK_SLUG` in the script and bump `data-deck-version` on every rewrite, or a stale `localStorage` snapshot
   resurrects the old deck in the browser.
6. Do not commit the HTML unless asked.

| Knob | Default |
|---|---|
| Density | Reading-first, for async reading. **Speaker-led** when they say keynote or name a live audience: fewer words, more slides, one idea each |
| Scope | One topic per deck. Two unrelated topics are two files, cross-referenced on the cover; decide before generating, because splitting later rewrites both |
| Output | `docs/decks/<slug>.html` |

Ask at most one question, and only if it blocks: the audience (dev, product, ops) or the density.

**Outline.** One spine, whatever the topic; cut what has nothing to say and split a slide that overflows.

1. Cover (1) · 2. Section divider (2) · 3. The problem in the audience's terms (3 or 5) · 4. Vocabulary, only the
words they need and the traps in them (3) · 5. The change as one idea (4) · 6. The mechanism: formula, config or flow
(6, 7) · 7. Before and after with real numbers (8) · 8. Edge cases, and what did not change (3) · 9. How we know it
works: test, metric (5) · 10. Takeaway restating slide 5 (9) · 11. Questions (9), closing (10).

Swap-ins by topic:
- **Execution flow or plan:** when it applies (gates), stage map, serial versus parallel, diff against the default,
  failure and skip path.
- **Timeout or budget:** two clocks, configured versus computed; the reservation formula; the global budget and its
  overrides; before and after per service and per stage. A flag or rollout slide only if `rg` finds the flag in code.
- **Async, queue or job:** what routes where and who decides; the happy path; failure and retry semantics; what
  happens when retries run out and whether it can be replayed.
- **Feature or ticket:** ticket id, flow before, flow after, edge cases, rollback.

## 4. Verify and export

Not done until you have looked at the slides.

```bash
node ../design-doc/scripts/render.mjs docs/decks/<slug>.html --pdf --out docs/decks/<slug>.pdf
```

`render.mjs` is the only renderer: it finds Chrome, prints one 1920×1080 page per slide, and exits 0 on success. It
is the same script design-doc uses; do not script Chrome yourself. Read the PDF pages (or a screenshot of each
slide) and check: nothing clipped by a card border, no text on a same-tone background, nothing under the control
bar, no half-empty slide. Deep link to a slide with `#7`. Keys: ← → space.

## Anti-patterns

- Trusting the template's example numbers, or a note's, as current facts.
- Stopping research at the docs without opening the code.
- Presenting a ticket's design as shipped behaviour without a hit in the code.
- Summing parallel work into a duration.
- Mixing configured and computed numbers as if they were the same clock.
- A literal colour in the deck, or the light-slide accent on a dark slide.
- A screenshot of a config file as the whole slide.
- Two unrelated topics in one deck.
- Shipping without looking at the rendered slides.
- Reusing a `localStorage` key without bumping `data-deck-version`.
- PowerPoint, unless the user asked for `.pptx`.
