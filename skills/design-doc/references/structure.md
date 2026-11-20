# Design doc structure

Default order. Sections marked *(optional)* are deleted when they do not apply; none is left empty. Long docs group
sections into parts (`<div class="part">`), each opening with one line of what it answers. Headings are written in
the doc's language.

| # | Section | What it holds |
|---|---|---|
| 1 | Header | Title `<app>: <topic>`, the `.meta` line (repo, date, author, sources with branch and commit) |
| 2 | Summary | A `.box` of 3 to 10 lines: what, why, how, what it costs, main risks |
| 3 | Contents | The `.toc` with links to every part and section |
| 4 | Context | How it works today and why that is not enough, with a real case and the measured numbers |
| 5 | Goal | One sentence |
| 6 | Scope | Included, out of scope, what stays and what moves (with a figure) |
| 7 | Glossary | Table term / what it is / example, for a reader new to the technology |
| 8 | Solution on one page | The architecture in one figure and one paragraph |
| 9 | Design decisions | One `.decision` per decision: Decision, Alternatives, Why |
| 10 | Storage *(optional)* | Per store: structure and why, keys, commands, a worked example, memory and scaling |
| 11 | Data model | Full DDL in `language-sql`, an entity-relationship figure, why each table, indexes, retention |
| 12 | Messaging *(optional)* | Queues, JSON contracts, sizes, retries, dead letters |
| 13 | Flows | One sequence or flow figure per path, with the steps numbered as in the figure |
| 14 | API | Contract, JSON examples, response codes, validations |
| 15 | Code design | Class or module figure and the responsibility of each main piece |
| 16 | Concurrency and performance | Locks, replicas, latency budget per phase, expected load |
| 17 | Observability | Metrics (name, type, tags, what for), dashboards and alerts with their threshold |
| 18 | Operations | What to do when each dependency fails, manual jobs, alarms |
| 19 | Rollout and success criteria | Stages with a figure and one measurable criterion per stage |
| 20 | Test plan | Numbered edge cases with the expected result, load, failover |
| 21 | Changes per app | Numbered globally (1, 1.1, 2…): each number can be built and tested alone |
| 22 | Pitfalls | The `.pitfall` blocks an implementer needs, if not placed next to their section |
| 23 | Future work *(optional)* | What was left out on purpose and why it would be worth doing |
| 24 | Risks and mitigation | Table risk / mitigation |
| 25 | Dependencies on other teams *(optional)* | Team, what we need, whether it blocks |
| 26 | Open questions | Table #, question, owner, status. Product's questions stay open for Product |
| 27 | Estimates *(optional)* | Proposed sizes to validate, with how they were computed |
| 28 | Appendices | Discarded alternatives (comparison table) and the numbers used with their source |
