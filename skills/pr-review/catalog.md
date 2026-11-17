# Review catalog

Each section has a **trigger** that can be read from the diff (paths, symbols, kinds of change). Before any reviewer
starts, match the triggers against the diff: a reviewer gets "Always", "Intent" and only the sections that fired, and
the report says which fired and why. When unsure whether a trigger matches, it fires. A section whose trigger never
fires in practice, or fires on every PR, gets a sharper trigger.

## Always
Trigger: every PR.
- Secrets, tokens, codes or email addresses in logs, errors or responses.
- Config defaults that are unsafe or broken in production; new env vars the chart (infra repo) must provide.
- A timeout on every network call; errors swallowed or turned into success.

## Intent
Trigger: every PR.
- The diff against the ticket, design doc or PR description: missing cases, unrequested behaviour changes.
- Edges: time zones and dates, money and rounding, empty lists, nulls, pagination ends, unicode, very large inputs.
- Tests that mirror the implementation (assert what the code does, not what was asked): green, and blind to the bug.

## Sessions and authentication
Trigger: login, logout, session, cookie, CSRF, MFA/TOTP/passkey, email codes or links, redirects after auth, security filters or `SecurityConfig`.
- Bypasses; session fixation; login CSRF; open redirects; CSRF gaps on some HTTP methods or paths.
- Origin/Host spoofing (X-Forwarded-* trust); account enumeration (any observable difference between users).
- MFA or step-up windows that can be reopened; replay (TOTP, email codes, links); cookie attributes (`__Host-`, SameSite).
- Fail-open on exceptions or nulls; TOCTOU between check and use.

## Authorization and tenancy
Trigger: permissions, roles, grants, admin endpoints, any query or repository method that filters (or should filter) by tenant, ids taken from the request.
- Escalation: granting what you do not hold, acting on someone with more permissions than you.
- Lockout guards (last admin) and their races; every query scoped to the caller's tenant; ids from another tenant.
- Platform-level permissions reaching public clients or public hosts.

## External surface (APIs for integrations, edge, internal ports)
Trigger: a new or changed public, integration, internal-port or webhook endpoint; API keys or client credentials; IP or header handling; rate limits; outbound HTTP calls.
- Credential checks: constant-time comparison, expired/revoked/regenerated credentials still accepted, cache races.
- IP checks: which header is trusted and when, IPv6 /64, IPv4-mapped addresses, CIDR math.
- Audience/product confusion; path normalization (`%`, `;`, `//`, dot segments, encoded slashes).
- Rate limiter keys and eviction; fail-closed vs 503; SSRF (redirects, response size, private addresses).

## Data and migrations
Trigger: a migration file, an entity or column change, a backfill or data script, a new query on a big table, a transaction boundary moved.
- Expand/contract: the previous release must run against the new schema (canaries); no rename/drop in the same release.
- Locks on big tables, backfills, irreversible operations, indexes for new queries.
- Projections or counters updated incrementally (`x = x + 1`) instead of recomputed from their source rows: they drift and cannot be rebuilt.
- Data scripts for a pipeline: no `ON_ERROR_STOP`, no `lock_timeout`/`statement_timeout`, unbatched writes, or scans of big tables without a plan check (`gutix:live-data-change`).
- Long transactions holding locks; events or messages sent before commit (lost on rollback).

## Concurrency and idempotency
Trigger: jobs, schedulers, queues, outbox, webhooks in or out, retries, a read-then-write on shared rows, anything that runs on more than one replica.
- Retried requests, duplicated webhooks, jobs running on two replicas at once, at-least-once delivery.
- Check-then-act races; unique constraints as the real guard.

## Failure handling
Trigger: a call to the database, the IdP or another service added or changed; catch blocks; fallbacks; timeouts.
- What happens when the database, the IdP or another service is down or slow: retries with backoff, circuit breaking,
  user-facing error. Security decisions fail closed.

## Contracts
Trigger: request/response shapes, error codes, event or webhook payloads, manifests or catalogs, anything a front or another repo reads.
- API changes that break a front or another product; the previous version accepted for one release.
- Stable error codes; event schemas; manifest/catalog changes.

## Performance (hot paths only)
Trigger: a query or loop in a request path, list endpoints, pagination, work inside a transaction.
- N+1 queries, unbounded queries, missing pagination, heavy work inside a transaction or a request.

## Tests and observability
Trigger: every PR that changes behaviour (not docs or config only).
- Tests that would catch a realistic bug and survive a refactor (`test-suite-prune`); e2e scenario for each new
  user-facing flow.
- Unexpected errors logged once with the stack, milestones with attributes, no mechanical logs (observability standard).

## Fronts
Trigger: files of a web UI (components, routes, styles, bundle config).
- XSS (`dangerouslySetInnerHTML`, URLs from data), CSP, tokens or PII in browser storage, open redirects, secrets in
  the bundle.
- Loading, error and empty states; basic accessibility (labels, focus, keyboard); untranslated strings; bundle size.
