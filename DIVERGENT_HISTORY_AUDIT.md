# Divergent Migration History Audit

Date: 2026-04-21 (UTC)
Repo: `/workspace/artio`

## 1) `pnpm prisma migrate status` output (current environment)

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

## 2) `pnpm prisma migrate deploy` output (current environment)

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

## 3) Current `scripts/prisma-safe-deploy.ts` behavior

### Before patch
- Script parsed `divergentHistory=true` but still flowed into branch that ran:
  - `migrate deploy`
  - and (in failed state paths) auto-resolve behavior
- This was unsafe for divergent histories.

### After patch
- Divergent history is now a **hard stop** before any deploy/resolve actions.
- Script logs:
  - `lastCommonMigration`
  - `pendingMigrations`
  - `dbMigrationsMissingLocally`
- Then it exits with a reconciliation-required error and explicitly states no automatic failed-row recovery will run during divergence.

## 4) Migrations present in DB but missing locally

From the incident background (not re-queryable in this environment due missing DB env vars), DB-only names reported:

- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`

Local folder check in this repo confirms both are missing as folders under `prisma/migrations/`.

## 5) Missing-local migration classification

Using git history inspection:

- Commit `86493d9f` renamed migration folders 1:1 (R100):
  - `20260411200000_add_artwork_matched_artist` -> `20270417120000_add_artwork_matched_artist`
  - `20260411210000_add_directory_pipeline_mode` -> `20270417130000_add_directory_pipeline_mode`

Classification:
- **Renamed / retimestamped** to fix ordering (not deleted-without-replacement).
- Divergence likely caused by DB having pre-rename migration names while repo has post-rename names.

## 6) `_prisma_migrations` inspection for target rows

Target rows requested:
- `20270420120000_sprint1_core_user_loop`
- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`
- `20270423120000_sprint3_creator_platform`

Status:
- **Blocked in this environment**: `DATABASE_URL` and `DIRECT_URL` are not set, so direct DB inspection cannot run here.
- Required fields (`migration_name`, `started_at`, `finished_at`, `rolled_back_at`, `logs`) are therefore not captured in this run.

## 7) Safe interpretation and recovery order

- DB and repo migration histories are **not reconciled**.
- The two DB-only names are explained as historical renamed IDs, but reconciliation must still be explicit (name mapping acknowledged in runbook/ops decision).
- DB should be treated as **different history lineage** relative to current local folder names until reconciled.
- Sprint 1 failed-row recovery (`20270420120000_sprint1_core_user_loop`) is **not safe to auto-run first** while divergence is unresolved.

### Chosen order: Option A
1. Reconcile/explicitly document divergent history first (including old->new migration ID mapping acceptance).
2. Then recover failed Sprint 1 row (`P3009`) with explicit manual action.
3. Then run deploy.

Rationale:
- Failed-row resolution against unresolved divergent lineage risks cementing incorrect migration state assumptions.
- Hard-stop behavior now enforces this ordering.

## 8) Next single blocker

- Immediate blocker: missing runtime env vars (`DATABASE_URL`, `DIRECT_URL`) prevent live DB status/migration-table audit in this environment.
