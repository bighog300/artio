# Runbook — Artpulse Launch Hardening

## Environment variables
### Production
- `AUTH_SECRET`
- `DATABASE_URL`
- `DIRECT_URL` (if used)
- `CRON_SECRET` (required for cron + `/api/cron/health`)
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (maps)
- Optional monitoring and alerting:
  - `SENTRY_DSN` (optional, provider integration)
  - `SENTRY_TRACES_SAMPLE_RATE` (optional)
  - `ALERT_WEBHOOK_URL` (recommended alert sink)
  - `ALERT_WEBHOOK_SECRET` (optional HMAC signing secret)
  - `OPS_SECRET` (required for `/api/ops/metrics` bearer auth)

### Local
- Minimal local build: `AUTH_SECRET=dev-secret pnpm build`
- Local checks can run without full production env.
- Build does not require external font downloads; system fonts are used by default.

## Vercel plan limits
- On Vercel Hobby, cron must be daily. This repo uses daily schedules in `vercel.json`.
- Log drains are Pro/Enterprise-only. This sprint does not rely on drains.

## Smoke test locally
```bash
pnpm install
pnpm test
AUTH_SECRET=dev-secret pnpm build
./scripts/smoke.sh
```

## Health checks
- App health: `GET /api/health`
- Cron health (protected):
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/health
  ```
- Ops metrics (protected):
  ```bash
  curl -H "Authorization: Bearer $OPS_SECRET" http://localhost:3000/api/ops/metrics
  ```

## Cron verification
Dry-run each cron route safely (all responses include `cronRunId`):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/outbox/send?dryRun=1"
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/digests/weekly?dryRun=1"
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/retention/engagement?dryRun=1"
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/ingest/venues?dryRun=1&limit=10&minHoursSinceLastRun=24"
```

## Cron ingest venues
- Route: `GET|POST /api/cron/ingest/venues`
- Purpose: scheduled AI extraction runs per venue website.
- Safety: route only creates `IngestRun` + extracted candidates. It never auto-approves candidates and never creates published events.
- Gate: `AI_INGEST_ENABLED` must be `1`; otherwise cron returns `ok=true` with `skipped=true` and `reason=ingest_disabled`.
- Locking: advisory lock key `cron:ingest:venues` prevents concurrent execution.
- Defaults: `limit=10` (max 25), `minHoursSinceLastRun=24`.
- Guardrails: per-cron volume and runtime caps (`AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES`, `AI_INGEST_CRON_TIME_BUDGET_MS`) and per-venue candidate cap (`AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN`).
- Circuit breaker: if recent failure rate in configured window exceeds threshold, run is skipped with `reason=circuit_breaker_open`.

Manual dry-run:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/ingest/venues?dryRun=1&limit=10&minHoursSinceLastRun=24"
```

Interpretation:
- `considered`: venues scanned as potential candidates.
- `selected`: venues eligible after cooldown filter.
- `wouldRun`: number of venues that would execute in dry-run.
- `runCount/succeeded/failed`: execution counts for non-dry-run.
- `createdCandidates/dedupedCandidates`: extracted candidate outcomes.

Common failures:
- `lock_not_acquired`: another invocation is active.
- `ingest_disabled`: `AI_INGEST_ENABLED` not set to `1`.
- Venue-level `errorCode` values (for example fetch/model errors) in `venues[]`.

## Alert triggers
- Cron failure alert: any cron exception, `ok=false`, or non-zero `errorCount`.
- Cron stall alert: watchdog checks in `/api/cron/health` if last success age exceeds threshold.
- Outbox backlog alert: watchdog warns when pending outbox count exceeds threshold.
- If no webhook sink is configured, alerts are emitted as structured logs.

## Monitoring behavior
- Default provider: structured console JSON logs.
- Optional provider: Sentry when `SENTRY_DSN` is set.
- Captured context is privacy-safe (requestId, cronRunId, route, boolean auth scope, counters); no user ids/emails, no raw query text, no lat/lng.

## Maps + geolocation
- Visit `/nearby`.
- Confirm geolocation permission is available for same-origin.
- Confirm map tiles/workers load (no CSP block for `blob:` worker).

## Personalization measurement (non-prod)
- Verify `personalization_exposure` and `personalization_outcome` emit version and ranking version.
- Verify exposure dedupe + per-view cap behavior.
- Verify deterministic sampling is full-rate in dev and reduced in production.

## Private beta operations

- Enable with `BETA_MODE=1`.
- Configure access via `BETA_ALLOWLIST`, `BETA_ALLOW_DOMAINS`, and `BETA_ADMIN_EMAILS`.
- Leave `BETA_REQUESTS_ENABLED=1` to collect access requests.
- Review pending requests and feedback in `/admin/beta`.
- Approving a request updates internal status only; you must add the email to `BETA_ALLOWLIST` and redeploy.

## Neon preview branch lifecycle

- Preview Neon branches use a deterministic per-PR name (`pr-<number>`), so reruns reuse the same branch instead of creating duplicates.
- When a pull request is closed, GitHub Actions automatically runs cleanup to delete that preview branch.


## Guardrails & Circuit Breaker
- Per-venue candidate cap: `AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN` (default `25`) truncates persistence and marks run `stopReason=CANDIDATE_CAP_REACHED`.
- Cron venue cap: `AI_INGEST_CRON_MAX_VENUES` bounds venue selection regardless of query `limit` (absolute max `25`).
- Cron created-candidate cap: `AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES` stops early with `stopReason=CRON_TOTAL_CAP_REACHED`.
- Cron time budget: `AI_INGEST_CRON_TIME_BUDGET_MS` stops early with `stopReason=TIME_BUDGET_EXCEEDED`.
- Circuit breaker:
  - Window: `AI_INGEST_CRON_CIRCUIT_BREAKER_WINDOW_HOURS`
  - Minimum runs: `AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS`
  - Failure threshold: `AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE`
  - Opens when failure rate exceeds threshold and minimum run count is met.
- Alerts are intentionally suppressed for `dryRun`, `ingest_disabled`, and `lock_not_acquired`.

Safe overrides:
- Increase one cap at a time and monitor `/admin/ingest/health` for failure/error spikes.
- Prefer raising `AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES` before increasing `AI_INGEST_CRON_MAX_VENUES`.
- Keep circuit breaker enabled in production; only relax thresholds temporarily with an incident note.
