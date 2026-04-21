# Repo Recovery Doc Audit

## Scope reviewed

- `MIGRATIONS.md`
- `README.md`
- `docs/DB_WORKFLOWS.md`
- `.github/workflows/ci.yml`
- `.github/workflows/migrate.yml`
- `.github/workflows/staging-db.yml`
- `.github/workflows/preview-db.yml`
- `.github/workflows/deploy.yml`
- `scripts/prisma-safe-deploy.ts`

## Current docs related to CI, migrations, or deploys

- `MIGRATIONS.md` documents baseline history and `pnpm prisma migrate deploy` / `pnpm prisma:check-migration-order` usage.
- `README.md` and `docs/DB_WORKFLOWS.md` document migration/deploy flow and environment topology.
- Workflow files show operational command paths for CI, preview, staging, and production deploy migrations.
- `scripts/prisma-safe-deploy.ts` embeds repo-specific auto-resolution logic for known failed migration IDs and retries/warmup behavior.

## Is migration recovery already documented?

- Partially.
- Existing docs explain _how migrations are run_ but do not provide a focused runbook for failure recovery (e.g., P3009 triage, `_prisma_migrations` inspection queries, or reset-vs-repair decisions by environment).

## Current known failure modes in this repo

- P3009 / failed migration state blocks subsequent deploys.
- Divergent migration history between code and database (`migrate status` divergence states).
- Missing `_prisma_migrations` relation in uninitialized DBs.
- Neon cold-start connectivity (`P1001`) during migration checks.
- Historical repo-specific migrations that may need `migrate resolve` handling (captured in `scripts/prisma-safe-deploy.ts` allowlists).
- Foreign-key ordering mistakes in migration SQL (guarded by `pnpm prisma:check-migration-order`).

## Repo-specific commands used for deploy/migrate

- `pnpm prisma:generate`
- `pnpm prisma:safe-deploy`
- `pnpm prisma migrate status`
- `pnpm prisma:check-migration-order`
- `pnpm prisma db execute --url "$DIRECT_URL" --stdin`
- `node scripts/neon/get-connection-urls.mjs --branch-name <name>`
- `node scripts/neon/create-branch.mjs --branch-name <name> --parent-branch <name>`
