# Phase 2 — Enrichment, Image Recovery & Quality Overview
**4 tasks · ~5 hours · 1 commit each**

Builds on Phase 1's completeness scoring to:
1. Normalise messy artwork fields deterministically (no AI, no cost)
2. Generate descriptions for low-score artworks via AI
3. Recover missing images using the existing image pipeline
4. Surface a Quality Overview tab showing data health at a glance

No new npm dependencies. All AI calls use the existing provider
system and SiteSettings keys already in the repo.

---

## Task 1 — Layer 1: deterministic normalization backfill
**File to create:** `lib/cron-normalize-artwork-fields.ts`
**File to create:** `app/api/cron/artworks/normalize-fields/route.ts`
**Effort:** ~45 min

### What to read first
```
cat lib/cron-ingest-backfill-event-images.ts   # cron pattern to follow
cat lib/cron-runtime.ts                        # lock signature
cat lib/artwork-completeness.ts                # field names
```

### What to build

A cron that finds published artworks with messy or missing
normalizable fields and fixes them without any AI calls.

**`lib/cron-normalize-artwork-fields.ts`**

Constants at top of file (tunable):
```ts
const CRON_NAME = 'normalize_artwork_fields';
const BATCH_SIZE = 50;
const YEAR_PATTERN = /\b(1[4-9]\d{2}|20[0-2]\d)\b/;
const MEDIUM_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/\boil\s+on\s+canvas\b/i,     'Oil on canvas'],
  [/\bacrylic\s+on\s+canvas\b/i, 'Acrylic on canvas'],
  [/\bwatercolou?r\b/i,          'Watercolour'],
  [/\bphotograph\b/i,            'Photography'],
  [/\bmixed\s+media\b/i,         'Mixed media'],
  [/\bscreen\s*print\b/i,        'Screenprint'],
  [/\blinocut\b/i,               'Linocut'],
  [/\betching\b/i,               'Etching'],
  [/\blithograph\b/i,            'Lithograph'],
  [/\bpencil\b/i,                'Pencil on paper'],
  [/\bcharcoal\b/i,              'Charcoal on paper'],
  [/\bpastel\b/i,                'Pastel'],
  [/\bsculpture\b/i,             'Sculpture'],
  [/\bceramics?\b/i,             'Ceramics'],
  [/\bvideo\b/i,                 'Video'],
  [/\binstallation\b/i,          'Installation'],
  [/\bprints?\b/i,               'Print'],
];
```

Logic:

1. Auth + lock: `cron:artwork:normalize-fields`

2. Fetch published artworks needing normalization — those
   where medium is set but doesn't match any normalized form,
   OR year is null but title might contain a year:
   ```ts
   const artworks = await db.artwork.findMany({
     where: {
       deletedAt: null,
       isPublished: true,
       OR: [
         { medium: { not: null } },
         { year: null, title: { not: null } },
       ],
     },
     select: {
       id: true,
       title: true,
       medium: true,
       year: true,
     },
     orderBy: { updatedAt: 'asc' },
     take: BATCH_SIZE * 10,
   });
   ```

3. For each artwork, compute the patch:
   ```ts
   function normalizeMedium(raw: string | null): string | null {
     if (!raw) return null;
     const trimmed = raw.trim();
     for (const [pattern, normalized] of MEDIUM_NORMALIZATIONS) {
       if (pattern.test(trimmed)) return normalized;
     }
     // Capitalise first letter only if all lowercase
     if (trimmed === trimmed.toLowerCase()) {
       return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
     }
     return trimmed; // already mixed case — leave alone
   }

   function extractYearFromTitle(title: string | null): number | null {
     if (!title) return null;
     const match = YEAR_PATTERN.exec(title);
     return match ? parseInt(match[1], 10) : null;
   }
   ```

4. Build a patch object — only include fields that actually
   change:
   ```ts
   const patch: { medium?: string; year?: number } = {};
   const normalizedMedium = normalizeMedium(artwork.medium);
   if (normalizedMedium && normalizedMedium !== artwork.medium) {
     patch.medium = normalizedMedium;
   }
   if (!artwork.year) {
     const inferredYear = extractYearFromTitle(artwork.title);
     if (inferredYear) patch.year = inferredYear;
   }
   if (Object.keys(patch).length === 0) continue;
   ```

5. Apply the patch and reset `completenessUpdatedAt` to null
   so the scoring cron rescores this artwork on its next run:
   ```ts
   await db.artwork.update({
     where: { id: artwork.id },
     data: { ...patch, completenessUpdatedAt: null },
   });
   ```

6. Return summary: `{ normalized, skipped, failed }`

**Route file:** `app/api/cron/artworks/normalize-fields/route.ts`

GET + POST, same pattern as other cron routes.

Run `pnpm typecheck` after.

**Commit:** `feat(cron): add deterministic artwork field normalization cron`

---

## Task 2 — Layer 4: AI description generation for low-score artworks
**File to create:** `lib/cron-enrich-artwork-descriptions.ts`
**File to create:** `app/api/cron/artworks/enrich-descriptions/route.ts`
**Effort:** ~75 min

### What to read first
```
cat lib/ingest/artist-discovery.ts    # AI provider call pattern
                                       # resolveProviderApiKey function
                                       # how provider.extract() is called
cat lib/ingest/artwork-extraction.ts  # resolveProviderApiKey signature
cat lib/ingest/providers/index.ts     # getProvider()
```

The `resolveProviderApiKey` function is defined locally in
multiple lib files. Copy the same local implementation into
the new cron file rather than importing from those files —
they're not exported.

### What to build

A cron that finds published artworks where:
- `completenessScore < 60`
- `description` is null or shorter than 20 characters
- `completenessUpdatedAt` is not null (has been scored at least once)

For each, calls the AI provider with a structured prompt to
generate a description, then writes it back.

**Constants at top (tunable):**
```ts
const CRON_NAME = 'enrich_artwork_descriptions';
const BATCH_SIZE = 10;        // AI calls are expensive — keep small
const SCORE_THRESHOLD = 60;
const MIN_DESCRIPTION_LENGTH = 20;
const DEFAULT_DESCRIPTION_PROMPT = `You are an art writer. Given
artwork metadata, write a concise, professional description
(2–3 sentences, 40–80 words). Focus on the work's visual
character, materials, and mood. Do not invent facts not in
the metadata. Return only the description text with no
preamble or quotes.`;
```

**`lib/cron-enrich-artwork-descriptions.ts`**

1. Auth + lock: `cron:artwork:enrich-descriptions`

2. Check feature gate — return early if `openAiApiKey`,
   `anthropicApiKey`, AND `geminiApiKey` are all null in
   SiteSettings AND the environment has no provider keys:
   ```ts
   const settings = await db.siteSettings.findUnique({
     where: { id: 'default' },
     select: {
       artworkExtractionProvider: true,
       openAiApiKey: true,
       anthropicApiKey: true,
       geminiApiKey: true,
       artworkExtractionSystemPrompt: true,
     },
   });

   const hasApiKey =
     settings?.openAiApiKey ||
     settings?.anthropicApiKey ||
     settings?.geminiApiKey ||
     process.env.OPENAI_API_KEY ||
     process.env.ANTHROPIC_API_KEY ||
     process.env.GEMINI_API_KEY;

   if (!hasApiKey) {
     return noStoreJson({
       ok: true, cronName: CRON_NAME, cronRunId,
       skipped: true, reason: 'no_api_key_configured',
     });
   }
   ```

3. Fetch target artworks:
   ```ts
   const artworks = await db.artwork.findMany({
     where: {
       deletedAt: null,
       isPublished: true,
       completenessScore: { lt: SCORE_THRESHOLD },
       completenessUpdatedAt: { not: null },
       OR: [
         { description: null },
         { description: { not: null } },
       ],
     },
     select: {
       id: true,
       title: true,
       medium: true,
       year: true,
       dimensions: true,
       artist: { select: { name: true } },
       description: true,
     },
     orderBy: { completenessScore: 'asc' },
     take: BATCH_SIZE,
   });

   // Filter client-side for short descriptions
   const targets = artworks.filter(
     a => !a.description ||
          a.description.trim().length < MIN_DESCRIPTION_LENGTH
   );
   ```

4. Resolve the AI provider using the same pattern as
   `lib/ingest/artwork-extraction.ts`:
   ```ts
   function resolveProviderApiKey(
     provider: 'openai' | 'gemini' | 'claude',
     s: { openAiApiKey?: string | null;
          anthropicApiKey?: string | null;
          geminiApiKey?: string | null },
   ): string {
     switch (provider) {
       case 'claude':
         return s.anthropicApiKey ??
                process.env.ANTHROPIC_API_KEY ?? '';
       case 'gemini':
         return s.geminiApiKey ??
                process.env.GEMINI_API_KEY ?? '';
       default:
         return s.openAiApiKey ??
                process.env.OPENAI_API_KEY ?? '';
     }
   }
   ```

5. For each artwork, build a prompt and call the provider:
   ```ts
   const systemPrompt =
     settings?.artworkExtractionSystemPrompt?.trim() ||
     DEFAULT_DESCRIPTION_PROMPT;

   const userPrompt = [
     `Title: ${artwork.title}`,
     artwork.artist?.name
       ? `Artist: ${artwork.artist.name}` : null,
     artwork.medium ? `Medium: ${artwork.medium}` : null,
     artwork.year ? `Year: ${artwork.year}` : null,
     artwork.dimensions
       ? `Dimensions: ${artwork.dimensions}` : null,
   ].filter(Boolean).join('\n');

   const result = await provider.extract({
     html: userPrompt,
     sourceUrl: '',
     systemPrompt,
     jsonSchema: {
       type: 'object',
       properties: {
         description: { type: 'string' },
       },
       required: ['description'],
     },
     model: '',
     apiKey,
   });
   ```

6. Write the generated description back if it's non-empty
   and longer than MIN_DESCRIPTION_LENGTH. Also reset
   `completenessUpdatedAt` to null so the scoring cron
   rescores:
   ```ts
   const generated =
     typeof result.raw === 'object' && result.raw
       ? (result.raw as Record<string, unknown>).description
       : null;

   if (typeof generated === 'string' &&
       generated.trim().length >= MIN_DESCRIPTION_LENGTH) {
     await db.artwork.update({
       where: { id: artwork.id },
       data: {
         description: generated.trim(),
         completenessUpdatedAt: null,
       },
     });
     enriched += 1;
   } else {
     skipped += 1;
   }
   ```

7. Wrap each artwork in try/catch — per-artwork failures
   are non-blocking. Return summary:
   `{ enriched, skipped, failed, noApiKey: false }`

**Route file:** `app/api/cron/artworks/enrich-descriptions/route.ts`

GET + POST.

Run `pnpm typecheck` after.

**Commit:** `feat(cron): add AI description generation cron for low-score artworks`

---

## Task 3 — Image recovery cron for MISSING_IMAGE artworks
**File to create:** `lib/cron-recover-artwork-images.ts`
**File to create:** `app/api/cron/artworks/recover-images/route.ts`
**Effort:** ~60 min

### What to read first
```
cat lib/cron-ingest-backfill-event-images.ts   # exact pattern to follow
cat lib/ingest/import-approved-artwork-image.ts  # full function signature
```

The `importApprovedArtworkImage` function already handles:
- Checking if the artwork already has an image (skips if so)
- Fetching the source URL and discovering an image
- Uploading to blob storage
- Creating the Asset + ArtworkImage + updating featuredAssetId

This cron's job is just to find the right artworks and call it.

### What to build

**`lib/cron-recover-artwork-images.ts`**

Constants:
```ts
const CRON_NAME = 'recover_artwork_images';
const BATCH_SIZE = 10;   // image fetching is network-bound
```

Logic:

1. Auth + lock: `cron:artwork:recover-images`

2. Check `AI_INGEST_IMAGE_ENABLED` env var — return early
   if not set, same as `cron-ingest-backfill-event-images.ts`:
   ```ts
   if (process.env.AI_INGEST_IMAGE_ENABLED !== '1') {
     return noStoreJson({
       ok: true, cronName: CRON_NAME, cronRunId,
       skipped: true,
       reason: 'AI_INGEST_IMAGE_ENABLED not set',
     });
   }
   ```

3. Find published artworks flagged MISSING_IMAGE, using the
   Phase 1 completeness flag:
   ```ts
   const artworks = await db.artwork.findMany({
     where: {
       deletedAt: null,
       isPublished: true,
       featuredAssetId: null,
       completenessFlags: { has: 'MISSING_IMAGE' },
     },
     select: {
       id: true,
       title: true,
       ingestCandidate: {
         select: {
           id: true,
           sourceUrl: true,
           imageUrl: true,
           sourceEvent: {
             select: {
               venue: {
                 select: { websiteUrl: true }
               }
             }
           }
         }
       },
     },
     orderBy: { completenessUpdatedAt: 'asc' },
     take: BATCH_SIZE,
   });
   ```

   The `ingestCandidate` relation on Artwork is
   `IngestExtractedArtwork?` — check the schema to confirm
   the relation name before writing. It has `imageUrl` and
   `sourceUrl` fields which are the best sources for image
   recovery.

4. For each artwork, call `importApprovedArtworkImage`:
   ```ts
   const candidate = artwork.ingestCandidate;
   const result = await importApprovedArtworkImage({
     appDb: db,
     candidateId: candidate?.id ?? artwork.id,
     runId: candidate?.id ?? artwork.id,
     artworkId: artwork.id,
     title: artwork.title,
     sourceUrl: candidate?.sourceUrl ?? null,
     candidateImageUrl: candidate?.imageUrl ?? null,
     requestId: `recover-images-${artwork.id}`,
   });
   ```

5. Whether or not the image was attached, reset
   `completenessUpdatedAt` to null so the scoring cron
   rescores on the next run and removes the MISSING_IMAGE
   flag if the image was successfully attached:
   ```ts
   await db.artwork.update({
     where: { id: artwork.id },
     data: { completenessUpdatedAt: null },
   });

   if (result.attached) attached += 1;
   else skipped += 1;
   ```

6. Per-artwork errors are non-blocking. Return summary:
   `{ attached, skipped, failed }`

**Route file:** `app/api/cron/artworks/recover-images/route.ts`

GET + POST.

Run `pnpm typecheck` after.

**Commit:** `feat(cron): add image recovery cron for MISSING_IMAGE flagged artworks`

---

## Task 4 — Quality Overview tab
**Files to create:**
- `app/(admin)/admin/ingest/quality/page.tsx`
- `app/(admin)/admin/ingest/quality/quality-client.tsx`

**Files to update:**
- `app/(admin)/admin/ingest/_components/ingest-shell-client.tsx`
- `app/(admin)/admin/ingest/layout.tsx`

**Effort:** ~60 min

### What to read first
```
cat app/(admin)/admin/ingest/_components/ingest-shell-client.tsx
cat app/(admin)/admin/ingest/layout.tsx
cat app/(admin)/admin/ingest/health/page.tsx   # pattern for stats page
```

### Step 1 — Add Quality tab to nav

Add to the Operations group in `ingest-shell-client.tsx`,
before Data Gaps (which was added in Phase 1):

```tsx
<Link
  href="/admin/ingest/quality"
  className={`rounded-t-md px-3 py-2 text-sm ${
    pathname.startsWith('/admin/ingest/quality')
      ? 'bg-muted font-medium text-foreground'
      : 'text-muted-foreground hover:text-foreground'
  }`}
>
  Quality
</Link>
```

No badge needed on this tab — it's an overview, not a
work queue.

### Step 2 — Page server component

`app/(admin)/admin/ingest/quality/page.tsx`

```tsx
export const dynamic = 'force-dynamic';
```

Run these queries in a single `Promise.all`:

```ts
const [
  totalPublished,
  totalWithImages,
  totalScored,
  avgScoreResult,
  flagBreakdown,
  scoredLast24h,
  recentlyEnriched,
] = await Promise.all([
  // Total published artworks
  db.artwork.count({
    where: { isPublished: true, deletedAt: null },
  }),

  // Published with a featured image
  db.artwork.count({
    where: {
      isPublished: true,
      deletedAt: null,
      featuredAssetId: { not: null },
    },
  }),

  // Artworks that have been scored at least once
  db.artwork.count({
    where: {
      isPublished: true,
      deletedAt: null,
      completenessUpdatedAt: { not: null },
    },
  }),

  // Average completeness score (among scored artworks)
  db.artwork.aggregate({
    where: {
      isPublished: true,
      deletedAt: null,
      completenessUpdatedAt: { not: null },
    },
    _avg: { completenessScore: true },
  }),

  // Count per flag
  Promise.all([
    'MISSING_IMAGE',
    'LOW_CONFIDENCE_METADATA',
    'INCOMPLETE',
  ].map(async (flag) => ({
    flag,
    count: await db.artwork.count({
      where: {
        isPublished: true,
        deletedAt: null,
        completenessFlags: { has: flag },
      },
    }),
  }))),

  // Scored in last 24 hours
  db.artwork.count({
    where: {
      isPublished: true,
      deletedAt: null,
      completenessUpdatedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  }),

  // Description generated in last 7 days
  // (description changed + completenessScore improved)
  db.artwork.count({
    where: {
      isPublished: true,
      deletedAt: null,
      description: { not: null },
      completenessUpdatedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  }),
]);

const avgScore = Math.round(
  avgScoreResult._avg.completenessScore ?? 0
);
const pctWithImages = totalPublished > 0
  ? Math.round((totalWithImages / totalPublished) * 100)
  : 0;
const pctScored = totalPublished > 0
  ? Math.round((totalScored / totalPublished) * 100)
  : 0;
```

Pass all values to `QualityClient`.

### Step 3 — Client component

`app/(admin)/admin/ingest/quality/quality-client.tsx`

Mark `'use client'`. Display as a clean stats grid — no
interactive state needed, all values are server-computed.

**Top stat cards (4 across):**

| % with images | Avg completeness score | Artworks scored | Scored last 24h |
|---------------|------------------------|-----------------|-----------------|

Use the same `StatCard`-style layout as the ingest shell:
muted label above, large number below. Colour the image
percentage: green ≥ 95%, amber 80–94%, red < 80%.
Colour the avg score: green ≥ 80, amber 60–79, red < 60.

**Completeness distribution bar** (same visual as the
confidence bar in the shell):
```tsx
// Show score distribution across buckets:
// HIGH (≥80), MEDIUM (60–79), LOW (<60)
// Query these counts on the server and pass as props
```

Add three more count queries to the page:
```ts
db.artwork.count({
  where: {
    isPublished: true, deletedAt: null,
    completenessScore: { gte: 80 },
  },
}),
db.artwork.count({
  where: {
    isPublished: true, deletedAt: null,
    completenessScore: { gte: 60, lt: 80 },
  },
}),
db.artwork.count({
  where: {
    isPublished: true, deletedAt: null,
    completenessScore: { lt: 60 },
  },
}),
```

**Flag breakdown table:**

| Flag | Count | % of published | Action |
|------|-------|----------------|--------|
| Missing image | N | N% | → Data Gaps |
| Low confidence | N | N% | → Data Gaps |
| Incomplete | N | N% | → Data Gaps |

Each row links to `/admin/ingest/data-gaps?flag=MISSING_IMAGE`
etc. (the Data Gaps Explorer from Phase 1).

**Cron status section** — show which enrichment crons are
available and link to their manual trigger URLs:

```tsx
<section className="rounded-lg border bg-background p-4">
  <h2 className="text-sm font-semibold mb-3">
    Enrichment crons
  </h2>
  <div className="space-y-2 text-sm">
    <div className="flex items-center justify-between">
      <span>Score completeness</span>
      <a href="/api/cron/artworks/score-completeness"
         className="text-xs underline text-muted-foreground">
        Trigger manually →
      </a>
    </div>
    <div className="flex items-center justify-between">
      <span>Normalize fields</span>
      <a href="/api/cron/artworks/normalize-fields"
         className="text-xs underline text-muted-foreground">
        Trigger manually →
      </a>
    </div>
    <div className="flex items-center justify-between">
      <span>Recover images</span>
      <a href="/api/cron/artworks/recover-images"
         className="text-xs underline text-muted-foreground">
        Trigger manually →
      </a>
    </div>
    <div className="flex items-center justify-between">
      <span>Enrich descriptions</span>
      <a href="/api/cron/artworks/enrich-descriptions"
         className="text-xs underline text-muted-foreground">
        Trigger manually →
      </a>
    </div>
  </div>
  <p className="mt-3 text-xs text-muted-foreground">
    These crons also run automatically via the DB scheduler.
    Trigger manually to populate the view immediately after
    first deploy.
  </p>
</section>
```

**Empty state** — if `totalScored === 0`:
```tsx
<div className="rounded-lg border bg-background p-10
  text-center text-sm text-muted-foreground">
  No artworks have been scored yet. Trigger the scoring
  cron at{' '}
  <a href="/api/cron/artworks/score-completeness"
     className="underline">
    /api/cron/artworks/score-completeness
  </a>
  {' '}to populate this view.
</div>
```

Run `pnpm typecheck` after.

**Commit:** `feat(ingest): add Quality Overview tab with completeness stats, flag breakdown, and cron links`

---

## Constraints
- `AI_INGEST_IMAGE_ENABLED=1` must be set for the image
  recovery cron to run — guard same as backfill-event-images
- AI description cron guards on API key presence —
  returns `skipped: reason: 'no_api_key_configured'` cleanly
- No new npm dependencies
- All crons: per-item errors non-blocking, BATCH_SIZE
  constants defined at top of file
- Reset `completenessUpdatedAt` to null after any field
  update so the scoring cron rescores automatically
- pnpm typecheck must pass after every task (zero errors)
- Do not modify any existing cron files or API routes
