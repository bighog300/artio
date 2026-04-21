# Deploy Green Checklist

- [x] 1. Update audit/checklist files
- [x] 2. Verify env vars (`DATABASE_URL`, `DIRECT_URL`) — **blocked** (both missing in current shell)
- [ ] 3. Inspect live migration history
- [ ] 4. Inspect local migration folders
- [ ] 5. Choose reconciliation strategy
- [ ] 6. Reconcile history
- [ ] 7. Re-run `pnpm prisma migrate status`
- [ ] 8. Decide whether Sprint 1 failed-row recovery is now safe
- [ ] 9. Recover failed row if safe
- [ ] 10. Re-run deploy
- [ ] 11. Validate
- [ ] 12. Report

## Blocking condition

Execution is intentionally stopped at Step 2 until both `DATABASE_URL` and `DIRECT_URL` are provided in the runtime environment.
