# FAILED MIGRATION RECOVERY CHECKLIST

- [x] 1. Create audit/checklist files
- [x] 2. Verify env vars (`DATABASE_URL`, `DIRECT_URL`)
  - Result: BLOCKED (`DATABASE_URL` missing, `DIRECT_URL` missing)
- [ ] 3. Inspect live DB state
  - [ ] 3A. `pnpm prisma migrate status`
  - [ ] 3B. Query `_prisma_migrations` failed row
  - [ ] 3C. Inspect partial schema state
- [ ] 4. Decide whether rolled-back resolve is safe
- [ ] 5. Recover failed row if safe
- [ ] 6. Re-run deploy
- [ ] 7. Patch `scripts/prisma-safe-deploy.ts`
- [ ] 8. Validate (`status`, `deploy`, `safe-deploy`, `typecheck`, `lint`, `test`)
- [ ] 9. Final report
