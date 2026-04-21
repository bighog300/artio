# Recovery Doc Checklist

- [x] Audited current migration/CI/deploy docs and workflows.
- [x] Confirmed whether migration recovery runbook already exists.
- [x] Listed known migration/deploy failure modes from this repo.
- [x] Captured repo-specific recovery commands (not generic placeholders).
- [x] Added `docs/engineering/migration-recovery.md` with P3009 diagnosis path.
- [x] Documented `_prisma_migrations` inspection process.
- [x] Documented reset vs repair decision guidance by environment type.
- [x] Documented when `prisma migrate resolve` is appropriate in Artio.
- [x] Documented post-recovery verification checks and merge/deploy gates.
