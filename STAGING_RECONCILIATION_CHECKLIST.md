# Staging Reconciliation Checklist

_Last updated: 2026-04-21 (UTC)_

- [x] Create/update reconciliation audit and checklist documents.
- [x] Verify current migration folder state (unsafe IDs vs canonical repo IDs).
- [x] Revert unsafe rename to canonical repo IDs only.
- [x] Run `pnpm prisma:check-migration-order` and confirm pass.
- [x] Record final migration filesystem state for affected folders.
- [x] Document and justify safer staging reconciliation path.
- [x] Run repository validations (`typecheck`, `lint`, `test`).
- [x] Check whether DB env vars are present before running `prisma migrate status` / `prisma:safe-deploy`.
- [x] Skip DB-dependent Prisma commands in this runtime because required DB env vars are not present.
- [ ] Commit changes.
- [ ] Push branch if remote push is available.
