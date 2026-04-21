# Deploy Green Audit

## 1) `pnpm prisma migrate status` (before reconciliation)

Blocked: runtime database environment variables are not available in this session, so Prisma cannot connect safely.

## 2) `pnpm prisma:safe-deploy` (before reconciliation)

Blocked: runtime database environment variables are not available in this session, so deploy safety checks cannot run.

## 3) `_prisma_migrations` rows for relevant IDs

Blocked: could not query `_prisma_migrations` because both required runtime env vars are missing.

Required IDs (not yet inspectable):

- `20270420120000_sprint1_core_user_loop`
- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`
- `20270417120000_add_artwork_matched_artist`
- `20270417130000_add_directory_pipeline_mode`
- `20270423120000_sprint3_creator_platform`

## 4) Functional identity check (DB-only IDs vs renamed local IDs)

Not performed yet. Requires both live DB inspection and local migration SQL comparison.

## 5) Chosen reconciliation strategy

No reconciliation action taken yet due to missing database connection configuration.

## 6) Safe recovery order after reconciliation

Planned order once `DATABASE_URL` and `DIRECT_URL` are present:

1. Run `pnpm prisma migrate status` and capture full output.
2. Query `_prisma_migrations` rows for the six required IDs.
3. Compare local migration folder SQL for old vs renamed IDs.
4. If equivalent, restore original DB-applied folder IDs in `prisma/migrations` (preferred Prisma-safe path).
5. Re-run `pnpm prisma migrate status` and `pnpm prisma:safe-deploy` to confirm divergence is gone.
6. Only then evaluate failed row `20270420120000_sprint1_core_user_loop` and (if safe) run `pnpm prisma migrate resolve --rolled-back ...`.
7. Run `pnpm prisma migrate deploy`, then validation commands.

## Step 1 — Runtime access check

Command output:

```bash
DATABASE_URL=missing
DIRECT_URL=missing
```

Result: **hard blocker**. Per safety requirements, execution stops here until both variables are configured.
