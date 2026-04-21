# Neon Migration Recovery Checklist

## Execution order (as requested)

1. [x] Audit DB state (attempted; blocked by missing `DATABASE_URL`/`DIRECT_URL` in this container).
2. [x] Audit current script behavior.
3. [x] Decide whether `--rolled-back` resolve is safe.
4. [ ] Recover migration state in Neon DB (`resolve --rolled-back`) — blocked pending verified DB access.
5. [ ] Rerun `pnpm prisma migrate deploy` against Neon DB — blocked pending verified DB access.
6. [x] Patch `scripts/prisma-safe-deploy.ts`.
7. [x] Run requested validation commands.
8. [x] Produce final report artifacts.

## Required DB checks before running resolve

- [ ] Confirm failed row in `_prisma_migrations` for `20270420120000_sprint1_core_user_loop`.
- [ ] Capture `migration_name`, `started_at`, `finished_at`, `rolled_back_at`, `logs`.
- [ ] Confirm partial objects state for:
  - [ ] `UserNotificationPrefs`
  - [ ] `EventReminder`
- [ ] Confirm patched SQL idempotence is sufficient for rerun on observed state.
- [ ] Run `pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop`.
- [ ] Run `pnpm prisma migrate deploy`.
- [ ] Re-run `pnpm prisma migrate status` and capture clean state.

## Local validation run status

- [x] `pnpm prisma migrate status` (failed due missing `DIRECT_URL`).
- [x] `pnpm prisma migrate deploy` (failed due missing `DIRECT_URL`).
- [x] `pnpm prisma:safe-deploy` (failed fast due missing `DATABASE_URL`).
- [x] `pnpm typecheck` (passed).
- [x] `pnpm lint` (passed with existing repository warnings).
