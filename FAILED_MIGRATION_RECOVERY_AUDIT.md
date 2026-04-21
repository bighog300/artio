# FAILED MIGRATION RECOVERY AUDIT

## Scope
Audit and recover Prisma failed migration blocker for:
- `20270420120000_sprint1_core_user_loop`

## Initial known symptoms (pre-investigation)
- `pnpm prisma migrate status` appears to report only pending migration(s)
- `pnpm prisma migrate deploy` fails with `P3009`
- Reported failed migration row: `20270420120000_sprint1_core_user_loop`

## Current `prisma-safe-deploy.ts` behavior (pre-fix)
- To be confirmed by code inspection and runtime validation.

## Status vs deploy mismatch (pre-fix)
- To be confirmed with exact command output capture.

## Recovery plan
1. Verify `DATABASE_URL` and `DIRECT_URL` are present.
2. Capture `pnpm prisma migrate status` output.
3. Inspect `_prisma_migrations` row for `20270420120000_sprint1_core_user_loop`.
4. Inspect partial schema objects (`UserNotificationPrefs`, `EventReminder`) and key details.
5. Decide if `--rolled-back` resolve is safe.
6. If safe, run:
   - `pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop`
   - `pnpm prisma migrate deploy`
   - `pnpm prisma migrate status`
7. Patch `scripts/prisma-safe-deploy.ts` to handle status-vs-deploy mismatch and P3009 messaging.
8. Run validation commands and document outputs.

## Live findings
_To be populated during execution._

## Execution log
- Checked required environment variables before any Prisma/DB operation.
- Result:
  - `DATABASE_URL`: **missing**
  - `DIRECT_URL`: **missing**

## Blocker
Per task safety preconditions, execution must stop when either required DB URL env var is absent. Because both are missing in this runtime, live DB inspection/recovery steps were not executed.

## Commands intentionally not run due to blocker
- `pnpm prisma migrate status`
- SQL inspection of `_prisma_migrations`
- SQL inspection of partial schema objects
- `pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop`
- `pnpm prisma migrate deploy`
- `pnpm prisma:safe-deploy`

## Required unblocking action
Provide runtime values for both `DATABASE_URL` and `DIRECT_URL`, then re-run this runbook from step 3 (inspect live DB state).
