# FINAL_DEPLOY_RECOVERY_AUDIT

Date: 2026-04-21 (UTC)
Repo: `/workspace/artio`

## 1) Current Prisma migration state

### Runtime secret gate check (required before live recovery)
- `DATABASE_URL`: **MISSING** in current execution environment.
- `DIRECT_URL`: **MISSING** in current execution environment.

Result: live recovery flow is **blocked** before DB-touching actions.

### Prisma CLI status check output
Command attempted:
```bash
pnpm prisma migrate status
```
Observed output:
- Prisma fails at schema config validation with `P1012`.
- Explicit error: `Environment variable not found: DIRECT_URL`.
- No DB connection established; no live migration status could be retrieved.

## 2) Current Neon failed migration evidence

Expected target row to recover:
- `20270420120000_sprint1_core_user_loop`

Live evidence collection outcome:
- Could not query `_prisma_migrations` due missing `DATABASE_URL`/`DIRECT_URL`.
- Therefore these required live fields remain uncollected in this environment:
  - `migration_name`
  - `started_at`
  - `finished_at`
  - `rolled_back_at`
  - `logs`

Known prior historical error (from provided context):
- `ERROR: relation "UserNotificationPrefs" does not exist`

## 3) Current `scripts/prisma-safe-deploy.ts` behavior (before fix)

Observed/confirmed from source inspection before patch:
- Pending parser only matched a narrow header variant and could miss standard/singular forms.
- Script could emit:
  - `Unknown prisma migrate status output`
  - while still logging `pending=0 failed=0` in pending situations.
- Script executed unconditional pre-resolve passes across a broad static list (`ALWAYS_RESOLVE_AS_ROLLED_BACK`), causing noisy pre-resolve spam unrelated to current DB state.

## 4) Current Vercel deployment blockers

### Confirmed blocker in this environment
- Build/deploy migration actions cannot run without `DATABASE_URL` and `DIRECT_URL`.

### Repo-level likely deploy guardrails
- `scripts/check-env.mjs` enforces deploy-context required vars:
  - `AUTH_SECRET`
  - `DATABASE_URL`
  - `CRON_SECRET`
  - and `AI_INGEST_IMAGE_ENABLED` when `VERCEL=1`
- `DIRECT_URL` is logged as optional for deploy checks, but required by Prisma schema/provider config in this repo for migrate commands.

### Vercel logs / CLI verification status
- `vercel` CLI is not installed in the container (`vercel: command not found`), so direct deployment log pull/redeploy was not possible from this environment.

## 5) Required secrets/env vars for Neon + Vercel

### Migration/recovery critical (must be set)
- `DATABASE_URL` (Neon Postgres connection string)
- `DIRECT_URL` (direct/non-pooler Neon connection for Prisma migrate workflow)

### Vercel build-required (repo-enforced)
- `AUTH_SECRET`
- `DATABASE_URL`
- `CRON_SECRET`
- `AI_INGEST_IMAGE_ENABLED` (required in Vercel context)

### Conditional
- `GOOGLE_MAPS_API_KEY` when `GEOCODER_PROVIDER=google`

### Optional (deploy-check visibility only)
- `DIRECT_URL` is optional in `check-env`, but practically required by Prisma schema for migration operations.

## 6) Exact recovery plan (ready once env vars are supplied)

1. Export `DATABASE_URL` and `DIRECT_URL` in execution environment.
2. Run:
   ```bash
   pnpm prisma migrate status
   ```
3. Query `_prisma_migrations` for `20270420120000_sprint1_core_user_loop` and capture `started_at/finished_at/rolled_back_at/logs`.
4. Inspect partial schema for `UserNotificationPrefs` + `EventReminder`:
   - table existence
   - key columns
   - UUID default on `EventReminder.id`
   - relevant constraints
5. If safe, execute:
   ```bash
   pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop
   pnpm prisma migrate deploy
   pnpm prisma migrate status
   ```
6. If unsafe, stop and document exact manual reconciliation SQL required.
7. Trigger fresh Vercel redeploy after env confirmation/fixes.
