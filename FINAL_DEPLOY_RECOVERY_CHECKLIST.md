# FINAL_DEPLOY_RECOVERY_CHECKLIST

- [x] Create `FINAL_DEPLOY_RECOVERY_AUDIT.md`
- [x] Create `FINAL_DEPLOY_RECOVERY_CHECKLIST.md`
- [x] Verify runtime secrets (`DATABASE_URL`, `DIRECT_URL`) → **blocked: both missing**
- [x] Inspect live Prisma migration state (`pnpm prisma migrate status`) → **blocked by P1012 missing DIRECT_URL**
- [x] Inspect `_prisma_migrations` row for `20270420120000_sprint1_core_user_loop` → **blocked by missing DB env**
- [x] Inspect partial schema (`UserNotificationPrefs`, `EventReminder`) → **blocked by missing DB env**
- [ ] Recover failed row if safe (`migrate resolve --rolled-back`)
- [x] Run `pnpm prisma migrate deploy` (fails with missing env)
- [x] Patch `scripts/prisma-safe-deploy.ts`
- [x] Verify Vercel env requirements and project config
- [x] Verify Vercel deployment logs/path and isolate blocker or success (CLI unavailable in container)
- [x] Run validation commands
- [x] Final report
