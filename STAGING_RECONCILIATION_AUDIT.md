# Staging Reconciliation Audit

_Last updated: 2026-04-21 (UTC)_

## Scope
This audit records the migration-folder reconciliation issue, the unsafe strategy that was reverted, and the safer next path for staging reconciliation.

## 1) Exact `pnpm prisma:check-migration-order` failure (unsafe renamed state)
When the two migration folders were renamed to earlier timestamps (`20260411200000_*` and `20260411210000_*`), this exact failure occurred:

```text
Migration ordering check failed:

- 20260411200000_add_artwork_matched_artist/migration.sql:1 references table "IngestExtractedArtwork" before it is created in migration order
- 20260411200000_add_artwork_matched_artist/migration.sql:5 references table "IngestExtractedArtwork" before it is created in migration order
```

This is a hard-ordering violation.

## 2) Why the earlier-ID rename is unsafe
Renaming these migrations to earlier IDs changed lexicographic execution order in `prisma/migrations`, causing a migration that alters `IngestExtractedArtwork` to sort before the migration that creates that table.

That breaks repository migration dependency order and is unsafe for deploy history integrity.

## 3) Current relationship: DB-applied IDs vs local repo IDs
### Local repo (after this fix)
Canonical folder IDs are restored:
- `20270417120000_add_artwork_matched_artist`
- `20270417130000_add_directory_pipeline_mode`

### Staging DB history
From the incident context, staging contains earlier migration IDs for equivalent logical changes:
- `20260411200000_add_artwork_matched_artist`
- `20260411210000_add_directory_pipeline_mode`

### Mismatch summary
- Repo now uses canonical later IDs (safe order).
- Staging reportedly has older IDs for equivalent migrations.
- This mismatch must be reconciled **without** reordering repo migrations.

## 4) Chosen safer reconciliation path
Chosen strategy: **Option A — DB-side reconciliation using Prisma-compatible recovery steps, with controlled inspection first**.

### Explicitly rejected unsafe approach
Do **not** rename canonical repo migration folders back to earlier timestamps when that places migrations before their dependencies.

### Safer path details
1. Keep repo migration directories in canonical dependency-safe order (completed in this task).
2. Inspect staging `_prisma_migrations` state and determine whether the earlier IDs map 1:1 to current canonical migration SQL content.
3. Perform reconciliation in a controlled operator flow that does not alter repository ordering, e.g.:
   - use a temporary compatibility branch only for inspection/mapping evidence if needed, and/or
   - use Prisma-supported migration history reconciliation commands only after equivalence is proven and reviewed.
4. Only proceed to deploy/recovery after operator confirmation that migration history is coherent and safe.

This path is safer because it preserves repository correctness while handling environment-specific history mismatch at the database reconciliation layer.

## 5) Why failed Sprint 1 row recovery must wait
`20270420120000_sprint1_core_user_loop` failed-row recovery remains blocked until migration reconciliation is no longer unsafe and staging migration history is confirmed coherent.

Running rolled-back/applied recovery commands before that point risks compounding migration history divergence.
