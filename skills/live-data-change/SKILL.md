---
name: live-data-change
description: "Change data in a live PostgreSQL without blocking it (backfills, renames, merges, big deletes, psql pipelines), and the counter/projection design that keeps it cheap. Use for data migrations, backfills, one-off production SQL, counters or projections."
user-invocable: true
args:
  - name: change
    description: "What data has to change, in which tables, and roughly how many rows or keys"
    required: false
---

# Live data change

The database never stops for the change: every statement is short, reaches big tables only by index, holds row
locks on one batch at a time, and can be cut and rerun.

## Design that makes changes cheap
- **Source of truth as mergeable deltas.** Rows keyed by the natural key with a unique index, written with
  `INSERT ... ON CONFLICT DO UPDATE`: counts and amounts add, first-seen takes the least, last-seen the greatest.
  Merging two keys is then `WITH moved AS (DELETE ... RETURNING ...) INSERT ... SELECT ... FROM moved ON CONFLICT ...`:
  one statement, no read-before-write, rerunnable, safe while the app keeps writing.
- **Projections recomputed, never incremented.** After applying deltas, rebuild the projection row of each touched key
  from its source rows (`INSERT ... SELECT SUM(...) ... ON CONFLICT DO UPDATE SET x = EXCLUDED.x`), never
  `x = x + 1`. A wrong projection heals on the key's next event; a migration fixes the source and runs the same
  recompute; nothing that can be rebuilt needs a backup.
- The next event is the safety net, not the plan: keys with no later events stay wrong unless the migration recomputes them.
- **Hot keys:** a fixed number of stripes in the key spreads concurrent writes; reads sum the stripes.

## Steps
1. **Measure** on the real database, read-only: table sizes, affected rows and keys, the indexes, and `EXPLAIN` of
   the queries you plan to run.
2. **Generate, don't hand-write.** A script renders a dry-run file (checks and counts only) and an apply file from
   the same code, both committed; a test fails if the committed files differ from the generator.
3. **Index only.** Every query on a big table constrains the leading column of an index. For a list of keys use
   `= ANY(array)` or `LATERAL` per key, so the planner cannot hash-join the whole table. A test runs
   `EXPLAIN (FORMAT JSON)` with `enable_seqscan = off` and fails on any scan without an index condition on the leading
   column: a full index walk with a filter is as bad as a seq scan.
4. **Batches.** Affected keys go into a temp table; a `DO` block loops over a few hundred keys with a `COMMIT` per
   batch (autocommit, never `--single-transaction`). Row locks live for one batch.
5. **Concurrency.** Before recomputing, lock the target projection rows `FOR UPDATE` in key order so an event that
   commits meanwhile is included; finish with a second reconcile pass and a check that raises if old rows remain.
6. **Caps.** `lock_timeout` of a few seconds; a finite `statement_timeout` (it covers a whole `DO` block, so size it
   for all batches, 10-20x the estimate). A cut run is rerun and continues: no backup tables, no big copies (backups
   are the DBA team's).
7. **Pipeline-proof.** Start the file with `\set ON_ERROR_STOP on` (without it psql runs past a failed block, exits 0
   and the pipeline reports success) and `\timing on`; end with a `SELECT` of the outcome, because the log may drop
   NOTICEs.
8. **Run.** Dry-run right before the apply, on the same instance (it warms that instance's cache); its counts must
   match the measure; then the apply.
9. **Verify after**, by index: zero old rows; every projection equals the sum of its source rows (`LATERAL` by primary
   key); a sample with the run's timestamp; one read through the API.

## Tests (disposable PostgreSQL)
Dry run writes nothing; apply on a seed with colliding keys gives the merged values; a second run changes nothing; no
table left behind; a schema guard refuses an unknown column; an app write committing during the recompute is kept;
the `EXPLAIN` check; every file has `ON_ERROR_STOP` and both timeouts.

## Report
Measured sizes and the estimate, dry-run counts, apply outcome and duration, and each verification query with its result.
