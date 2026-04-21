# Deploy Green Audit

## 1) `pnpm prisma migrate status` (before reconciliation)

Blocked. Step 1 failed because runtime DB env vars are missing, so Prisma cannot connect.

Exact output: not run due to missing `DATABASE_URL` and `DIRECT_URL`.

## 2) `pnpm prisma:safe-deploy` (before reconciliation)

Blocked. Safety deploy check cannot run without runtime DB env vars.

Exact output: not run due to missing `DATABASE_URL` and `DIRECT_URL`.

## 3) `_prisma_migrations` rows for relevant IDs

Blocked. Could not query `_prisma_migrations` because DB connection env vars are missing.

Required IDs pending inspection:

- `20270420120000_sprint1_core_user_loop`
- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`
- `20270417120000_add_artwork_matched_artist`
- `20270417130000_add_directory_pipeline_mode`
- `20270423120000_sprint3_creator_platform`

## 4) Functional identity check (DB-only IDs vs renamed local IDs)

Not performed. This requires both:

1. live `_prisma_migrations` inspection
2. local SQL comparison

## 5) Chosen reconciliation strategy

No reconciliation applied. Safety stop at Step 1 (`DATABASE_URL`/`DIRECT_URL` missing).

## 6) Safe recovery order after reconciliation

Once both env vars are present, execute in this order:

1. `pnpm prisma migrate status`
2. inspect `_prisma_migrations` rows for all required IDs
3. compare old-vs-renamed local migration SQL
4. reconcile folder history (restore DB-applied IDs if equivalent)
5. re-run `pnpm prisma migrate status` and `pnpm prisma:safe-deploy`
6. only then evaluate failed Sprint 1 row and (if safe) run `pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop`
7. run `pnpm prisma migrate deploy`
8. run full validation suite

## Step 1 — Runtime access check

Command:

```bash
printf 'DATABASE_URL=%s\n' "${DATABASE_URL:+present}"; printf 'DIRECT_URL=%s\n' "${DIRECT_URL:+present}"
```

Exact output:

```bash
DATABASE_URL=
DIRECT_URL=
```

Result: **hard blocker**. Per safety rules, stop before Step 2.
