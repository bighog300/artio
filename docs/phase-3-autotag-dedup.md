# Phase 3 — Auto-tagging & Deduplication
**4 tasks · ~4 hours · 1 commit each**

Completes the enrichment upgrade with two new capabilities:
1. Auto-tagging: classifies artworks against existing Tag records
   using the AI provider, controlled by the `autoTagEnabled`
   toggle already in SiteSettings
2. Deduplication: surface likely-duplicate artworks to admins
   for confirmed merge — no automated destructive changes

No new npm dependencies. Tags reuse the existing `Tag` model
and categories (medium, genre, movement, mood). Dedup is
admin-confirmed only.

---

## Task 1 — Schema: ArtworkTag join table
**File:** `prisma/schema.prisma`
**File to create:** migration SQL
**Effort:** ~20 min

### What to read first
```
sed -n '/^model Tag /,/^}/p' prisma/schema.prisma
sed -n '/^model EventTag /,/^}/p' prisma/schema.prisma
sed -n '/^model Artwork /,/^}/p' prisma/schema.prisma
ls prisma/migrations/ | sort | tail -3
```

### Changes to schema.prisma

Add the `ArtworkTag` join table immediately after the
`EventTag` model — mirror its structure exactly:

```prisma
model ArtworkTag {
  artworkId String @db.Uuid
  tagId     String @db.Uuid
  artwork   Artwork @relation(fields: [artworkId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([artworkId, tagId])
  @@index([tagId])
  @@index([artworkId])
  @@index([tagId, artworkId])
}
```

Add the back-relations:

On the `Artwork` model, add after the `ingestCandidate` line:
```prisma
tags            ArtworkTag[]
```

On the `Tag` model, add after the `eventTags` line:
```prisma
artworkTags ArtworkTag[]
```

### Migration SQL

Create:
`prisma/migrations/20270405120000_artwork_tag/migration.sql`

```sql
CREATE TABLE IF NOT EXISTS "ArtworkTag" (
  "artworkId" UUID NOT NULL,
  "tagId"     UUID NOT NULL,
  CONSTRAINT "ArtworkTag_pkey" PRIMARY KEY ("artworkId", "tagId")
);

CREATE INDEX IF NOT EXISTS "ArtworkTag_tagId_idx"
  ON "ArtworkTag"("tagId");
CREATE INDEX IF NOT EXISTS "ArtworkTag_artworkId_idx"
  ON "ArtworkTag"("artworkId");
CREATE INDEX IF NOT EXISTS "ArtworkTag_tagId_artworkId_idx"
  ON "ArtworkTag"("tagId", "artworkId");

ALTER TABLE "ArtworkTag"
  ADD CONSTRAINT "ArtworkTag_artworkId_fkey"
  FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArtworkTag"
  ADD CONSTRAINT "ArtworkTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

Run:
```
pnpm prisma generate
pnpm typecheck
```

**Commit:** `feat(schema): add ArtworkTag join table`

---

## Task 2 — Auto-tagging cron
**File to create:** `lib/cron-autotag-artworks.ts`
**File to create:** `app/api/cron/artworks/autotag/route.ts`
**Effort:** ~75 min

### What to read first
```
cat lib/cron-enrich-artwork-descriptions.ts   # exact pattern to follow
cat lib/ingest/providers/index.ts             # getProvider()
cat app/(admin)/admin/tags/tags-client.tsx    # tag categories in use
grep -n "category" prisma/seed.ts | head -20 # tag values to expect
```

### What to build

A cron that:
1. Loads all existing tags from the DB (the canonical list)
2. For each untagged published artwork, calls the AI provider
   with the tag list and asks it to classify
3. Writes the matching ArtworkTag records

**Constants at top of file:**
```ts
const CRON_NAME = 'autotag_artworks';
const BATCH_SIZE = 10;
const DEFAULT_AUTOTAG_SYSTEM_PROMPT = `You are an art
classification assistant. Given artwork metadata and a list
of available tags grouped by category, return a JSON object
with a "tags" array containing the slug values of the most
relevant tags (maximum 5). Only use slugs from the provided
list. If no tags are relevant, return an empty array.`;
```

**`lib/cron-autotag-artworks.ts`**

1. Auth + lock: `cron:artwork:autotag`

2. Read SiteSettings — gate on `autoTagEnabled`:
   ```ts
   const settings = await db.siteSettings.findUnique({
     where: { id: 'default' },
     select: {
       autoTagEnabled: true,
       autoTagProvider: true,
       autoTagModel: true,
       openAiApiKey: true,
       anthropicApiKey: true,
       geminiApiKey: true,
     },
   });

   if (!settings?.autoTagEnabled) {
     return noStoreJson({
       ok: true, cronName: CRON_NAME, cronRunId,
       skipped: true, reason: 'autoTagEnabled is false',
     });
   }
   ```

3. Load all tags from DB and format for the prompt:
   ```ts
   const allTags = await db.tag.findMany({
     select: { slug: true, name: true, category: true },
     orderBy: [{ category: 'asc' }, { name: 'asc' }],
   });

   // Group by category for readability in the prompt
   const tagsByCategory = allTags.reduce<
     Record<string, Array<{ slug: string; name: string }>>
   >((acc, tag) => {
     if (!acc[tag.category]) acc[tag.category] = [];
     acc[tag.category].push({ slug: tag.slug, name: tag.name });
     return acc;
   }, {});

   const tagListText = Object.entries(tagsByCategory)
     .map(([cat, tags]) =>
       `${cat}: ${tags.map(t => `${t.slug} (${t.name})`).join(', ')}`
     )
     .join('\n');
   ```

4. Find published artworks with no tags yet:
   ```ts
   const artworks = await db.artwork.findMany({
     where: {
       isPublished: true,
       deletedAt: null,
       tags: { none: {} },
     },
     select: {
       id: true,
       title: true,
       medium: true,
       year: true,
       description: true,
       artist: { select: { name: true } },
     },
     orderBy: { completenessScore: 'desc' },
     take: BATCH_SIZE,
   });
   ```

5. Resolve provider — use `autoTagProvider` from settings,
   fall back to `'openai'`. Copy the `resolveProviderApiKey`
   local function from `lib/cron-enrich-artwork-descriptions.ts`
   — same pattern, do not import it.

6. For each artwork, build the classification prompt and call
   the provider:
   ```ts
   const userPrompt = [
     `Title: ${artwork.title}`,
     artwork.artist?.name
       ? `Artist: ${artwork.artist.name}` : null,
     artwork.medium ? `Medium: ${artwork.medium}` : null,
     artwork.year ? `Year: ${artwork.year}` : null,
     artwork.description
       ? `Description: ${artwork.description.slice(0, 200)}`
       : null,
     '',
     'Available tags:',
     tagListText,
   ].filter(s => s !== null).join('\n');

   const result = await provider.extract({
     html: userPrompt,
     sourceUrl: '',
     systemPrompt: DEFAULT_AUTOTAG_SYSTEM_PROMPT,
     jsonSchema: {
       type: 'object',
       properties: {
         tags: {
           type: 'array',
           items: { type: 'string' },
           maxItems: 5,
         },
       },
       required: ['tags'],
     },
     model: settings?.autoTagModel ?? '',
     apiKey,
   });
   ```

7. Validate returned slugs against the actual tag list,
   create `ArtworkTag` records for valid ones only:
   ```ts
   const returnedSlugs: string[] =
     Array.isArray(
       (result.raw as Record<string, unknown>)?.tags
     )
       ? (result.raw as Record<string, string[]>).tags.filter(
           s => typeof s === 'string'
         )
       : [];

   const tagSlugToId = new Map(
     allTags.map(t => [t.slug, t.id])
   );

   // Filter to known slugs only
   const validTagIds = returnedSlugs
     .map(slug => tagSlugToId.get(slug))
     .filter((id): id is string => Boolean(id));

   if (validTagIds.length > 0) {
     await db.artworkTag.createMany({
       data: validTagIds.map(tagId => ({
         artworkId: artwork.id,
         tagId,
       })),
       skipDuplicates: true,
     });
     tagged += 1;
   } else {
     skipped += 1;
   }
   ```

8. Per-artwork errors non-blocking. Return summary:
   `{ tagged, skipped, failed, autoTagDisabled: false }`

**Route:** `app/api/cron/artworks/autotag/route.ts` — GET + POST.

Run `pnpm typecheck` after.

**Commit:** `feat(cron): add AI auto-tagging cron for artworks`

---

## Task 3 — Artwork tags on admin detail page
**File:** `app/(admin)/admin/artwork/[id]/page.tsx`
**File to create:** `app/(admin)/admin/artwork/[id]/ArtworkTagsPanel.tsx`
**Effort:** ~45 min

### What to read first
```
cat app/(admin)/admin/artwork/[id]/page.tsx
cat app/(admin)/admin/artwork/ArtworkAdminForm.tsx
cat app/(admin)/admin/tags/tags-client.tsx   # tag management pattern
```

### Step 1 — Update page query

In `app/(admin)/admin/artwork/[id]/page.tsx`, add to the
`db.artwork.findUnique` select:

```ts
provenance: true,      // already in Artwork model
tags: {
  select: {
    tag: {
      select: { id: true, name: true, slug: true, category: true }
    }
  }
},
completenessScore: true,
completenessFlags: true,
completenessUpdatedAt: true,
```

Also fix the existing `computeArtworkCompleteness` call to
pass `dimensions` and `provenance` (currently missing):
```ts
const completeness = computeArtworkCompleteness({
  title: artwork.title,
  description: artwork.description,
  medium: artwork.medium,
  year: artwork.year,
  featuredAssetId: artwork.featuredAssetId,
  dimensions: artwork.dimensions ?? null,   // ADD
  provenance: artwork.provenance ?? null,   // ADD
}, artwork.images.length);
```

### Step 2 — Completeness panel in the page

Add a completeness summary section above the danger zone,
showing the persisted score and flags:

```tsx
{artwork.completenessUpdatedAt ? (
  <section className="rounded-lg border bg-background p-4">
    <h2 className="text-sm font-semibold mb-3">
      Data completeness
    </h2>
    <div className="flex items-center gap-3 mb-2">
      <div className="h-2 w-32 overflow-hidden rounded
        bg-muted">
        <div
          className={`h-full rounded ${
            (artwork.completenessScore ?? 0) >= 80
              ? 'bg-emerald-500'
              : (artwork.completenessScore ?? 0) >= 60
                ? 'bg-amber-400'
                : 'bg-rose-400'
          }`}
          style={{ width: `${artwork.completenessScore ?? 0}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground">
        {artwork.completenessScore ?? 0}% complete
      </span>
    </div>
    {artwork.completenessFlags.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {artwork.completenessFlags.map(flag => (
          <span
            key={flag}
            className="rounded-full bg-amber-100 px-2
              py-0.5 text-xs text-amber-800"
          >
            {flag.replace(/_/g, ' ').toLowerCase()}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-xs text-emerald-700">
        No data gaps
      </p>
    )}
  </section>
) : (
  <section className="rounded-lg border bg-muted/30 p-4">
    <p className="text-sm text-muted-foreground">
      Completeness not yet scored. Trigger{' '}
      <a
        href="/api/cron/artworks/score-completeness"
        className="underline"
      >
        /api/cron/artworks/score-completeness
      </a>
      {' '}to populate.
    </p>
  </section>
)}
```

### Step 3 — ArtworkTagsPanel component

Create `app/(admin)/admin/artwork/[id]/ArtworkTagsPanel.tsx`
as a `'use client'` component.

Props:
```ts
type Props = {
  artworkId: string;
  initialTags: Array<{
    id: string; name: string; slug: string; category: string;
  }>;
  allTags: Array<{
    id: string; name: string; slug: string; category: string;
  }>;
};
```

Render:
- Current tags as removable pills (click × to remove)
- A select dropdown showing tags not yet applied, grouped by
  category, with an "Add tag" button
- On add: POST `/api/admin/artworks/[id]/tags` with
  `{ tagId }`
- On remove: DELETE `/api/admin/artworks/[id]/tags/[tagId]`
- Optimistic local state update — add/remove from
  `currentTags` state immediately, revert on error

The tag API routes don't exist yet — note them in the commit
message as needed. For this task, wire the fetch calls but
note that the routes will 404 until Task 4 adds them.
Actually, create the routes in this task as well to keep
the feature self-contained.

### Step 4 — Tag API routes

Create:
`app/api/admin/artworks/[id]/tags/route.ts`

```ts
// POST { tagId } — add a tag
// GET — list current tags (optional, panel gets from props)
```

Create:
`app/api/admin/artworks/[id]/tags/[tagId]/route.ts`

```ts
// DELETE — remove a tag
```

Both require `requireAdmin()`. Use `db.artworkTag.create` /
`db.artworkTag.delete`. Return the updated tag or 204.

### Step 5 — Fetch allTags in the page

In `app/(admin)/admin/artwork/[id]/page.tsx`, add to the
`Promise.all` (or add a parallel query):

```ts
const allTags = await db.tag.findMany({
  select: { id: true, name: true, slug: true, category: true },
  orderBy: [{ category: 'asc' }, { name: 'asc' }],
});
```

Render `ArtworkTagsPanel` after `ImageReplacePanel`:

```tsx
<ArtworkTagsPanel
  artworkId={artwork.id}
  initialTags={artwork.tags.map(t => t.tag)}
  allTags={allTags}
/>
```

Run `pnpm typecheck` after.

**Commit:** `feat(artwork): add tags panel and completeness score to artwork admin detail page`

---

## Task 4 — Duplicate detection panel
**File to create:** `app/(admin)/admin/ingest/duplicates/page.tsx`
**File to create:** `app/(admin)/admin/ingest/duplicates/duplicates-client.tsx`
**File to update:** `app/(admin)/admin/ingest/_components/ingest-shell-client.tsx`
**Effort:** ~60 min

### What to read first
```
cat app/(admin)/admin/ingest/data-gaps/page.tsx     # page pattern
cat app/(admin)/admin/ingest/data-gaps/data-gaps-client.tsx  # list pattern
cat prisma/schema.prisma | grep -A20 "model Artwork"
```

Deduplication in this phase is **admin-confirmed only** —
no automated merging of published artworks. The page surfaces
likely duplicates for human review and provides a one-click
merge action.

### Duplicate detection logic

Two artworks are likely duplicates if they share:
- Same `artistId` AND same `title` (case-insensitive,
  after trimming whitespace)
- OR same `artistId` AND same `year` AND similarity in
  `medium` (both null, or same normalised value)

Compute this entirely in the server component using a DB
query — no external similarity library needed.

### Step 1 — Add Duplicates tab to nav

In `ingest-shell-client.tsx`, add to the Operations group
after Data Gaps and before Logs:

```tsx
<Link
  href="/admin/ingest/duplicates"
  className={`rounded-t-md px-3 py-2 text-sm ${
    pathname.startsWith('/admin/ingest/duplicates')
      ? 'bg-muted font-medium text-foreground'
      : 'text-muted-foreground hover:text-foreground'
  }`}
>
  Duplicates
</Link>
```

No badge needed — the count is shown on the page itself.

### Step 2 — Page server component

`app/(admin)/admin/ingest/duplicates/page.tsx`

```ts
export const dynamic = 'force-dynamic';
```

Find likely duplicate pairs using raw SQL for the
self-join, which Prisma can't do natively:

```ts
// Find artworks that share artistId + normalised title
const duplicatePairs = await db.$queryRaw<Array<{
  artistId: string;
  artistName: string;
  artworkId1: string;
  title1: string;
  artworkId2: string;
  title2: string;
  year1: number | null;
  year2: number | null;
  medium1: string | null;
  medium2: string | null;
}>>`
  SELECT
    a1."artistId",
    ar."name" AS "artistName",
    a1."id"    AS "artworkId1",
    a1."title" AS "title1",
    a2."id"    AS "artworkId2",
    a2."title" AS "title2",
    a1."year"  AS "year1",
    a2."year"  AS "year2",
    a1."medium" AS "medium1",
    a2."medium" AS "medium2"
  FROM "Artwork" a1
  JOIN "Artwork" a2
    ON a1."artistId" = a2."artistId"
    AND a1."id" < a2."id"
    AND a1."deletedAt" IS NULL
    AND a2."deletedAt" IS NULL
    AND LOWER(TRIM(a1."title")) = LOWER(TRIM(a2."title"))
  JOIN "Artist" ar ON ar."id" = a1."artistId"
  WHERE a1."isPublished" = true
    AND a2."isPublished" = true
  ORDER BY ar."name", a1."title"
  LIMIT 100
`;
```

Pass to `DuplicatesClient`. Also fetch both artworks'
images for the side-by-side preview:

```ts
const artworkIds = duplicatePairs.flatMap(p => [
  p.artworkId1, p.artworkId2
]);

const artworkImages = await db.artwork.findMany({
  where: { id: { in: artworkIds } },
  select: {
    id: true,
    featuredAsset: { select: { url: true } },
  },
});
```

### Step 3 — Client component

`app/(admin)/admin/ingest/duplicates/duplicates-client.tsx`

Mark `'use client'`.

For each duplicate pair, render a card showing:

**Left side (artwork 1):**
- Thumbnail (36×36)
- Title (linked to `/admin/artwork/[id]`)
- Year · Medium

**Right side (artwork 2):**
- Same fields

**Actions:**
```tsx
<div className="flex gap-2">
  <button
    onClick={() => void dismissPair(pair.artworkId1, pair.artworkId2)}
    className="text-xs text-muted-foreground underline"
  >
    Not a duplicate
  </button>
  <a
    href={`/admin/artwork/${pair.artworkId2}`}
    className="rounded border px-3 py-1 text-xs"
  >
    Review →
  </a>
</div>
```

No merge button — admins handle merging by archiving the
duplicate from the artwork detail page. The "Review →" link
takes them to the artwork where they can archive it.

"Not a duplicate" dismiss: POST to
`/api/admin/ingest/duplicates/dismiss` with
`{ artworkId1, artworkId2 }`. Store dismissals in a new
simple `DismissedDuplicate` table (see Step 4) so they
don't reappear.

**Empty state:** "No duplicate artworks detected."

### Step 4 — DismissedDuplicate schema + migration

Add to `prisma/schema.prisma`:

```prisma
model DismissedDuplicate {
  id         String   @id @default(uuid()) @db.Uuid
  artworkId1 String   @db.Uuid
  artworkId2 String   @db.Uuid
  dismissedAt DateTime @default(now())
  dismissedById String? @db.Uuid

  @@unique([artworkId1, artworkId2])
  @@index([artworkId1])
  @@index([artworkId2])
}
```

Create migration:
`prisma/migrations/20270405130000_dismissed_duplicate/migration.sql`

```sql
CREATE TABLE IF NOT EXISTS "DismissedDuplicate" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "artworkId1"   UUID NOT NULL,
  "artworkId2"   UUID NOT NULL,
  "dismissedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dismissedById" UUID,
  CONSTRAINT "DismissedDuplicate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DismissedDuplicate_artworkId1_artworkId2_key"
    UNIQUE ("artworkId1", "artworkId2")
);

CREATE INDEX IF NOT EXISTS "DismissedDuplicate_artworkId1_idx"
  ON "DismissedDuplicate"("artworkId1");
CREATE INDEX IF NOT EXISTS "DismissedDuplicate_artworkId2_idx"
  ON "DismissedDuplicate"("artworkId2");
```

Update the duplicates page query to exclude dismissed pairs:

```ts
// Add to the $queryRaw WHERE clause:
// AND NOT EXISTS (
//   SELECT 1 FROM "DismissedDuplicate" dd
//   WHERE (dd."artworkId1" = a1."id" AND dd."artworkId2" = a2."id")
//      OR (dd."artworkId1" = a2."id" AND dd."artworkId2" = a1."id")
// )
```

### Step 5 — Dismiss API route

Create:
`app/api/admin/ingest/duplicates/dismiss/route.ts`

POST `{ artworkId1, artworkId2 }` — requires `requireAdmin()`.
Creates a `DismissedDuplicate` record with `skipDuplicates: true`.
Returns 200 with `{ dismissed: true }`.

Run `pnpm prisma generate` then `pnpm typecheck` after.

**Commit:** `feat(ingest): add duplicate detection panel with dismiss workflow`

---

## Constraints
- No automated merging of published artworks — all
  deduplication requires explicit admin action
- `autoTagEnabled` must be true in SiteSettings for the
  auto-tagging cron to run — guard and return skipped cleanly
- `resolveProviderApiKey` in Task 2: copy locally from
  `cron-enrich-artwork-descriptions.ts`, do not import
- Tag slugs returned by AI are validated against the DB
  before creating ArtworkTag records — never trust raw
  AI output for DB IDs
- `DismissedDuplicate` pairs are stored canonically with
  `artworkId1 < artworkId2` (UUID string sort) to avoid
  duplicate dismiss records — enforce this in the API route
  by sorting the two IDs before creating the record
- `pnpm prisma generate` after both schema changes (Tasks 1 and 4)
- `pnpm typecheck` must pass after every task (zero errors)
- Do not modify any existing cron files or API routes
