# REPO Neon Migration Recovery Audit

## Scope
Target migration: `20270420120000_sprint1_core_user_loop`.

## Mandatory-first-step status
- `REPO_NEON_MIGRATION_RECOVERY_AUDIT.md` created before code changes.
- `NEON_MIGRATION_RECOVERY_CHECKLIST.md` created before code changes.

## Step 1A — `_prisma_migrations` failed-record audit (requested)

### Command attempts
```bash
pnpm prisma migrate status
pnpm prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
select migration_name, started_at, finished_at, rolled_back_at, logs
from public._prisma_migrations
where migration_name = '20270420120000_sprint1_core_user_loop';
SQL
```

### Actual result in this execution environment
- Could not run DB-state inspection because no `DATABASE_URL`/`DIRECT_URL` are available in this container session.
- `pnpm prisma migrate status` fails before connection with Prisma config validation error (`P1012`, missing `DIRECT_URL`).

Classification: **missing** (runtime DB credentials unavailable; no guessing performed).

## Step 1B — Partial schema-state audit (`UserNotificationPrefs`, `EventReminder`)

### Requested checks
- table existence
- key columns/defaults
- key indexes/constraints

### Actual result in this execution environment
- Could not query live Neon schema without credentials.
- Reviewed patched migration SQL to verify idempotent DDL behavior if objects are partially present.

From `prisma/migrations/20270420120000_sprint1_core_user_loop/migration.sql`:
- `CREATE TABLE IF NOT EXISTS "UserNotificationPrefs"`.
- `CREATE TABLE IF NOT EXISTS "EventReminder"`.
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for notification preference fields.
- `ALTER TABLE "EventReminder" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`.
- `CREATE INDEX IF NOT EXISTS` for all new indexes.
- guarded FK creation via `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`.

Classification: **implemented** for migration idempotence safeguards in SQL; **missing** for live DB verification in this environment.

## Step 1C — Prisma status output capture

Command:
```bash
pnpm prisma migrate status
```

Observed output:
- Prisma schema validation error `P1012`:
  - `Environment variable not found: DIRECT_URL`

Classification: **broken** runtime execution context (required migration env vars absent).

## Step 1D — Current `prisma-safe-deploy.ts` behavior (pre-fix audit)

File reviewed: `scripts/prisma-safe-deploy.ts`.

### What it did before fix
- Parsed failed migrations only from exact header regex `Following migration have failed:`.
- Did not treat `P3009` text as a first-class failed-migration signal.
- `runDeployWithRetry` retried deploy attempts without inspecting failure output for deterministic failed-migration state.
- On deploy failure, thrown error omitted Prisma stdout/stderr, losing context needed to detect failed migration blockers.
- Could produce `pending=0 failed=0 ... Unknown prisma migrate status output` when Prisma message variants did not match strict regex.

Classification: **broken** (failed-state detection and retry policy).

## Safety decision for `resolve --rolled-back`

Requested command:
```bash
pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop
```

Safety preconditions required by task:
1. verify failed migration row exists
2. verify partial schema state
3. verify rerun safety post-resolve

Result:
- Preconditions 1 and 2 cannot be verified in this environment due to missing DB credentials.
- Therefore **command was not executed**.

Classification: **partial** (safe refusal; no unsafe state mutation).

## Recovery decision summary
- A real Neon recovery action cannot be executed safely from this environment without `DATABASE_URL` and `DIRECT_URL` for the CI branch DB.
- The scripted deploy behavior was hardened to fail fast on failed-migration states instead of retrying blindly.
- Explicit operator-facing error guidance now instructs DB audit/recovery before rerun.

## Step execution status
1. audit DB state — **blocked by missing env**
2. audit script behavior — **completed**
3. decide rolled-back safety — **completed (not safe to execute blindly)**
4. recover migration state — **blocked by missing env**
5. rerun deploy — **blocked by missing env**
6. patch `prisma-safe-deploy.ts` — **completed**
7. validate — **completed for local script/tooling; DB validation blocked**
8. report — **completed in this file and checklist**
