# Sprint 3 — Venue generation UX + feedback loop
**3 tasks · ~4 hours total · 1 commit each**

---

## Task 1 — Venue Generation: collapse run items to summary rows
**File:** `app/(admin)/admin/ingest/venue-generation/venue-generation-client.tsx`
**Effort:** ~60 min

### What to read first
```
cat app/(admin)/admin/ingest/venue-generation/venue-generation-client.tsx
```
Note every field currently rendered per run item. The goal
is to show only 4 fields in the collapsed row and move the
rest behind an expand.

### What to build

Each run item currently renders all 15+ fields inline.
Replace with a collapsed summary + expandable detail row.

**Step 1 — Add per-item expand state:**

```ts
const [expandedItems, setExpandedItems] =
  useState<Set<string>>(new Set());

function toggleItem(id: string) {
  setExpandedItems(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
```

**Step 2 — Define the collapsed summary row**. For each
run item, the summary shows only:

1. **Name + city** — linked to `/admin/venues/[venueId]`
   if the venue exists
2. **Publishable status** — green "Ready" or red "Blocked"
3. **Primary blocker** — first item from `item.blockers`
   if any, otherwise blank
4. **Action buttons** — same Publish / Onboard buttons
   as today

The collapsed row replaces the current `<li>` content.

```tsx
{run.items.map(item => (
  <div key={item.id}
    className="border-b last:border-b-0">
    {/* Collapsed summary row */}
    <div
      className="flex items-center gap-3 px-3 py-2
        cursor-pointer hover:bg-muted/30"
      onClick={() => toggleItem(item.id)}
    >
      <span className="text-sm flex-1 min-w-0">
        {item.venueId ? (
          <a
            href={`/admin/venues/${item.venueId}`}
            className="underline"
            onClick={e => e.stopPropagation()}
          >
            {item.name}
          </a>
        ) : item.name}
        {item.city ? (
          <span className="text-muted-foreground">
            {" · "}{item.city}
          </span>
        ) : null}
      </span>

      {item.publishable ? (
        <span className="text-xs text-emerald-700
          font-medium">
          Ready
        </span>
      ) : (
        <span className="text-xs text-red-700">
          {item.blockers[0] ?? "Blocked"}
        </span>
      )}

      {/* Action buttons — same logic as today */}
      {/* ... preserve existing publish/onboard buttons */}

      <span className="text-xs text-muted-foreground
        select-none">
        {expandedItems.has(item.id) ? "▲" : "▼"}
      </span>
    </div>

    {/* Expanded detail row */}
    {expandedItems.has(item.id) ? (
      <div className="px-3 pb-3 pt-1 text-xs
        text-muted-foreground space-y-1
        bg-muted/20">
        <p>
          Geocode: {item.geocodeStatus}
          {item.geocodeErrorCode
            ? ` (${item.geocodeErrorCode})` : ""}
          {item.timezoneWarning
            ? ` · timezone: ${item.timezoneWarning}` : ""}
        </p>
        <p>
          Homepage images: {item.homepageImageStatus}
          {item.homepageImageCandidateCount > 0
            ? ` (${item.homepageImageCandidateCount} candidates)` : ""}
        </p>
        <p>
          Events page: {eventsPageLabel(item.eventsPageStatus)}
        </p>
        {item.socialWarning ? (
          <p>Social: {item.socialWarning}</p>
        ) : null}
        {item.instagramUrl ? (
          <p>
            Instagram:{" "}
            <a href={item.instagramUrl} target="_blank"
              rel="noopener noreferrer"
              className="underline">
              {item.instagramUrl}
            </a>
          </p>
        ) : null}
        {item.contactEmail ? (
          <p>Contact: {item.contactEmail}</p>
        ) : null}
        {item.reason ? (
          <p>Status reason: {item.reason}</p>
        ) : null}
        {item.blockers?.length > 0 ? (
          <p className="text-red-700">
            All blockers: {item.blockers.join(", ")}
          </p>
        ) : null}
      </div>
    ) : null}
  </div>
))}
```

**Step 3 — Add "Expand all / Collapse all"** button
above the items list for each run:

```tsx
<div className="flex items-center justify-between
  px-3 py-1.5 border-b bg-muted/10">
  <span className="text-xs text-muted-foreground">
    {run.items.length} venues
  </span>
  <button
    type="button"
    className="text-xs text-muted-foreground underline"
    onClick={() => {
      const allExpanded = run.items.every(
        item => expandedItems.has(item.id)
      );
      if (allExpanded) {
        setExpandedItems(prev => {
          const next = new Set(prev);
          run.items.forEach(item => next.delete(item.id));
          return next;
        });
      } else {
        setExpandedItems(prev => {
          const next = new Set(prev);
          run.items.forEach(item => next.add(item.id));
          return next;
        });
      }
    }}
  >
    {run.items.every(item => expandedItems.has(item.id))
      ? "Collapse all" : "Expand all"}
  </button>
</div>
```

**Step 4 — Preserve all existing action buttons** exactly.
The Publish, Onboard, and error handling buttons must
remain in the collapsed summary row — do not move them
to the expanded detail.

### Constraints
- No API route changes
- No schema changes
- All existing action buttons must remain in the
  collapsed summary row, not in the expanded detail
- pnpm typecheck after

**Commit:** `feat(venue-gen): collapse run items to summary rows with expand for detail`

---

## Task 2 — Engagement → ingest frequency adjustment
**File to create:** `lib/cron-engagement-ingest-frequency.ts`
**File to create:** `app/api/cron/venues/update-ingest-frequency/route.ts`
**Effort:** ~75 min

### What to read first
```
grep -n "ingestFrequency\|VenueIngestFrequency" \
  prisma/schema.prisma | head -10
grep -n "ingestFrequency\|DAILY\|WEEKLY\|MONTHLY" \
  lib/cron-ingest-venues.ts | head -10
cat app/api/cron/ingest/route.ts   # cron auth pattern
grep -A5 "model EngagementEvent" prisma/schema.prisma
```

### What to build

A weekly cron that reads per-venue engagement rates over
the last 30 days and adjusts `ingestFrequency` accordingly.

**`lib/cron-engagement-ingest-frequency.ts`**

```ts
export async function runCronEngagementIngestFrequency(
  cronSecret: string | null,
  { db }: { db: PrismaClient },
): Promise<Response> {
  // 1. Validate cron secret
  // 2. Acquire lock "cron:engagement:ingest-frequency"
  // 3. Compute engagement rates
  // 4. Update ingestFrequency
  // 5. Release lock
  // 6. Return summary
}
```

**Step 1 — Validate + lock** using the same patterns as
other cron files.

**Step 2 — Fetch venues with their engagement counts:**

```ts
const since30d = new Date(
  Date.now() - 30 * 24 * 60 * 60 * 1000
);

// Get all published venues
const venues = await db.venue.findMany({
  where: { status: "PUBLISHED", deletedAt: null },
  select: {
    id: true,
    name: true,
    ingestFrequency: true,
    _count: {
      select: {
        events: {
          where: {
            isPublished: true,
            startAt: { gte: since30d },
          },
        },
      },
    },
  },
});
```

**Step 3 — Get engagement counts per venue** by joining
through events. EngagementEvent has targetType and targetId.
Query engagement events where targetType = "EVENT" and
the targetId is one of the venue's published event IDs:

```ts
// Get event IDs per venue
const venueEventIds = await db.event.groupBy({
  by: ["venueId"],
  where: {
    venueId: { in: venues.map(v => v.id) },
    isPublished: true,
    startAt: { gte: since30d },
    deletedAt: null,
  },
  _count: { id: true },
});

// Get engagement counts per event
const engagementCounts = await db.engagementEvent.groupBy({
  by: ["targetId"],
  where: {
    targetType: "EVENT",
    createdAt: { gte: since30d },
  },
  _count: { id: true },
});
```

**Step 4 — Classify venues by activity level:**

```ts
// Rules (adjust thresholds as needed):
// HIGH activity  (>= 5 published events + >= 20 engagements in 30d)
//   → DAILY
// MEDIUM activity (>= 2 published events + >= 5 engagements)
//   → WEEKLY
// LOW activity   (< 2 published events OR < 5 engagements)
//   → MONTHLY
// No events in 90 days
//   → MANUAL (flag only, do not auto-set to MANUAL
//     unless currently DAILY or WEEKLY)

function classifyFrequency(
  publishedEventCount: number,
  engagementCount: number,
  currentFrequency: string,
): "DAILY" | "WEEKLY" | "MONTHLY" | null {
  if (publishedEventCount >= 5 && engagementCount >= 20)
    return "DAILY";
  if (publishedEventCount >= 2 && engagementCount >= 5)
    return "WEEKLY";
  if (publishedEventCount > 0)
    return "MONTHLY";
  // No recent events — do not change if already MANUAL
  if (currentFrequency === "MANUAL") return null;
  return "MONTHLY";
}
```

**Step 5 — Apply updates** only when the new frequency
differs from the current. Log each change:

```ts
for (const venue of venues) {
  const newFreq = classifyFrequency(...);
  if (!newFreq || newFreq === venue.ingestFrequency)
    continue;
  await db.venue.update({
    where: { id: venue.id },
    data: { ingestFrequency: newFreq },
  }).catch(err =>
    console.warn("ingest_freq_update_failed", {
      venueId: venue.id, err
    })
  );
  console.log("ingest_freq_updated", {
    venueId: venue.id,
    venueName: venue.name,
    from: venue.ingestFrequency,
    to: newFreq,
  });
  updatedCount += 1;
}
```

**Step 6 — Return summary:**
```ts
return Response.json({
  ok: true,
  venuesProcessed: venues.length,
  frequenciesUpdated: updatedCount,
});
```

**`app/api/cron/venues/update-ingest-frequency/route.ts`**

Same GET + POST pattern as other cron routes.

### Constraints
- No schema changes
- Venues set to MANUAL are not overridden
- Per-venue errors are non-blocking
- Thresholds (5 events, 20 engagements) are constants
  at the top of the file so they can be tuned easily
- pnpm typecheck after

**Commit:** `feat(cron): add weekly engagement-to-ingest-frequency adjustment cron`

---

## Task 3 — Published record confidence boost
**File:** `lib/cron-ingest-venues.ts` (small addition)
**File to create:** `lib/ingest/venue-confidence-signal.ts`
**Effort:** ~45 min

### What to read first
```
cat lib/cron-ingest-venues.ts | grep -A10 "autoApproveEventCandidate"
grep -n "confidenceScore\|confidenceBand\|confidence" \
  lib/ingest/confidence.ts | head -20
grep -n "model IngestRun\|confidenceHighMin\|confidenceMediumMin" \
  prisma/schema.prisma | head -5
```

### What to build

When a venue has recently had events published and those
events got engagement, future candidates from that venue
should start with a higher baseline confidence. Implement
this as a per-venue confidence bias stored on the Venue
record, read by the confidence scoring function.

**Step 1 — Check if Venue has a confidence bias field:**

```
grep -n "confidenceBias\|ingestConfidenceBias\|scoreBias" \
  prisma/schema.prisma
```

If it does not exist, do NOT add a schema field. Instead,
use a simpler approach: store the bias as a JSON metadata
field if one exists, or compute it on-the-fly during the
confidence calculation.

**Simpler approach — no schema change:**

Instead of persisting a bias, adjust the confidence
scoring in `lib/ingest/confidence.ts` to read the
venue's recent approval rate as a multiplier.

Read `lib/ingest/confidence.ts` in full. Find where the
final `confidenceScore` is computed for an event candidate.

Add a venue track record bonus:

```ts
// In the confidence scoring function, after computing
// the base score, add a venue track record bonus:

async function getVenueApprovalBonus(
  venueId: string,
  db: PrismaClient,
): Promise<number> {
  // Look at the last 20 candidates from this venue
  const recent = await db.ingestExtractedEvent.findMany({
    where: {
      venueId,
      status: { in: ["APPROVED", "REJECTED"] },
    },
    select: { status: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (recent.length < 5) return 0; // Not enough data

  const approvedCount = recent.filter(
    r => r.status === "APPROVED"
  ).length;
  const approvalRate = approvedCount / recent.length;

  // Bonus tiers:
  // >= 80% approval rate: +8 points
  // >= 60% approval rate: +4 points
  // < 40% approval rate: -5 points (noise venue)
  // otherwise: 0
  if (approvalRate >= 0.8) return 8;
  if (approvalRate >= 0.6) return 4;
  if (approvalRate < 0.4) return -5;
  return 0;
}
```

**Step 2 — Create `lib/ingest/venue-confidence-signal.ts`**
as a standalone exportable utility:

```ts
import type { PrismaClient } from "@prisma/client";

export async function getVenueTrackRecordBonus(
  venueId: string,
  db: PrismaClient,
): Promise<number> {
  const recent = await db.ingestExtractedEvent.findMany({
    where: {
      venueId,
      status: { in: ["APPROVED", "REJECTED"] },
    },
    select: { status: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (recent.length < 5) return 0;

  const approved = recent.filter(
    r => r.status === "APPROVED"
  ).length;
  const rate = approved / recent.length;

  if (rate >= 0.8) return 8;
  if (rate >= 0.6) return 4;
  if (rate < 0.4) return -5;
  return 0;
}
```

**Step 3 — Integrate into the extraction pipeline.**
Read `lib/ingest/extraction-pipeline.ts` to find where
`confidenceScore` is computed for candidates. Import
`getVenueTrackRecordBonus` and apply it:

```ts
import { getVenueTrackRecordBonus } from
  "@/lib/ingest/venue-confidence-signal";

// After computing the base confidence score:
const trackRecordBonus = await getVenueTrackRecordBonus(
  venueId, db
);
const adjustedScore = Math.max(0, Math.min(100,
  baseConfidenceScore + trackRecordBonus
));
```

If the extraction pipeline calls a separate confidence
module, apply the bonus after that module returns —
do not modify the confidence module itself. Read the
pipeline carefully before deciding where to inject.

**Step 4 — Add a `confidenceReasons` entry** for the
bonus so admins can see why a candidate scored higher:

```ts
if (trackRecordBonus > 0) {
  reasons.push(`venue track record +${trackRecordBonus}`);
} else if (trackRecordBonus < 0) {
  reasons.push(`venue noise signal ${trackRecordBonus}`);
}
```

### Constraints
- No schema changes
- The bonus is capped so total score stays within 0–100
- If the extraction pipeline does not call a scorable
  function, note this and skip Task 3 — do not force
  the integration where it does not fit cleanly
- pnpm typecheck after

**Commit:** `feat(ingest): add venue track record bonus to confidence scoring`
