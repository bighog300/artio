# CI Diagnostics Checklist

- [x] Audited current migration output in `.github/workflows/ci.yml`.
- [x] Verified whether failing migration names are visible.
- [x] Verified Prisma output preservation path.
- [x] Confirmed DB-state diagnostics are practical in CI context.
- [x] Added migration deploy step that captures logs for post-failure parsing.
- [x] Added failure-only diagnostics step with migration status and `_prisma_migrations` query output.
- [x] Added clear failure summary including failing command and migration name when detectable.
- [x] Kept diagnostics secret-safe (no DB URL or secrets printed).
