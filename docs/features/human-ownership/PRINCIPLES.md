# Human ownership: principles

<!-- The bar every gutix change in this feature is measured against. When the plan changes, check the change against
     this file first; when a principle turns out wrong, change it here with a line in ROADMAP.md's Log. -->

## The problem
Agents produce more, and more correct-looking, work than one person can read. Without anything forcing attention,
review slides from offloading (I delegate, I still own the result) to deferral (the output becomes my input) to
surrender (I can no longer explain what shipped). Each step feels reasonable. Nobody notices until a change needs a
mental model that no longer exists.

Reading everything doesn't fix it: the volume makes careful reading turn into skimming. The fix is to decide in advance
where the human looks, make the agent show its evidence and decisions, and block the merge until the human has done
their part.

## Principles (each one maps to a mechanism)
| # | Principle | Failure it prevents | Mechanism |
|---|---|---|---|
| P1 | The intent is mine: the goal, the definition of done and my hypothesis come from me, before the agent drafts. | The agent fills in a fuzzy idea and it looks finished (intent debt). | feature-intake step 1: the user's hypothesis and done-definition, in their words, in the roadmap. |
| P2 | "Verified" is defined before the work, not after it. | Rationalizing whatever comes back. | Executable acceptance criteria written at plan time; the worker doesn't write its own bar. |
| P3 | The agent shows what it decided, not only what it did. | Defaults, scope cuts and reinterpretations hidden behind "all done". | task Result: decisions not in the spec, assumptions, not verified, where to look. |
| P4 | Attention goes where the risk is; the rest is judged on evidence. | Reading everything evenly ends in skimming everything. | Review tier per task (`read` / `evidence`) and `Human-read paths` per repo in `.claude/review.md`. |
| P5 | A green check proves one property. Say which, and say what it doesn't prove. | A passing test with the same bug as the code. | verify and pr-review report what each check proves; the intent-and-tests reviewer compares tests with the spec. |
| P6 | Nothing merges that I can't explain. The human does the work; the agent only grades it. | Rubber stamping. | gutix:sign-off: attention map, then a quiz the user answers and the agent grades against the code; merge blocked until passed. |
| P7 | Throughput is capped by my review capacity, not by the agents'. | The orchestration tax: output piling up faster than anyone can stand behind it. | feature-intake dispatch: no new phase while the previous release isn't signed off. |
| P8 | Coming back to a context reads the decisions since I last looked, not the code. | Context switching resets understanding. | `gutix:sign-off since=<sha>` from the release's last signed-off commit. |
| P9 | Taste compounds: when I reject something, the reason becomes something that runs. | The same miss twice. | gutix:learn (already exists). |
| P10 | A gap I didn't understand stays open until I do. | Accepting a change because I lost the thread one or two changes back. | sign-off carries missed areas into the next sign-off until answered right. |
| P11 | On hard problems I bring my own judgment, not just a yes. | A complex solution accepted because it sounded right. | feature-intake shows the problem and options before the recommendation and asks my take first. |

## Rules for changing gutix under this feature
- Every change names the principle and the failure it serves. If it can't, it doesn't go in.
- Remove as much as you add: every skill line is read in every session that loads it.
- Agent steps stay in skills; human practices stay here (below). Don't turn a human habit into a mandatory agent step.
- A skill change ships with an executable check (`claude plugin validate`, a grep, a line cap, a trial run).

## Practices for me (not agent steps)
- Before a non-trivial ask, write down what I expect the answer to be, even a bad guess.
- When I hold a strong position on something open-ended, have a fresh context (another model if possible) argue the
  opposite, then decide myself.
- When an agent finishes, read the command and its output before the summary.
- After a long task: "what did you decide for me, and what didn't you check?"
- Weekly: one real thing done without an agent (a debug, a small change, a review by hand).
- Monthly: one line in the Log below on what I stopped doing, and whether I'm fine with that.

## Calibration log
<!-- Monthly, one line: date, what I stopped practicing, keep or reclaim. -->
