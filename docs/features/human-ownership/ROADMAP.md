# Human ownership in gutix: roadmap

<!-- Single source of truth: any fresh session resumes from this file, PRINCIPLES.md and the task files.
     gutix and gutix-cursor are public: no names of private projects, companies or clients here (D12). -->

## Goal
Nicolas keeps ownership of what agents build: the intent and the bar are set before the work, what the agent decided
is visible, only the risky parts are read line by line, and nothing merges to main that Nicolas can't explain. gutix
enforces this with one new skill (`sign-off`) and small changes to the existing ones. The bar is
[PRINCIPLES.md](PRINCIPLES.md).

## Hypothesis (Nicolas' own words)
Puedo entender de mejor manera cómo cambia el código release tras release, entender cada decisión y no confiar a
ciegas en un modelo. Quiero poder bajar a tierra hasta entender problemas difíciles, para aportar mi criterio y mis
ideas en las soluciones complejas que Claude sugiera, subiendo mi barra de conocimiento, y no descarrilar empezando a
aceptar cambios porque no entendí uno de dos cambios atrás.

**Signals** (proposed by Claude from the above; Nicolas confirms or edits):
- Working: most releases pass the quiz on the first try, and misses in the same area get rarer; a missed area is
  asked again in a later sign-off and passed; in plans for complex solutions, some decisions end different from
  Claude's first recommendation because of Nicolas' input, and when they don't, Nicolas can say why they agreed.
- Not working: `override` shows up more than rarely; the quiz can be passed from the summary without reading the
  hunks; Nicolas can't explain the release from two back.

## Decisions
- D1. One new skill, `gutix:sign-off`. Catching up after a context switch is its `since=<sha>` brief mode, not a second
  skill — one skill to load, and it reuses the release's last signed-off commit as its state.
- D2. In sign-off the human does the work: the agent builds the attention map and the questions, Nicolas answers
  without the agent, the agent grades the answers against the code. Otherwise it is a fancier rubber stamp (P6).
- D3. The paths to read line by line are defined per repo (`## Human-read paths` in `.claude/review.md`), with a default
  list in sign-off for repos that don't have one yet: what counts as auth or data differs from repo to repo.
- D4. Feature templates move from `~/.claude/templates/feature/` (not versioned) to `skills/feature-intake/templates/`
  (versioned, shipped with the plugin, linked relatively like `verify-template.md`).
- D5. Human practices (hypothesis before asking, counter-argument, weekly no-agent work, monthly calibration) live in
  PRINCIPLES.md, not as mandatory steps in triage or learn: they are habits, and an agent step would bloat every run.
- D6. Shape: one repo of markdown. Each phase is built in **one session on one branch** (`feat/human-ownership-p<n>`),
  one commit per task (`T-<nn>: <title>`), one PR to master. No release-branch machinery and no parallel workers:
  the tasks share wording and contracts. Phase 1 on the main model (the skills encode judgment), phase 2 on Sonnet.
  Deviates from the global CLAUDE.md ("one task per worker session", Sonnet workers); approved by Nicolas 2026-11-03.
- D7. The sign-off record lives in the roadmap's release line and Log. A comment on the PR only with Nicolas' yes (it
  publishes content).
- D8. Removals: the feature-flow block in the global CLAUDE.md becomes a pointer to `gutix:feature-intake` (it
  duplicates the skill and loads in every session, gutix or not); the old templates folder is deleted after the move.
  Line caps per skill keep the additions honest.
- D9. The model follows the cost of being wrong: mechanical, checkable work goes to Haiku; what decides whether
  something merges never does. Haiku: sign-off's collection (sections 2–4) and its whole `brief` mode; dispatch;
  integrate when there are no real conflicts; phase status; impact; verify's run-and-report. Not Haiku: the sign-off
  quiz and its grading, undeclared-decision detection, pr-review reviewers, bug-fix root cause, planning, learn — a
  mistake there looks right.
- D10. Sign-off is required on every release PR to main (a 3-question quiz when the release is evidence-only). On a
  PR without a roadmap that touches human-read paths, pr-review offers it; it doesn't block. (was Q1)
- D11. At most 2 unsigned releases at once, across every feature and repo: dispatch starts nothing new while 2 release
  lines have a PR and no sign-off for their head. The per-feature phase gate still applies. (was Q2)
- D12. gutix and gutix-cursor are public. Text added or changed never names private projects, companies, clients or
  their repos; examples are generic, and private specifics live in private skills and the repos' own CLAUDE.md. The
  check reads the names from a local file outside the repo (`~/.claude/private-names.txt`), so the list itself is
  never published. Existing mentions are removed in T-09.
- D13. Open areas carry over (from the Hypothesis: "no descarrilar…"). A quiz area missed and then explained stays
  **open** until a later question on it is answered right; every sign-off starts with the open areas of the previous
  ones, so a gap from two releases back can't hide behind new changes.
- D14. Complex decisions are worked with Nicolas, not handed over (from the Hypothesis: "aportar mi criterio…"). In
  feature-intake, a decision with real trade-offs or in a human-read area is presented as the problem and the options
  first; Nicolas gives their take; then Claude recommends. Nicolas can ask to go deeper until able to argue it unaided.
- D15. gutix-cursor is still used: T-08 ports everything. (was Q4)

## Contracts
**task.md** (header) gains `**Review tier:** read | evidence`. `read` when the task touches a human-read path.
**task.md Result** has these headings, in this order, filled by the worker ("none" only when true):
`### Evidence` (each criterion: command + the one output line) · `### Decisions not in the spec` ·
`### Assumptions` · `### Not verified` · `### Where to look` (≤5 `file:line` with one line why).

**ROADMAP.md template**: a `## Hypothesis` section (the user's words) next to Goal, and a `## Definition of done`
(the user's words). The release line per phase becomes visible text:
`Release PR: <link> · last reviewed: <sha> · last signed off: <sha> (<date>, quiz <n>/<n>) · open: <areas or —>`.

**`.claude/review.md`** gains:
```markdown
## Human-read paths (read line by line before merge)
- src/main/java/**/auth/** — sessions and tokens
- src/main/resources/db/migration/** — schema and data
```
Default when missing: auth/sessions/permissions, tenant scoping, crypto/keys/erasure, migrations and data scripts,
transaction boundaries and locking, public API/event contracts, payments, infra and security config.

**`gutix:sign-off`** — args `target` (PR/branch, default current), `since` (sha; default the last signed-off commit),
`mode` (`gate` default | `brief`). Output, in this order:
1. Expected vs built: the roadmap's Hypothesis and Definition of done against what the diff does, and what changed in
   how the system works since the last sign-off (release over release, in a few lines).
2. Decisions and assumptions: harvested from the task Results and the diff; the ones nobody wrote down, flagged.
3. Attention map: the hunks in human-read paths, `file:line` + why. Nicolas reads these now.
4. Checks: each one, what it proves and what it doesn't; what no check covers.
5. Quiz (`gate` only): first the open areas carried over (D13), then 3–5 questions tied to `file:line`, at least one
   per attention-map area and one "what happens when X fails". Nicolas answers without help; a wrong answer gets the
   explanation, goes deeper if Nicolas asks, and the area stays open. Pass = every question of this round correct.
6. Record: the **signed-off sha** (the head that was reviewed, not the commit that records it) and the open areas in
   the release line, plus a Log line. `brief` mode stops after 4 and records nothing.

**No roadmap** (a bug-fix or one-off PR in human-read paths): intent comes from the PR description or ticket, and
"no stated intent" is itself a finding; decisions come from the diff only, all marked undeclared; the record goes in
the PR body (with Nicolas' yes, D7) or, without that yes, a line in the session's report.

**Gates in feature-intake**: Release merges only when `git diff --name-only <signed-off sha>..HEAD` lists nothing but
the roadmap file (recording the sign-off moves the head; any other change needs a new sign-off, `since=<signed-off
sha>`). Dispatch starts no task of phase n+1 while release p<n> is not signed off.

## Phases and tasks
### Phase 1: the ownership loop (shippable on its own)
Branch `feat/human-ownership-p1` → PR to master. Release PR: — · last reviewed: — · last signed off: — · open: —
| Task | Repo | Depends on | Status | PR | Note |
|---|---|---|---|---|---|
| [T-09](tasks/T-09.md) Remove private names from the public skills | gutix | — | done | | first: the others edit these files |
| [T-01](tasks/T-01.md) Templates into gutix, with tier and decisions | gutix | T-09 | done | | |
| [T-02](tasks/T-02.md) New skill gutix:sign-off | gutix | T-01 | done | | |
| [T-03](tasks/T-03.md) pr-review: attention map, what checks prove, human-read paths | gutix | T-02 | done | | |
| [T-04](tasks/T-04.md) feature-intake: intent first, complex decisions, tiers, gates | gutix | T-01, T-02 | done | | |
| [T-05](tasks/T-05.md) README, version 0.7.0, trial sign-off on a real release | gutix | T-01–T-04 | in progress | | |

### Phase 2: tighten and propagate (after phase 1 is signed off)
Branch `feat/human-ownership-p2` → PR to master. Release PR: — · last reviewed: — · last signed off: — · open: —
| Task | Repo | Depends on | Status | PR | Note |
|---|---|---|---|---|---|
| [T-06](tasks/T-06.md) verify and impact: what each check proves, Haiku | gutix | phase 1 | todo | | |
| [T-07](tasks/T-07.md) Global CLAUDE.md pointer, old templates removed | ~/.claude | phase 1 | todo | | needs Nicolas' yes |
| [T-08](tasks/T-08.md) Port to gutix-cursor | gutix-cursor | T-06 | todo | | |

## Open questions
- Q5. The git history of both repos still holds the names T-09 removes. Rewriting it means force-pushing public
  repos. Proposed: don't; remove them from the current files only. — Nicolas

## Log
- 2026-11-03: plan drafted (roadmap, principles, T-01–T-08) from the critical-thinking article discussion; awaiting review.
- 2026-11-03: D9 added (model by cost of being wrong); scopes of T-02, T-04, T-06 updated.
- 2026-11-03: Nicolas approved D6; Q1 → D10, Q2 → D11, Q3 → T-05 trial target chosen (named only locally, D12).
- 2026-11-03: Hypothesis written by Nicolas; D12–D15 and T-09 added from it and from "these repos are public".
- 2026-11-03: plan approved via GutiNicolas/gutix#1; phase 1 built in one session on `feat/human-ownership-p1` (D6).
- 2026-11-03: trial 1 caught that sign-off wrote in English for a Spanish-speaking user; fix(T-02): page, quiz and grading in the user's language.
- 2026-11-03: trial 1 (a past security release of a private project): sections 1–5 useful, quiz 0/4, not recorded at Nicolas' request; two misses became bug-fix sessions in that project. Lessons for phase 2 in T-05's Result.
