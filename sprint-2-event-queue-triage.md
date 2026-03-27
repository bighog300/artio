# Sprint 2 — Event queue triage
**2 tasks · ~2.5 hours total · 1 commit each**

Reduces daily moderation time by adding bulk-reject for noise
and bulk-edit for common issues on medium-confidence events.

---

## Task 1 — Bulk reject LOW confidence events
**File:** `app/(admin)/admin/ingest/_components/ingest-event-queue-client.tsx`
**Effort:** ~45 min

### What to read first
```
cat app/(admin)/admin/ingest/_components/ingest-event-queue-client.tsx
cat app/api/admin/ingest/extracted-events/\[id\]/reject/route.ts
```

### What to build

The event queue already has `bulkApproveHigh()` using
`BATCH_SIZE=5` and `Promise.allSettled`. Add the mirror:
`bulkRejectLow()`.

**Step 1 — Add bulk reject state** alongside existing
bulk approve state:

```ts
const [bulkRejecting, setBulkRejecting] = useState(false);
const [bulkRejectProgress, setBulkRejectProgress] =
  useState<{ done: number; total: number } | null>(null);
const [bulkRejectResults, setBulkRejectResults] =
  useState<{ rejected: number; failed: number } | null>(null);
const [bulkRejectReason, setBulkRejectReason] =
  useState("noise");
```

**Step 2 — Read the reject API endpoint** signature.
Run: `cat app/api/admin/ingest/extracted-events/[id]/reject/route.ts`
Understand what body it expects (likely `{ reason: string }`).
Use that exact body shape in the bulk reject fetch calls.

**Step 3 — Add `bulkRejectLow` function:**

```ts
async function bulkRejectLow() {
  const lowCandidates = candidates.filter(
    c => c.confidenceBand === "LOW" && c.status === "PENDING"
  );
  if (!lowCandidates.length) return;
  if (!window.confirm(
    `Reject all ${lowCandidates.length} LOW confidence` +
    ` event${lowCandidates.length === 1 ? "" : "s"}` +
    ` as "${bulkRejectReason}"? This cannot be undone.`
  )) return;

  setBulkRejecting(true);
  setBulkRejectResults(null);
  setBulkRejectProgress({
    done: 0, total: lowCandidates.length
  });

  const BATCH_SIZE = 5;
  let rejected = 0;
  let failed = 0;

  for (let i = 0; i < lowCandidates.length;
    i += BATCH_SIZE) {
    const batch = lowCandidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(c =>
        fetch(
          `/api/admin/ingest/extracted-events/${c.id}/reject`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: bulkRejectReason }),
          }
        )
          .then(r => r.ok ? "ok" : "fail")
          .catch(() => "fail")
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "ok")
        rejected += 1;
      else failed += 1;
    }
    setBulkRejectProgress({
      done: rejected + failed,
      total: lowCandidates.length,
    });
  }

  setBulkRejecting(false);
  setBulkRejectProgress(null);
  setBulkRejectResults({ rejected, failed });

  // Optimistically remove rejected candidates
  setCandidates(prev =>
    prev.filter(
      c => !(c.confidenceBand === "LOW" &&
             c.status === "PENDING")
    )
  );
}
```

**Step 4 — Render the bulk reject controls** in the
header area, near the existing "Approve all HIGH" button.
Only show when there are LOW candidates:

```tsx
{(() => {
  const lowCount = candidates.filter(
    c => c.confidenceBand === "LOW" &&
         c.status === "PENDING"
  ).length;
  if (lowCount === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded border bg-background
          px-2 py-1 text-xs"
        value={bulkRejectReason}
        onChange={e => setBulkRejectReason(e.target.value)}
        disabled={bulkRejecting}
      >
        <option value="noise">Noise</option>
        <option value="not_an_event">Not an event</option>
        <option value="private_event">Private event</option>
        <option value="duplicate">Duplicate</option>
        <option value="past_event">Past event</option>
      </select>
      <button
        type="button"
        className="rounded border border-red-300
          bg-red-50 px-3 py-1 text-sm font-medium
          text-red-800 hover:bg-red-100
          disabled:opacity-50"
        disabled={bulkRejecting}
        onClick={() => void bulkRejectLow()}
      >
        {bulkRejecting
          ? `Rejecting… ${bulkRejectProgress?.done ?? 0}/` +
            `${bulkRejectProgress?.total ?? lowCount}`
          : `Reject all LOW (${lowCount})`}
      </button>
    </div>
  );
})()}
```

**Step 5 — Add result banner** using the same pattern as
the bulk approve result banner already in the component.

### Constraints
- Read the reject API endpoint before writing the fetch call
- Per-candidate errors are non-blocking
- The reason dropdown must match valid values the API accepts
- pnpm typecheck after

**Commit:** `feat(ingest): add bulk reject LOW with reason selector to event queue`

---

## Task 2 — Bulk edit shared fields for MEDIUM confidence events
**File:** `app/(admin)/admin/ingest/_components/ingest-event-queue-client.tsx`
**Effort:** ~60 min

### What to read first
```
cat app/(admin)/admin/ingest/_components/ingest-event-queue-client.tsx
cat app/api/admin/ingest/extracted-events/\[id\]/route.ts  # or patch route
```
Find the PATCH/update endpoint for extracted events.
Understand what fields it accepts.

### What to build

When multiple MEDIUM confidence events share a common
fixable issue (no timezone, wrong venue, missing date),
an admin currently must fix each one individually.
Add a checkbox-select + bulk-edit modal for shared fields.

**Step 1 — Add selection state:**

```ts
const [selectedIds, setSelectedIds] =
  useState<Set<string>>(new Set());

function toggleSelected(id: string) {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function selectAllVisible() {
  const visibleMed = filteredCandidates.filter(
    c => c.confidenceBand === "MEDIUM" &&
         c.status === "PENDING"
  );
  setSelectedIds(new Set(visibleMed.map(c => c.id)));
}

function clearSelection() {
  setSelectedIds(new Set());
}
```

**Step 2 — Add a checkbox column** to MEDIUM confidence
candidate rows (only MEDIUM, not HIGH or LOW):

```tsx
{candidate.confidenceBand === "MEDIUM" ? (
  <td className="px-2 py-2">
    <input
      type="checkbox"
      checked={selectedIds.has(candidate.id)}
      onChange={() => toggleSelected(candidate.id)}
    />
  </td>
) : <td />}
```

**Step 3 — Add a selection toolbar** that appears when
`selectedIds.size > 0`. Show it between the filter bar
and the table:

```tsx
{selectedIds.size > 0 ? (
  <div className="flex items-center gap-3 rounded
    border border-blue-200 bg-blue-50 px-3 py-2">
    <span className="text-sm text-blue-800">
      {selectedIds.size} selected
    </span>
    <button
      type="button"
      className="text-sm text-blue-800 underline"
      onClick={() => setBulkEditOpen(true)}
    >
      Edit shared fields
    </button>
    <button
      type="button"
      className="ml-auto text-xs text-blue-600"
      onClick={clearSelection}
    >
      Clear selection
    </button>
  </div>
) : null}
```

**Step 4 — Add bulk edit modal state:**

```ts
const [bulkEditOpen, setBulkEditOpen] = useState(false);
const [bulkEditDraft, setBulkEditDraft] = useState<{
  timezone: string;
  rejectionReason: string;
}>({ timezone: "", rejectionReason: "" });
const [bulkEditing, setBulkEditing] = useState(false);
const [bulkEditResult, setBulkEditResult] =
  useState<{ updated: number; failed: number } | null>(null);
```

**Step 5 — Add bulk edit modal** (render inline using
`position: fixed` is not allowed — render as a conditional
block above the table instead, clearly separated):

```tsx
{bulkEditOpen ? (
  <div className="rounded-lg border bg-background p-4
    space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">
        Edit {selectedIds.size} selected event
        {selectedIds.size !== 1 ? "s" : ""}
      </h3>
      <button
        type="button"
        onClick={() => setBulkEditOpen(false)}
        className="text-muted-foreground text-sm"
      >
        ×
      </button>
    </div>
    <p className="text-xs text-muted-foreground">
      Only non-empty fields will be applied.
      Leave blank to skip that field.
    </p>

    <label className="block space-y-1 text-sm">
      <span>Timezone (IANA)</span>
      <input
        className="w-full rounded border
          bg-background px-3 py-1.5 text-sm"
        placeholder="e.g. Europe/London"
        value={bulkEditDraft.timezone}
        onChange={e => setBulkEditDraft(prev => ({
          ...prev, timezone: e.target.value
        }))}
      />
    </label>

    <div className="flex gap-2 pt-1">
      <button
        type="button"
        className="rounded bg-foreground px-3 py-1.5
          text-sm text-background disabled:opacity-50"
        disabled={bulkEditing ||
          (!bulkEditDraft.timezone)}
        onClick={() => void applyBulkEdit()}
      >
        {bulkEditing ? "Applying…" : "Apply to selected"}
      </button>
      <button
        type="button"
        className="rounded border px-3 py-1.5 text-sm"
        onClick={() => setBulkEditOpen(false)}
      >
        Cancel
      </button>
    </div>

    {bulkEditResult ? (
      <p className="text-xs text-emerald-700">
        Updated {bulkEditResult.updated} events
        {bulkEditResult.failed > 0
          ? `, ${bulkEditResult.failed} failed` : ""}
      </p>
    ) : null}
  </div>
) : null}
```

**Step 6 — Add `applyBulkEdit` function:**

First, read the PATCH endpoint to know the exact field names
it accepts. Then:

```ts
async function applyBulkEdit() {
  const patch: Record<string, string> = {};
  if (bulkEditDraft.timezone.trim())
    patch.timezone = bulkEditDraft.timezone.trim();

  if (!Object.keys(patch).length) return;

  setBulkEditing(true);
  setBulkEditResult(null);
  let updated = 0;
  let failed = 0;

  const BATCH_SIZE = 5;
  const ids = [...selectedIds];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(id =>
        fetch(
          `/api/admin/ingest/extracted-events/${id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          }
        )
          .then(r => r.ok ? "ok" : "fail")
          .catch(() => "fail")
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "ok")
        updated += 1;
      else failed += 1;
    }
  }

  setBulkEditing(false);
  setBulkEditResult({ updated, failed });

  // Update local state for patched candidates
  if (bulkEditDraft.timezone) {
    setCandidates(prev => prev.map(c =>
      selectedIds.has(c.id)
        ? { ...c, timezone: bulkEditDraft.timezone }
        : c
    ));
  }

  setSelectedIds(new Set());
  setBulkEditOpen(false);
  setBulkEditDraft({ timezone: "", rejectionReason: "" });
}
```

**Step 7 — Add "Select all MEDIUM" button** above the
table when filter is set to MEDIUM or ALL:

```tsx
{candidates.filter(
  c => c.confidenceBand === "MEDIUM" &&
       c.status === "PENDING"
).length > 0 ? (
  <button
    type="button"
    className="text-xs text-muted-foreground underline"
    onClick={selectAllVisible}
  >
    Select all MEDIUM ({candidates.filter(
      c => c.confidenceBand === "MEDIUM" &&
           c.status === "PENDING"
    ).length})
  </button>
) : null}
```

### Constraints
- Read the PATCH endpoint before writing `applyBulkEdit`
- Only MEDIUM rows get checkboxes — HIGH and LOW do not
- Non-empty fields only are applied
- No `position: fixed` — inline conditional block only
- pnpm typecheck after

**Commit:** `feat(ingest): add checkbox select and bulk edit shared fields for MEDIUM confidence events`
