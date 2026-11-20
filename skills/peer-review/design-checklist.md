# Design checklist (peer-review)

Same rules as `../pr-review/catalog.md`: each section has a **trigger** read from the diff; a reviewer gets only the
sections that fired, plus "Always". When unsure whether a trigger matches, it fires. Security, concurrency, data and
contracts live in the catalog; this file covers design, complexity and the repo's own protocols. Every check here is
done by reading the diff and running `rg`, never by exploring the repo.

## EXCLUDES (diff pathspecs, every command)
```
':(exclude,glob)**/*.lock' ':(exclude,glob)**/package-lock.json' ':(exclude,glob)**/pnpm-lock.yaml'
':(exclude,glob)**/go.sum' ':(exclude,glob)**/*.min.*' ':(exclude,glob)**/*.snap' ':(exclude,glob)**/__snapshots__/**'
':(exclude,glob)**/vendor/**' ':(exclude,glob)**/node_modules/**' ':(exclude,glob)**/dist/**' ':(exclude,glob)**/build/**'
':(exclude,glob)**/generated/**' ':(exclude,glob)**/*.generated.*' ':(exclude,glob)**/*.pb.go' ':(exclude,glob)**/*_pb2.py'
```
Add the repo's own generated paths (OpenAPI clients, codegen output) when you see them in `--stat`. List what was
excluded in "not reviewed" only if it was hand-edited (a lockfile with no manifest change, a snapshot with no code change).

## Always
Trigger: every PR.
- A function that does several things (parses, decides, persists, notifies): name the split in one line.
- Logic in the wrong layer: business rules in a controller, handler or UI component; HTTP or framework types deep
  in the domain; a repository that decides instead of fetching.
- Repo rules from step 1 (`CLAUDE.md`, `.claude/review.md`) that the diff breaks; an explicit rule is a nit at least,
  a contract or invariant is blocking.

## Size and responsibilities
Trigger: a new file over ~200 lines, a file the diff grows past ~400 lines, a function over ~50 lines, or a class
gaining a new dependency or a new kind of method.
- A class that now has two reasons to change; a god service every feature edits.
- Long parameter lists or flag arguments (`doThing(x, true, false)`) that hide two functions.
- Deep nesting where an early return or guard clause reads flatter.

## Abstractions
Trigger: a new interface, base class, generic, factory, strategy or config switch; a `switch`/`if` chain on a type
or kind.
- Too few: the same `switch` on a type in more than one place (it wants polymorphism or a table).
- Wrong ones: an interface with one implementation and no test double, a wrapper that adds nothing, an abstraction
  that leaks its implementation (callers must know which one they got).

## Duplication against the repo
Trigger: a new function, class, constant block or query of more than ~10 lines.
- `rg -n '<distinctive call or literal>'` on two or three tokens of the new code (not its name). A hit that does
  the same thing → suggest reusing it, with its `file:line`. No hit → stop; don't browse for similar code.
- Copy-paste inside the diff itself (two hunks that differ by a variable).

## Loops and complexity
Trigger: a loop, a stream/`map`/`filter`/`reduce` chain, recursion, or a nested iteration in the diff.
- The loop has its answer and keeps going: missing `break`, early `return`, `anyMatch`/`some`/`find` instead of
  `filter(...).length > 0`.
- O(n²) hidden in a lookup: `find`/`contains`/`indexOf`/`filter`/`includes` on a list inside a loop over another
  list → build a `Map`/`Set`/index once.
- O(n) that could be O(1): repeated linear search by id, sorting to get a max or min.
- Invariant work inside the loop: compiling a regex, building a formatter or client, parsing config, re-reading the
  same row.

## Data access cost
Trigger: a query, repository or ORM call, or an HTTP call to another service in the diff.
- N+1: a query or remote call inside a loop → one batched call (`IN`, join, bulk endpoint).
- Unbounded: no `LIMIT`, pagination or time window on a table that grows; loading all rows to filter or count in memory.
- A new filter or sort on a big table with no index for it (only when the schema is in the diff or the blast radius).

## Hot paths
Trigger: a request handler, message consumer, scheduler or anything per-event or per-request.
- Work repeated per request that could be done once (startup, cache with an owner and an expiry).
- Blocking I/O or a slow call added to a path that was fast; a call made twice for the same data.

## Tests
Trigger: a change in behaviour (not docs or config only). The catalog's "Intent" and "Tests and observability"
cover the rest.
- A new branch or error path no test reaches.
- Tests that only mirror the implementation (mock everything, assert the mocks were called) and would pass with the
  bug in place.

## Calibration (for the label)
- **blocking** when the cost is measurable: O(n²) or N+1 where n is unbounded or user-controlled, an unbounded query
  on a growing table, a broken contract, an explicit repo rule or invariant broken, a real bug.
- **suggestion** for design (size, layer, duplication, abstractions) and costs with a small, bounded n.
- **question** when it depends on something you can't see (data sizes, a caller in another repo, intent).
- Not a comment: taste, naming, formatting (linters own them), and anything the author's codebase already does the
  same way everywhere, unless a repo rule says otherwise.
