# Environment Configuration — Artpulse

This document defines all environment variables required to run Artpulse locally and on Vercel.

---

## 1. Local Development

Create a file named `.env.local` at the repo root.

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Database (Postgres)
DATABASE_URL=postgresql://artpulse:artpulse@localhost:5432/artpulse

# Authentication (Auth.js / NextAuth)
AUTH_SECRET=replace-with-long-random-string
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Admin access control (required for /admin + /api/admin/*)
ADMIN_EMAILS=admin@example.com
# Optional domain allowlist
ADMIN_EMAIL_DOMAINS=example.org
# Optional admin image accessibility policy
ADMIN_IMAGE_ALT_REQUIRED=false

# Server-side venue geocoding (optional; defaults to mapbox provider)
GEOCODER_PROVIDER=mapbox
GOOGLE_MAPS_API_KEY=

# Maps (optional, enables Nearby map view)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=

# Blob storage (required for venue gallery + uploads)
BLOB_READ_WRITE_TOKEN=

# Email (Resend)
# Deprecated (moved to /admin/settings):
# RESEND_API_KEY=
# RESEND_FROM_ADDRESS=Artpulse <noreply@mail.artpulse.co>
RESEND_WEBHOOK_SECRET=
UNSUBSCRIBE_TOKEN_SECRET=replace-with-long-random-string

# Optional / Observability
SENTRY_DSN=
```

---

## 2. Production (Vercel)

Set the same variables in:
Vercel → Project → Settings → Environment Variables

Minimum required:
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `RESEND_WEBHOOK_SECRET`
- `UNSUBSCRIBE_TOKEN_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ADMIN_EMAILS` (required for admin panel access control, comma-separated email allowlist)
- `ADMIN_EMAIL_DOMAINS` (optional, comma-separated admin email domains)
- `ADMIN_IMAGE_ALT_REQUIRED` (optional; defaults to `false`, when `true` admin image alt text is required before setting an image as featured/primary)


Deprecated (configured in Admin → /admin/settings instead of environment):
- `RESEND_API_KEY`
- `RESEND_FROM_ADDRESS`

Optional:
- `AI_INGEST_ENABLED` (set to `1` to enable server-side AI ingest extraction; defaults to disabled)
- `OPENAI_API_KEY` (required only when `AI_INGEST_ENABLED=1`)
- `AI_VENUE_ENRICHMENT_ENABLED` (set to `1` to enable Phase 1 venue enrichment ingest path)
- `AI_ARTIST_INGEST_ENABLED` (set to `1` to enable Phase 3 artist ingest pipeline)
- `AI_ARTWORK_INGEST_ENABLED` (set to `1` to enable Phase 4 artwork ingest pipeline)
- `GEMINI_API_KEY` (required for Gemini provider in Phase 2/3)
- `ANTHROPIC_API_KEY` (required for Claude provider in Phase 2/4)
- `GOOGLE_PSE_API_KEY` (required for Google Programmable Search usage in Phase 3/5)
- `GOOGLE_PSE_CX` (required Google Programmable Search Engine ID for Phase 5 discovery)
- `BRAVE_SEARCH_API_KEY` (optional fallback provider for Phase 5 discovery)
- `AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN` (default `25`, per-run cap after normalization)
- `AI_INGEST_DUPLICATE_SIMILARITY_THRESHOLD` (default `85`, score threshold for near-duplicate suppression)
- `AI_INGEST_DUPLICATE_LOOKBACK_DAYS` (default `30`, historical window for cross-run duplicate matching)
- `AI_INGEST_CONFIDENCE_HIGH_MIN` (default `75`, lower bound for HIGH confidence band)
- `AI_INGEST_CONFIDENCE_MEDIUM_MIN` (default `45`, lower bound for MEDIUM confidence band)
- `AI_INGEST_CRON_MAX_VENUES` (default `10`, hard cap enforced at max `25`)
- `AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES` (default `100`, total candidates cap per cron invocation)
- `AI_INGEST_CRON_TIME_BUDGET_MS` (default `120000`, soft runtime budget for cron)
- `AI_INGEST_CRON_CIRCUIT_BREAKER_WINDOW_HOURS` (default `6`)
- `AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS` (default `5`)
- `AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE` (default `0.6`)
- `GEOCODER_PROVIDER` (`mapbox` default; set to `google` to use Google Geocoding API server-side)
- `GOOGLE_MAPS_API_KEY` (required only when `GEOCODER_PROVIDER=google`; server-side only)
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (enables `/nearby` map view)
- `BLOB_READ_WRITE_TOKEN` (required for Blob image uploads)
- `RATE_LIMIT_VENUE_IMAGES_WRITE_PER_MINUTE` (defaults to `60`)
- `RATE_LIMIT_VENUE_IMAGES_WRITE_WINDOW_MS` (defaults to `60000`)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (required in production-like runtimes; app rate limiting now fails fast without these)

---


## Build-time deploy checks (Preview + Production)

- Vercel Preview and Production both run the same commands from `vercel.json`:
  - `pnpm run vercel:install`
  - `pnpm run vercel:build`
- `vercel:build` runs `scripts/check-env.mjs --mode=vercel-build` before `next build`.
- The check prints only variable names with set status (`true` / `false`), never secret values.
- Required at build/deploy time: `AUTH_SECRET`, `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `CRON_SECRET` (when cron jobs are configured in `vercel.json`).
- Also required at build/deploy time when `GEOCODER_PROVIDER=google`: `GOOGLE_MAPS_API_KEY`.
- Optional at build/deploy time: `DIRECT_URL` (reported for parity visibility, not required).

## 3. OAuth Configuration Notes

Google redirect URI:
- `https://<your-domain>/api/auth/callback/google`

Ensure `NEXT_PUBLIC_APP_URL` matches your deployed domain.

---

## 4. Prisma & Migrations

Recommended scripts:

```json
{
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  }
}
```

---

## 5. Security Rules

- Never commit `.env.local`
- Never expose secrets via `NEXT_PUBLIC_*`


## 6. Blob Notes

- Venue gallery uploads and admin event image uploads use Vercel Blob server-validated client uploads.
- Keep `BLOB_READ_WRITE_TOKEN` server-side only; never expose it in `NEXT_PUBLIC_*` variables.
- Local development supports uploads when `BLOB_READ_WRITE_TOKEN` is set.

## Artist/Venue gallery client uploads (Vercel Blob)

- Keep `BLOB_READ_WRITE_TOKEN` configured **server-side only**.
- Client uploads use token exchange route handlers (`handleUpload`), then browser uploads directly to Blob.
- Do not expose `BLOB_READ_WRITE_TOKEN` in browser bundles.

## NextAuth production start requirement

- `AUTH_SECRET` must be set for `pnpm start` in production mode.


## 7. Admin Jobs Panel

- Admin operators can trigger server-side jobs from `/admin/ops/jobs`.
- Initial supported job names are:
  - `health.ping`
  - `db.vacuum-lite`
- Job runs are persisted in the `JobRun` table and all admin reads/triggers are recorded in `AdminAuditLog`.
- No additional environment variables are required; existing `CRON_SECRET` automation remains server-side only and is never exposed to the browser.


## 8. AI ingest extraction

- `AI_INGEST_ENABLED=0` keeps ingestion extraction disabled by default.
- Set `AI_INGEST_ENABLED=1` and `OPENAI_API_KEY` to allow ingest extraction jobs to call OpenAI.
- Candidate persistence is capped per venue run by `AI_INGEST_MAX_CANDIDATES_PER_VENUE_RUN`.
- Cron volume/runtime guardrails are controlled via:
  - `AI_INGEST_CRON_MAX_VENUES`
  - `AI_INGEST_CRON_MAX_TOTAL_CREATED_CANDIDATES`
  - `AI_INGEST_CRON_TIME_BUDGET_MS`
- Circuit breaker controls:
  - `AI_INGEST_CRON_CIRCUIT_BREAKER_WINDOW_HOURS`
  - `AI_INGEST_CRON_CIRCUIT_BREAKER_MIN_RUNS`
  - `AI_INGEST_CRON_CIRCUIT_BREAKER_FAIL_RATE`

## Venue timezone backfill

Populate missing `Venue.timezone` values from existing coordinates:

```bash
pnpm backfill:venue-timezones
```

Optional batch size override:

```bash
BATCH_SIZE=1000 pnpm backfill:venue-timezones
```

