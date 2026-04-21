# MIGRATION_SYSTEM_AUDIT

## Scope and execution status

This audit was executed on **2026-04-21 (UTC)** in `/workspace/artio`.

A full repo-vs-DB reconciliation requires live database access, but both required runtime variables are missing in this environment:

- `DATABASE_URL`: missing
- `DIRECT_URL`: missing

Because of this, DB-side inspection commands (`prisma migrate status`, querying `_prisma_migrations`, `migrate deploy`, `migrate resolve`) cannot be completed against the target database from this run.

---

## 1) Current `pnpm prisma migrate status` output

Command:

```bash
pnpm prisma migrate status
```

Output captured:

```text
Prisma schema loaded from prisma/schema.prisma
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DIRECT_URL.
  -->  prisma/schema.prisma:9
   |
 8 |   url       = env("DATABASE_URL")
 9 |   directUrl = env("DIRECT_URL")
   |

Validation Error Count: 1
[Context: getConfig]

Prisma CLI Version : 6.19.2
```

Interpretation: blocked before status evaluation due to missing env config.

---

## 2) Current `pnpm prisma:safe-deploy` output

Command:

```bash
pnpm prisma:safe-deploy
```

Output captured:

```text
> artio-demo@0.1.0 prisma:safe-deploy /workspace/artio
> tsx scripts/prisma-safe-deploy.ts

[prisma-safe-deploy] [final] ❌ Safe deploy failed.
[prisma-safe-deploy] Missing required env var: DATABASE_URL
 ELIFECYCLE  Command failed with exit code 1.
```

Interpretation: safe-deploy correctly hard-stops on missing required env.

---

## 3) DB migrations missing locally

**Status:** blocked pending DB connectivity and status output parsing from a live database.

No authoritative DB-only migration list could be produced in this environment.

---

## 4) Local migrations pending in repo but not applied in DB

**Status:** blocked pending DB connectivity and live status output.

No authoritative pending-vs-applied DB diff can be produced without `_prisma_migrations` access.

---

## 5) Failed migration rows

**Status:** blocked pending DB connectivity and `_prisma_migrations` query.

No failed-row metadata (`migration_name`, `started_at`, `finished_at`, `rolled_back_at`, `logs`) can be collected without database access.

---

## 6) Known migration-ID rename mismatches found locally

### Mismatch A (repo filesystem corruption / identity drift)

Found tracked malformed path:

- `prisma/migrations/prisma/migrations/20270420120000_add_artist_collections_and_profile_fieldsmigration.sql`

This file represented a migration payload but was not in Prisma folder format (`<id>/migration.sql`), breaking ordering tooling and making identity ambiguous.

### Reconciled repo canonical form

Restored canonical Prisma folder migration:

- `prisma/migrations/20270420120000_add_artist_collections_and_profile_fields/migration.sql`

Removed malformed tracked path above.

### Other potential identity-risk markers (needs DB confirmation)

Multiple folders share identical timestamps (different suffix names), which can be valid but are high-risk for historical rename drift and should be checked against DB migration IDs:

- `20260310120000_*` (3 folders)
- `20260312120000_*` (2 folders)
- `20261203140000_*` (2 folders)

---

## 7) Mismatch classification

- **Mismatch A (`20270420120000_add_artist_collections_and_profile_fields`)**
  - Classification: **safe to reconcile in repo**
  - Canonical side: **repo canonical** (fixed in this patch)
- **Any DB-only IDs not present locally**
  - Classification: **must be reconciled in DB and/or repo after live inspection**
  - Canonical side: **blocked pending inspection**
- **Any failed rows in `_prisma_migrations`**
  - Classification: **must be reconciled in DB with explicit operator decision**
  - Canonical side: **blocked pending inspection**

---

## 8) Current `pnpm prisma:check-migration-order` result

Command:

```bash
pnpm prisma:check-migration-order
```

Output after repo-side reconciliation:

```text
> artio-demo@0.1.0 prisma:check-migration-order /workspace/artio
> node scripts/check-migration-order.mjs

Migration ordering check passed for 142 migration(s).
```

---

## 9) Safe recovery order (current best-known)

Because DB access is blocked in this environment, the safe order is conditional and must be executed by an operator with valid env vars:

1. Export valid `DATABASE_URL` and `DIRECT_URL` for the target environment.
2. Run `pnpm prisma migrate status` and capture full output.
3. Query `_prisma_migrations` for failed rows and DB-only migration IDs.
4. If status is divergent, stop and reconcile identity mismatch first (do not deploy).
5. If failed rows exist, resolve those explicitly (`migrate resolve`) based on audited row state.
6. Only then run `pnpm prisma migrate deploy`.

Specific proposed command from ticket:

```bash
pnpm prisma migrate resolve --rolled-back 20270420120000_sprint1_core_user_loop
pnpm prisma migrate deploy
```

This is **not safe to execute yet** from this run because failed-row state and divergence status could not be confirmed against live `_prisma_migrations`.

---

## Script hardening completed

`scripts/prisma-safe-deploy.ts` was patched to:

- parse singular/plural migration headers for pending/failed/DB-only sections,
- reliably emit parsed `lastCommonMigration`, `pendingMigrations`, `dbMigrationsMissingLocally`, `failedMigrations`,
- hard-stop on divergent history,
- hard-stop on failed migrations,
- hard-stop on unknown/unparseable status output,
- avoid broad noisy auto-resolve loops.

