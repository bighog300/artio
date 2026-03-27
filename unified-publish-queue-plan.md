# Unified Publish Queue — Implementation Plan v1.0

**Project:** Artio / Artpulse  
**Status:** Ready for Codex  
**Scope:** Ready to Publish page · publish API routing · origin tracking · nav badge  
**Effort:** ~5–7 hours across 3 Codex prompts  
**Risk:** Low — additive changes only. No schema changes. No existing routes modified.

---

## 1. Background and goals

The current Ready to Publish page surfaces only artists and artworks that entered via AI ingest (`isAiDiscovered = true` or `ingestCandidate` present). Three other paths deposit records into `IN_REVIEW` with no admin visibility:

- **Venue claims** — approved claims set the venue to `IN_REVIEW`. No queue surfaces these.
- **Artist claims** — same pattern. Artist sits at `IN_REVIEW` after claim approval.
- **Manually created records** — admin-created venues and artists at `DRAFT` or `IN_REVIEW` have no publish queue.
- **Events blocked by unpublished venue** — events approved via ingest whose venue is not yet `PUBLISHED` are created as `DRAFT`. No UI surface exists to re-review them once the venue publishes.

The upgrade replaces the two-section (artists / artworks) ingest-only view with a unified queue covering all four entity types from all origins. Records are sorted by readiness score. Hard blockers disable the Publish button with a specific remediation action. Soft warnings allow "Publish anyway".

---

## 2. Publish lifecycle — all four entity types

The `ContentStatus` enum: `DRAFT`, `ONBOARDING`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `PUBLISHED`, `ARCHIVED`.

The Ready to Publish queue targets records at `IN_REVIEW` (artists, artworks, venues) or `DRAFT` (events blocked by unpublished venue).

### 2.1 Status transitions

| Entity | From | To | Trigger | Notes |
|--------|------|----|---------|-------|
| Venue | `DRAFT` / `ONBOARDING` | `PUBLISHED` | Admin publishes | Standalone. Requires name, city, country, coordinates. |
| Event | `PENDING` candidate | `PUBLISHED` | Approve in event queue | Requires venue to be `PUBLISHED`. If not, created as `DRAFT`. |
| Event | `DRAFT` | `PUBLISHED` | Admin re-reviews **here** | After venue publishes. No UI surface today — this queue adds it. |
| Artist | `PENDING` candidate | `IN_REVIEW` | Approve in artist queue | Stops here. Needs image + bio before publish. |
| Artist | `IN_REVIEW` | `PUBLISHED` | Admin publishes **here** | Requires name, bio (20+ chars), `featuredAssetId`. |
| Artwork | `PENDING` candidate | `IN_REVIEW` | Approve in artwork queue | Stops here. Needs image + title + artist. |
| Artwork | `IN_REVIEW` | `PUBLISHED` | Admin publishes **here** | Requires title, image. Artist may be a stub. |

### 2.2 Origin detection

Each entity uses existing schema fields. No new fields needed.

| Entity | Ingest origin | Claim origin | Manual origin |
|--------|--------------|--------------|---------------|
| Artist | `isAiDiscovered = true` | has `Submission` record | neither |
| Artwork | `ingestCandidate` relation not null | n/a | no `ingestCandidate` |
| Venue | `generationRunItems.length > 0` | has `Submission` record | neither |
| Event | `isAiExtracted = true` | has `Submission` record | neither |

---

## 3. Readiness scoring

Every record gets a readiness score (0–100%) computed from existing lib functions. The score determines sort order and controls whether the Publish button is enabled.

### 3.1 Hard blockers vs soft warnings

| Entity | Hard blockers (disable Publish) | Soft warnings (allow "Publish anyway") |
|--------|---------------------------------|----------------------------------------|
| Event | No `startAt` / no `timezone` / venue not `PUBLISHED` | No image / no description |
| Artist | No name / bio < 20 chars / no `featuredAssetId` | No website / no nationality / no mediums |
| Artwork | No title / no image (`featuredAssetId` null and `imageCount = 0`) | No description / no medium / no year |
| Venue | No name / no city / no country / no coordinates | No image / no `eventsPageUrl` / no description |

### 3.2 Score formula

Add to `lib/publish-readiness.ts`:

```ts
export function computeReadinessScore(
  blockers: string[],        // hard blockers
  warnings: string[],        // soft warnings
  completenessScore: number, // 0–100 from existing lib
): number {
  const pct = Math.max(0, Math.min(100, completenessScore));
  if (blockers.length > 0) return Math.min(pct, 39);
  if (warnings.length > 0) return 40 + Math.round(pct * 0.59);
  return Math.max(pct, 80);
}
```

- Blocked records capped at 39%
- Warning-only records score 40–99%
- Clean records score minimum 80%

This guarantees blocked records always sort below unblocked ones regardless of completeness.

### 3.3 Existing completeness functions (no changes)

- Artists: `computeArtistCompleteness()` in `lib/artist-completeness.ts`
- Artworks: `computeArtworkCompleteness()` in `lib/artwork-completeness.ts`
- Venues: `computeVenuePublishBlockers()` in `lib/publish-readiness.ts`
- Events: `computeEventPublishBlockers()` in `lib/publish-readiness.ts`

---

## 4. Unified record type

The page Server Component assembles all four entity types into a single `UnifiedRecord[]` array. No schema changes required.

```ts
type EntityType = 'EVENT' | 'ARTIST' | 'ARTWORK' | 'VENUE';
type Origin = 'ingest' | 'venue_generation' | 'claim' | 'manual';

type UnifiedRecord = {
  id:               string;
  entityType:       EntityType;
  title:            string;
  subtitle:         string | null;   // venue name, artist name, date, etc.
  origin:           Origin;
  adminHref:        string;          // link to admin edit page
  image:            ResolvedAsset | null;
  readinessScore:   number;          // 0–100
  blockers:         string[];        // hard — disables Publish
  warnings:         string[];        // soft — shows amber chips
  chips:            string[];        // green ready chips
  publishApiPath:   string;          // POST endpoint
  remediationHref:  string | null;   // "fix this" link when blocked
  remediationLabel: string | null;   // button label when blocked
};
```

### 4.1 Publish API paths (existing, no changes needed)

| Entity | Endpoint |
|--------|----------|
| Artist | `POST /api/admin/ingest/ready-to-publish/artists/[id]` |
| Artwork | `POST /api/admin/ingest/ready-to-publish/artworks/[id]` |
| Venue | `POST /api/admin/venues/[id]/publish` |
| Event | `POST /api/admin/events/[id]/publish` |

---

## 5. Implementation tasks

All tasks are additive. Run `pnpm typecheck` after each.

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| T1 | Add readiness scoring utility | `lib/publish-readiness.ts` | 30m |
| T2 | Expand page query to all four entity types | `ready-to-publish/page.tsx` | 60m |
| T3 | Rewrite client as unified list | `ready-to-publish-client.tsx` | 90m |
| T4 | Add filter chips | `ready-to-publish-client.tsx` | 30m |
| T5 | Add bulk publish all ready | `ready-to-publish-client.tsx` | 30m |
| T6 | Update nav badge counter | `ingest/layout.tsx` | 20m |

---

## 6. Detailed task specifications

### T1 — Readiness scoring utility

**File:** `lib/publish-readiness.ts`

Add at the bottom of the file after all existing exports. No other changes.

```ts
export function computeReadinessScore(
  blockers: string[],
  warnings: string[],
  completenessScore: number,
): number {
  const pct = Math.max(0, Math.min(100, completenessScore));
  if (blockers.length > 0) return Math.min(pct, 39);
  if (warnings.length > 0) return 40 + Math.round(pct * 0.59);
  return Math.max(pct, 80);
}
```

---

### T2 — Page query expansion

**File:** `app/(admin)/admin/ingest/ready-to-publish/page.tsx`

Replace the current two-query `Promise.all` with five parallel queries:

**Query 1 — Artists**
```ts
db.artist.findMany({
  where: { status: 'IN_REVIEW', deletedAt: null },
  // NOTE: isAiDiscovered filter REMOVED — surfaces all origins
  select: {
    id: true, name: true, slug: true, bio: true,
    mediums: true, websiteUrl: true, instagramUrl: true,
    nationality: true, birthYear: true, isAiDiscovered: true,
    featuredAsset: { select: { url: true, originalUrl: true,
      processingStatus: true, processingError: true,
      variants: { select: { variantName: true, url: true } } } },
    _count: { select: { artworks: true, images: true } },
    submissions: { select: { id: true }, take: 1 },
  },
  orderBy: { updatedAt: 'desc' },
  take: 100,
})
```

**Query 2 — Artworks**
```ts
db.artwork.findMany({
  where: { status: 'IN_REVIEW', deletedAt: null },
  // NOTE: ingestCandidate filter REMOVED — surfaces all origins
  select: {
    id: true, title: true, slug: true, medium: true,
    year: true, description: true, featuredAssetId: true,
    featuredAsset: { select: { url: true, originalUrl: true,
      processingStatus: true, processingError: true,
      variants: { select: { variantName: true, url: true } } } },
    artist: { select: { id: true, name: true, slug: true, status: true } },
    _count: { select: { images: true } },
    ingestCandidate: { select: { id: true } },
  },
  orderBy: { updatedAt: 'desc' },
  take: 100,
})
```

**Query 3 — Venues**
```ts
db.venue.findMany({
  where: {
    status: { in: ['IN_REVIEW', 'ONBOARDING'] },
    deletedAt: null,
  },
  select: {
    id: true, name: true, slug: true, city: true,
    country: true, lat: true, lng: true,
    eventsPageUrl: true, description: true,
    featuredAssetId: true,
    featuredAsset: { select: { url: true, originalUrl: true,
      processingStatus: true, processingError: true,
      variants: { select: { variantName: true, url: true } } } },
    generationRunItems: { select: { id: true }, take: 1 },
    submissions: { select: { id: true }, take: 1 },
  },
  orderBy: { updatedAt: 'desc' },
  take: 100,
})
```

**Query 4 — Events (blocked by unpublished venue)**
```ts
db.event.findMany({
  where: {
    status: 'DRAFT',
    isAiExtracted: true,
    deletedAt: null,
    venue: { isPublished: false },
  },
  select: {
    id: true, title: true, slug: true,
    startAt: true, timezone: true, featuredAssetId: true,
    isAiExtracted: true,
    featuredAsset: { select: { url: true, originalUrl: true,
      processingStatus: true, processingError: true,
      variants: { select: { variantName: true, url: true } } } },
    venue: { select: {
      id: true, name: true, slug: true,
      status: true, isPublished: true,
    }},
    submissions: { select: { id: true }, take: 1 },
  },
  orderBy: { updatedAt: 'desc' },
  take: 50,
})
```

**After fetching:** map each result to `UnifiedRecord` using origin detection from section 2.2, compute blockers/warnings/chips/`readinessScore` using the lib functions from section 3.3, combine all arrays, sort by `readinessScore` descending, pass as `records: UnifiedRecord[]` to the client.

**Update the page description to:**
> "All records awaiting publication — events, artists, artworks, and venues from all origins."

**Origin detection logic:**

```ts
function deriveOrigin(entity: {
  isAiDiscovered?: boolean;
  isAiExtracted?: boolean;
  ingestCandidate?: { id: string } | null;
  generationRunItems?: Array<{ id: string }>;
  submissions?: Array<{ id: string }>;
}, entityType: EntityType): Origin {
  if (entityType === 'ARTIST') {
    if (entity.isAiDiscovered) return 'ingest';
    if (entity.submissions?.length) return 'claim';
    return 'manual';
  }
  if (entityType === 'ARTWORK') {
    if (entity.ingestCandidate) return 'ingest';
    return 'manual';
  }
  if (entityType === 'VENUE') {
    if (entity.generationRunItems?.length) return 'venue_generation';
    if (entity.submissions?.length) return 'claim';
    return 'manual';
  }
  if (entityType === 'EVENT') {
    if (entity.isAiExtracted) return 'ingest';
    if (entity.submissions?.length) return 'claim';
    return 'manual';
  }
  return 'manual';
}
```

**Publish API path per entity type:**

```ts
const publishApiPath: Record<EntityType, (id: string) => string> = {
  ARTIST:  (id) => `/api/admin/ingest/ready-to-publish/artists/${id}`,
  ARTWORK: (id) => `/api/admin/ingest/ready-to-publish/artworks/${id}`,
  VENUE:   (id) => `/api/admin/venues/${id}/publish`,
  EVENT:   (id) => `/api/admin/events/${id}/publish`,
};
```

**Remediation when blocked:**

```ts
const remediationHref: Partial<Record<EntityType, (id: string) => string>> = {
  ARTIST:  (id) => `/admin/artists/${id}`,
  ARTWORK: (id) => `/admin/artwork/${id}`,
  VENUE:   (id) => `/admin/venues/${id}`,
  EVENT:   (id) => `/admin/events/${id}`,
};
// Label: 'Add image', 'Complete profile', 'Publish venue first', etc.
// Derive from the first blocker string.
```

---

### T3 — Unified client component

**File:** `app/(admin)/admin/ingest/ready-to-publish/ready-to-publish-client.tsx`

Key structural changes:

- Replace `artists: ArtistRow[]` and `artworks: ArtworkRow[]` props with `records: UnifiedRecord[]`.
- Replace the two-section table layout with a single `<section>` containing a list of unified rows.
- Each row renders:
  - Entity type badge (coloured pill: EVENT/ARTIST/ARTWORK/VENUE)
  - 36px thumbnail (or placeholder)
  - Title + subtitle
  - Origin chip (`via ingest` / `via venue generation` / `via claim` / `manually added`)
  - Readiness bar (0–100%, green ≥ 80%, amber 40–79%, red < 40%)
  - Blocker chips (red) — from `record.blockers`
  - Warning chips (amber) — from `record.warnings`
  - Green ready chips — from `record.chips`
  - Action buttons
- Publish button: **disabled** when `record.blockers.length > 0`. Show `record.remediationLabel` as a button linking to `record.remediationHref`.
- Soft warnings: amber chips shown, Publish button **enabled**, labelled "Publish anyway".
- On successful publish: remove record from local state optimistically. Show "Published [name]" note in header.

**Preserve existing publish functions. Add two new ones. Add dispatcher:**

```ts
async function publishVenue(id: string) {
  // same pattern as publishArtist
  const res = await fetch(`/api/admin/venues/${id}/publish`, { method: 'POST' });
  // handle response...
}

async function publishEvent(id: string) {
  // same pattern as publishArtist
  const res = await fetch(`/api/admin/events/${id}/publish`, { method: 'POST' });
  // handle response...
}

async function publishRecord(record: UnifiedRecord) {
  // Route to correct function via record.publishApiPath
  // OR use record.entityType switch:
  switch (record.entityType) {
    case 'ARTIST':  return publishArtist(record.id);
    case 'ARTWORK': return publishArtwork(record.id);
    case 'VENUE':   return publishVenue(record.id);
    case 'EVENT':   return publishEvent(record.id);
  }
}
```

**Update bulk publish to use the dispatcher:**

```ts
async function bulkPublishReady() {
  const eligible = records.filter(r => r.readinessScore >= 80);
  // BATCH_SIZE = 3, Promise.allSettled, same pattern as existing
  await Promise.allSettled(batch.map(r => publishRecord(r)));
}
```

---

### T4 — Filter chips

**File:** `app/(admin)/admin/ingest/ready-to-publish/ready-to-publish-client.tsx`

Add client-side filter state. No server refetch.

```ts
const [typeFilter, setTypeFilter] =
  useState<EntityType | 'ALL'>('ALL');
const [originFilter, setOriginFilter] =
  useState<Origin | 'ALL'>('ALL');

const filtered = records.filter((r) => {
  if (typeFilter !== 'ALL' && r.entityType !== typeFilter) return false;
  if (originFilter !== 'ALL' && r.origin !== originFilter) return false;
  return true;
});
```

Render two chip rows above the list:
- Row 1: `ALL` · `Events (N)` · `Artists (N)` · `Artworks (N)` · `Venues (N)`
- Row 2: `ALL` · `Via ingest (N)` · `Via venue generation (N)` · `Via claim (N)` · `Manually added (N)`

Active chip uses darker background. Chips with zero count are hidden.

---

### T5 — Bulk publish all ready

**File:** `app/(admin)/admin/ingest/ready-to-publish/ready-to-publish-client.tsx`

Add a single "Publish all ready (N)" button in the section header, to the right of the filter chips. `N` = count of `filtered` records where `readinessScore >= 80`.

```ts
async function bulkPublishReady() {
  if (bulkPublishing) return;
  const eligible = filtered.filter(r => r.readinessScore >= 80);
  if (!eligible.length) return;
  if (!window.confirm(
    `Publish ${eligible.length} record` +
    `${eligible.length === 1 ? '' : 's'}? This cannot be undone.`
  )) return;

  setBulkPublishing(true);
  setBulkProgress({ done: 0, total: eligible.length });

  const BATCH_SIZE = 3;
  let approved = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(r => publishRecord(r))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') approved += 1;
      else failed += 1;
    }
    setBulkProgress({ done: approved + failed, total: eligible.length });
  }

  setBulkPublishing(false);
  setBulkProgress(null);
  setBulkResults({ approved, failed });
}
```

Show dismissible result banner: green if all succeeded, amber if partial failure.

---

### T6 — Layout stats counter

**File:** `app/(admin)/admin/ingest/layout.tsx`

Add two new count queries to the existing `Promise.all`:

```ts
// Add to existing Promise.all:
db.venue.count({
  where: {
    status: { in: ['IN_REVIEW', 'ONBOARDING'] },
    deletedAt: null,
  },
}),
db.event.count({
  where: {
    status: 'DRAFT',
    isAiExtracted: true,
    deletedAt: null,
    venue: { isPublished: false },
  },
}),
```

Update the `readyToPublish` stat:

```ts
readyToPublish: pendingArtists + pendingArtworks
  + pendingVenuesInReview + pendingBlockedEvents,
```

> Note: `pendingArtists` and `pendingArtworks` track ingest candidates at `PENDING` status (awaiting moderation in the artist/artwork queues). The new venue and event counts track records that have cleared moderation but are not yet published. Both correctly contribute to "needs admin action to publish".

---

## 7. Codex prompt structure

Three sequential prompts, one commit each.

### Prompt A — Scoring + query (T1 + T2)
- Implement T1 and T2.
- Pass `records: UnifiedRecord[]` to client alongside existing props.
- Client type errors expected at this stage — noted but not fixed.
- **Commit:** `feat(publish): expand ready-to-publish query to all entity types with readiness scoring`

### Prompt B — Unified client (T3 + T4 + T5)
- Read updated `page.tsx` before starting.
- Implement T3, T4, T5.
- Preserve `publishArtist` and `publishArtwork`.
- Zero typecheck errors expected.
- **Commit:** `feat(publish): unified ready-to-publish list with all entity types, filters, and bulk publish`

### Prompt C — Layout counter (T6)
- Implement T6.
- **Commit:** `fix(ingest): expand ready-to-publish nav badge to include venues and blocked events`

---

## 8. Constraints and guardrails

- No Prisma schema changes. All fields used already exist.
- No new API routes. All four publish endpoints already exist.
- `lib/publish-readiness.ts`: additive only. No changes to existing exports.
- `lib/artist-completeness.ts` and `lib/artwork-completeness.ts`: read-only.
- Existing `publishArtist` and `publishArtwork` functions: preserved and reused.
- `BATCH_SIZE = 3` bulk publish pattern: preserved for all bulk operations.
- `pnpm typecheck` must pass after every task (zero errors after Prompts B and C).
- No changes to public-facing pages or API routes outside the admin panel.
- **The `isAiDiscovered` filter removal (artists query) and `ingestCandidate` filter removal (artworks query) in T2 are intentional** — they surface all origins.
