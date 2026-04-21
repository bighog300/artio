# Migration Reconciliation Checklist

- [x] 1. Create audit/checklist files.
- [x] 2. Verify `DATABASE_URL` and `DIRECT_URL`.
- [ ] 3. Inspect live migration history (`prisma migrate status` + `_prisma_migrations`).
- [ ] 4. Inspect local migration folders and compare potentially renamed IDs.
- [ ] 5. Choose and document reconciliation strategy.
- [ ] 6. Reconcile history with minimal safe change.
- [ ] 7. Re-run `pnpm prisma migrate status`.
- [ ] 8. Decide if Sprint 1 failed-row recovery is safe.
- [ ] 9. Recover failed row if safe.
- [ ] 10. Re-run deploy.
- [ ] 11. Validate (`status`, `safe-deploy`, `typecheck`, `lint`, `test`).
- [x] 12. Final report (blocked: missing env vars).

## Blocker

`DATABASE_URL` and `DIRECT_URL` are missing in the current execution environment, so live migration audit/reconciliation cannot be performed safely.
