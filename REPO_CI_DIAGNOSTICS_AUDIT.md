# Repo CI Diagnostics Audit

## Workflow audited

- `.github/workflows/ci.yml`
- `scripts/prisma-safe-deploy.ts`

## Current migration-related output in CI

- CI runs `pnpm prisma:safe-deploy` and then `pnpm prisma migrate status`.
- `prisma-safe-deploy` prints command-level step labels and forwards Prisma stdout/stderr.
- On failure, job exits from the migration step; no dedicated post-failure DB-state diagnostics step runs.

## Is failing migration name visible today?

- Usually yes when Prisma emits `Following migration have failed:`.
- But it is not highlighted/summarized by a dedicated CI diagnostic step, so engineers must scan raw logs.

## Is Prisma output preserved clearly?

- Mostly yes, because `prisma-safe-deploy.ts` forwards stdout/stderr.
- Gaps: no explicit failure summary block; no guaranteed `_prisma_migrations` snapshot on failure.

## Are additional DB-state diagnostics practical in CI?

- Yes for this repo's CI postgres service:
  - safe to run `prisma migrate status` and `prisma db execute` queries,
  - safe to print relation existence and migration rows (no secrets required),
  - should avoid printing DB URLs or sensitive env values.
