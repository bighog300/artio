# Migration Safe Fix Checklist

- [x] Created audit/checklist files before code changes
- [x] Inspected `20270420120000_sprint1_core_user_loop` SQL and schema alignment
- [x] Confirmed no earlier migration creates `UserNotificationPrefs`
- [x] Confirmed pre-fix `EventReminder.id` lacked DB default
- [x] Applied minimal SQL patch in-place (no unrelated migrations rewritten)
- [x] Preserved/added required PK/unique/FK/index constraints safely
- [x] Documented partial-application recovery behavior
- [x] Ran `pnpm prisma validate`
- [x] Ran `pnpm prisma generate`
- [x] Ran `pnpm prisma migrate status` (failed due no local PostgreSQL reachable)
- [x] Ran `pnpm prisma migrate deploy` (failed due no local PostgreSQL reachable)
- [x] Ran `pnpm typecheck`
- [x] Ran `pnpm lint`
- [x] Documented CI workflow that runs migrations on a fresh PostgreSQL service
- [ ] Verified post-fix CI run status from remote checks (not available in local container)
