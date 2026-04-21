# Migration Safe Fix Audit

## Scope
Migration under repair: `prisma/migrations/20270420120000_sprint1_core_user_loop/migration.sql`.

## 1) Full contents + intent of broken migration (pre-fix)
Pre-fix SQL intent was:
- Alter `UserNotificationPrefs` to add six notification/quiet-hours fields.
- Create `EventReminder` table.
- Add unique/indexes on `EventReminder`.
- Add FKs from `EventReminder.userId -> User(id)` and `EventReminder.eventId -> Event(id)`.

Pre-fix risk points observed:
- It started with `ALTER TABLE "UserNotificationPrefs" ...` before any local creation of that table.
- `EventReminder.id` was declared `UUID NOT NULL` with no DB default, despite Prisma model using `@default(uuid())`.

## 2) Whether any earlier migration creates `UserNotificationPrefs`
Checked all migration SQL files for `UserNotificationPrefs`; only this sprint migration referenced it.

Classification: **missing** (no prior table creation in migration chain).

## 3) Prisma schema definitions
- `UserNotificationPrefs` model exists in `prisma/schema.prisma` and includes:
  - `id String @id @default(cuid())`
  - `userId String @unique @db.Uuid` + relation to `User`
  - email/digest and reminder settings fields
  - `createdAt @default(now())`, `updatedAt @updatedAt`
- `EventReminder` model exists in `prisma/schema.prisma` and includes:
  - `id String @id @default(uuid()) @db.Uuid`
  - `userId`, `eventId`, `remindAt`, `preset`, timestamps
  - relations to `User` and `Event`
  - `@@unique([userId, eventId])`
  - indexes on `[remindAt, deliveredAt]` and `[userId, remindAt]`

## 4) Required behavioral checks
- Assumes `UserNotificationPrefs` already exists: **true**.
  - Classification: **broken**.
- Defines `EventReminder.id` without DB default: **true (pre-fix)**.
  - Classification: **broken**.
- FK/index/uniqueness assumptions on clean DB:
  - `EventReminder` indexes + FKs were mostly safe (`IF NOT EXISTS` / `DO...duplicate_object`) if table creation succeeds.
  - `UserNotificationPrefs` constraints were not created here pre-fix, because table itself was assumed.
  - Classification: **partial**.

## 5) Whether later migrations depend on Sprint 1 success
No direct textual references to `EventReminder`/`UserNotificationPrefs` were found in later migration SQLs, but Prisma migration chain is sequential; a failed Sprint 1 migration blocks all later migrations.

Classification: **implemented dependency in chain semantics; direct SQL dependency missing**.

## 6) Exact root cause of clean DB failure
On a clean DB, `pnpm prisma migrate deploy` fails when this migration executes initial `ALTER TABLE "UserNotificationPrefs" ...` because the table does not yet exist in prior migrations.
A secondary schema drift issue existed: `EventReminder.id` lacked database default generation while Prisma schema expects UUID default behavior.

Classification: **broken**.

## Applied minimal safe fix
Patched the same migration file (no rewrite of later migrations):
1. Added `CREATE TABLE IF NOT EXISTS "UserNotificationPrefs" (...)` with schema-aligned columns/PK/defaults.
2. Added `UserNotificationPrefs_userId_key` unique index and guarded FK creation.
3. Kept original `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` for idempotent compatibility.
4. Changed `EventReminder.id` creation to `DEFAULT gen_random_uuid()`.
5. Added `ALTER TABLE "EventReminder" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();` to reconcile partially-created table states safely.
6. Preserved original unique/index/FK definitions.

## Partial-application recovery behavior
- If prior attempts partially created `EventReminder` without default, `ALTER COLUMN ... SET DEFAULT gen_random_uuid()` repairs this.
- If prior attempts left `UserNotificationPrefs` absent, new `CREATE TABLE IF NOT EXISTS` repairs this.
- No `prisma migrate resolve` was used in this environment.
- If a persistent/shared DB had a recorded failed migration, `_prisma_migrations` must be inspected before any resolve action.

## Validation log summary (this environment)
Executed required commands. Prisma schema validation/generation passed. Commands requiring a running PostgreSQL instance (`migrate status`, `migrate deploy`) could not complete because `localhost:5432` was unavailable in this container.
