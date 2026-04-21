# Migration recovery (Artio)

This runbook is for migration failures in Artio CI, staging, preview Neon branches, and production deploy workflows that run `pnpm prisma:safe-deploy`.

## 1) Diagnose Prisma P3009 quickly

`P3009` means a migration is recorded as failed and blocks new migrations.

1. Re-run status against the **direct** DB URL:
   ```bash
   DATABASE_URL="$DIRECT_URL" pnpm prisma migrate status
   ```
2. Confirm the failing migration name from output (`Following migration have failed:`).
3. In CI logs, inspect the `prisma-safe-deploy` step output first; it prints the Prisma command and raw Prisma output.

## 2) Inspect `_prisma_migrations`

Use the direct connection (`DIRECT_URL`) and inspect migration records:

```bash
pnpm prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
select migration_name, started_at, finished_at, rolled_back_at, logs
from public._prisma_migrations
order by started_at desc nulls last, migration_name desc;
SQL
```

For a single migration:

```bash
pnpm prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
select migration_name, started_at, finished_at, rolled_back_at, logs
from public._prisma_migrations
where migration_name = '<failing_migration_name>';
SQL
```

Also confirm the table exists:

```bash
pnpm prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
select to_regclass('public._prisma_migrations') as prisma_migrations_table;
SQL
```

## 3) Reset vs repair decision

### Reset (ephemeral/local DB only)

Use reset for:

- local development DBs,
- CI service DBs,
- preview Neon branches where test data can be discarded.

Typical reset path:

```bash
pnpm prisma migrate reset --force
pnpm prisma:safe-deploy
pnpm prisma migrate status
```

### Repair (persistent/shared DB)

Use repair for:

- production,
- staging with preserved data,
- any shared DB where destructive reset is unacceptable.

Repair sequence:

1. Identify exact failing migration row in `_prisma_migrations`.
2. Determine whether SQL partially applied (check `logs` and existence of expected tables/columns/indexes).
3. Choose resolution action (`--rolled-back` vs `--applied`) only when actual DB state justifies it.
4. Run `pnpm prisma:safe-deploy` and verify status is clean.

## 4) When `prisma migrate resolve` is appropriate

Use `prisma migrate resolve` only when a migration state in `_prisma_migrations` is wrong for the _actual_ schema state.

Appropriate:

- migration failed and did **not** apply changes → `--rolled-back`.
- migration changes were applied manually/already present, but migration is marked failed → `--applied`.
- known historical Artio migration IDs already auto-handled by `scripts/prisma-safe-deploy.ts` allowlists.

Not appropriate:

- as a first step without inspecting `_prisma_migrations` and DB objects.
- for unknown failures where root cause is still active.

Examples:

```bash
DATABASE_URL="$DIRECT_URL" pnpm prisma migrate resolve --rolled-back <migration_name>
DATABASE_URL="$DIRECT_URL" pnpm prisma migrate resolve --applied <migration_name>
```

## 5) Verify migration health after recovery

Run:

```bash
pnpm prisma:safe-deploy
DATABASE_URL="$DIRECT_URL" pnpm prisma migrate status
pnpm prisma:check-migration-order
```

DB sanity checks:

```bash
pnpm prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
select to_regclass('public._prisma_migrations') as prisma_migrations_table;
select migration_name, finished_at, rolled_back_at
from public._prisma_migrations
order by started_at desc nulls last
limit 20;
SQL
```

Expected outcome:

- no failed migrations in status,
- no unexpected pending migrations,
- `_prisma_migrations` rows reflect resolved state,
- migration ordering check passes.

## 6) Checks required before merge/deploy

For schema or migration changes, do not merge/deploy until all pass:

1. `pnpm prisma:generate`
2. `pnpm prisma:check-migration-order`
3. `pnpm prisma:safe-deploy` on CI DB / target branch DB
4. `pnpm prisma migrate status` after deploy
5. CI workflow success (`.github/workflows/ci.yml`)
6. For `main`, Neon migration workflow success (`.github/workflows/migrate.yml`) and deploy workflow migration step success (`.github/workflows/deploy.yml`)
