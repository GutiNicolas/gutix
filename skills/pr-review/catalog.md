# Review catalog

Give each reviewer the sections of its area. A single reviewer gets all of them. "Always" goes to everyone.

## Always
- Secrets, tokens, codes or email addresses in logs, errors or responses.
- Config defaults that are unsafe or broken in production; new env vars the chart (infra repo) must provide.
- A timeout on every network call; errors swallowed or turned into success.

## Intent
- The diff against the ticket, design doc or PR description: missing cases, unrequested behaviour changes.
- Edges: time zones and dates, money and rounding, empty lists, nulls, pagination ends, unicode, very large inputs.
- Tests that mirror the implementation (assert what the code does, not what was asked): green, and blind to the bug.

## Sessions and authentication
- Bypasses; session fixation; login CSRF; open redirects; CSRF gaps on some HTTP methods or paths.
- Origin/Host spoofing (X-Forwarded-* trust); account enumeration (any observable difference between users).
- MFA or step-up windows that can be reopened; replay (TOTP, email codes, links); cookie attributes (`__Host-`, SameSite).
- Fail-open on exceptions or nulls; TOCTOU between check and use.

## Authorization and tenancy
- Escalation: granting what you do not hold, acting on someone with more permissions than you.
- Lockout guards (last admin) and their races; every query scoped to the caller's tenant; ids from another tenant.
- Platform-level permissions reaching public clients or public hosts.

## External surface (APIs for integrations, edge, internal ports)
- Credential checks: constant-time comparison, expired/revoked/regenerated credentials still accepted, cache races.
- IP checks: which header is trusted and when, IPv6 /64, IPv4-mapped addresses, CIDR math.
- Audience/product confusion; path normalization (`%`, `;`, `//`, dot segments, encoded slashes).
- Rate limiter keys and eviction; fail-closed vs 503; SSRF (redirects, response size, private addresses).

## Data and migrations
- Expand/contract: the previous release must run against the new schema (canaries); no rename/drop in the same release.
- Locks on big tables, backfills, irreversible operations, indexes for new queries.
- Projections or counters updated incrementally (`x = x + 1`) instead of recomputed from their source rows: they drift and cannot be rebuilt.
- Data scripts for a pipeline: no `ON_ERROR_STOP`, no `lock_timeout`/`statement_timeout`, unbatched writes, or scans of big tables without a plan check (`gutix:live-data-change`).
- Long transactions holding locks; events or messages sent before commit (lost on rollback).

## Concurrency and idempotency
- Retried requests, duplicated webhooks, jobs running on two replicas at once, at-least-once delivery.
- Check-then-act races; unique constraints as the real guard.

## Failure handling
- What happens when the database, the IdP or another service is down or slow: retries with backoff, circuit breaking,
  user-facing error. Security decisions fail closed.

## Contracts
- API changes that break a front or another product; the previous version accepted for one release.
- Stable error codes; event schemas; manifest/catalog changes.

## Performance (hot paths only)
- N+1 queries, unbounded queries, missing pagination, heavy work inside a transaction or a request.

## Tests and observability
- Tests that would catch a realistic bug and survive a refactor (`test-suite-prune`); e2e scenario for each new
  user-facing flow.
- Unexpected errors logged once with the stack, milestones with attributes, no mechanical logs (observability standard).

## Fronts
- XSS (`dangerouslySetInnerHTML`, URLs from data), CSP, tokens or PII in browser storage, open redirects, secrets in
  the bundle.
- Loading, error and empty states; basic accessibility (labels, focus, keyboard); untranslated strings; bundle size.
