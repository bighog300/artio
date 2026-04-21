# Deploy Green Audit — Migration History Reconciliation

## Divergent migration IDs (current mismatch)

Staging DB applied IDs:

- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`

Local repository IDs (pre-reconciliation):

- `20270417120000_add_artwork_matched_artist`
- `20270417130000_add_directory_pipeline_mode`

## Local renamed migration IDs (target canonical IDs)

- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`

## Reconciliation strategy

1. Confirm the local `2027041712/13...` migration folder contents are the intended migrations.
2. Rename those two local migration folders to the exact IDs already applied in staging.
3. Ensure there are no duplicate old-name folders remaining.
4. Validate local filesystem migration state and run `pnpm prisma migrate status`.
5. Record results and commit only this reconciliation scope.

## Why restoring DB-applied folder IDs is the safe fix

Prisma migration identity is the migration folder name (ID) plus migration record history. When the DB already contains the `20260411200000...` and `20260411210000...` IDs, the repo must use those same IDs to avoid divergent histories and blocked deploys. Renaming local folders to match already-applied DB IDs is the minimal, auditable, non-destructive fix that preserves migration SQL behavior while restoring identity alignment.
