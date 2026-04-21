# Deploy Green Checklist

- [x] 1. Create audit/checklist files
- [x] 2. Verify env vars (`DATABASE_URL`, `DIRECT_URL`) — **blocked** (`DATABASE_URL=missing`, `DIRECT_URL=missing`)
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
