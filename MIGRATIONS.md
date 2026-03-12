# Prisma migrations baseline

In March 2026 the migration history was rebaselined because the original chain started with a placeholder `init` migration and later migrations referenced `"User"` before that table existed.

## Current strategy

- `prisma/migrations/20260305100000_baseline/migration.sql` is a full baseline generated from `prisma/schema.prisma`.
- This repository currently targets fresh database deployment (for Neon and CI) from that baseline.

## Commands

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

For migrations that add new foreign keys, run the guard check:

```bash
pnpm prisma:check-migration-order
```

This script ensures tables referenced by `REFERENCES "..."` have already been created earlier in migration order.

## Ingest artwork fingerprint formula changes

- The artwork dedup fingerprint now includes `eventId`, normalized `title`, normalized `artistName`, normalized `year`, normalized `dimensions`, and normalized `sourceUrl`.
- Existing `IngestExtractedArtwork` rows created before this change keep their old fingerprint values. On the next ingest run, those legacy rows may not dedupe against newly computed fingerprints and can be re-ingested as new candidates.
- If needed, clean up stale/duplicate artwork candidates operationally after deploy (for example by reviewing and removing obsolete pending duplicates in `IngestExtractedArtwork`).
