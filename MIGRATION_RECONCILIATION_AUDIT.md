# Migration Reconciliation Audit

## Execution status

Blocked at **Task 1 (Verify runtime access)** because required runtime environment variables are not available in this shell.

- `DATABASE_URL`: **missing**
- `DIRECT_URL`: **missing**

Per the mission safety requirements, work must stop when either is missing.

## 1) `pnpm prisma migrate status` (before reconciliation)

Not executed due to missing `DATABASE_URL` and `DIRECT_URL`.

## 2) Failed migration evidence (`20270420120000_sprint1_core_user_loop`)

Not collected from live DB due to missing `DATABASE_URL` and `DIRECT_URL`.

## 3) DB-only vs local renamed migration verification

Live verification against `_prisma_migrations` is blocked due to missing DB connection variables.

## 4) Reconciliation decision and minimal fix

No reconciliation change applied because migration history cannot be safely audited without live DB access.

## 5) Safe recovery order after reconciliation

1. Export valid `DATABASE_URL` and `DIRECT_URL` for the target environment.
2. Run `pnpm prisma migrate status` and capture exact output.
3. Query `_prisma_migrations` for required migration IDs and capture row state (`started_at`, `finished_at`, `rolled_back_at`, `logs`).
4. Verify whether DB-only IDs map exactly to local renamed folders by comparing SQL semantics.
5. Apply minimal reconciliation (likely restoring original folder IDs if proven equivalent).
6. Re-run `pnpm prisma migrate status` and confirm divergence is resolved.
7. Only then decide whether `pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop` is safe.
8. If safe, run resolve, then deploy, then final validation commands.
