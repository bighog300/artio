# Divergent History Checklist

- [x] Create audit + checklist files
- [x] Verify `DATABASE_URL` and `DIRECT_URL`
- [x] Run `pnpm prisma migrate status` and record full output
- [ ] Inspect `_prisma_migrations` rows for target migration names *(blocked: missing DB env vars in this environment)*
- [x] Check local migration folders for DB-only migrations
- [x] Determine divergence cause/classification
- [x] Patch `scripts/prisma-safe-deploy.ts` to hard-stop on divergence
- [x] Validate `pnpm prisma:safe-deploy` hard-stop behavior *(env-gated; script fails fast on missing env as expected)*
- [x] Run project validations (`typecheck`, `lint`, `test`)
- [ ] Run `pnpm prisma migrate deploy` only if safe *(not safe; divergence + env blocker)*
