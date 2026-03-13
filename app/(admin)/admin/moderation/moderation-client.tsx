"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enqueueToast } from "@/lib/toast";

type Item = {
  submissionId: string;
  status: "IN_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT";
  entityType: "EVENT" | "VENUE" | "ARTIST" | "ARTWORK";
  entityId: string;
  title: string;
  slug: string | null;
  submittedAtISO: string;
  decisionReason: string | null;
  decidedAt: string | null;
  publisher: string;
};

export default function ModerationClient({
  initialItems,
  page,
  total,
  pageSize,
  tab,
  typeFilter,
  publisherFilter,
  submittedAfterFilter,
}: {
  initialItems: Item[];
  page: number;
  total: number;
  pageSize: number;
  tab: string;
  typeFilter: string;
  publisherFilter: string;
  submittedAfterFilter: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonDialogItem, setReasonDialogItem] = useState<Item | null>(null);
  const [reasonValue, setReasonValue] = useState("");

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const selectedItems = useMemo(() => initialItems.filter((item) => selectedIds.has(item.submissionId)), [initialItems, selectedIds]);

  function qs(next: Record<string, string>) {
    const sp = new URLSearchParams({ tab, type: typeFilter, publisher: publisherFilter, submittedAfter: submittedAfterFilter, page: String(page), ...next });
    ["publisher", "submittedAfter"].forEach((key) => {
      if (!sp.get(key)) sp.delete(key);
    });
    return `/admin/moderation?${sp.toString()}`;
  }

  async function moderate(item: Item, action: "approve_publish" | "request_changes", providedReason?: string) {
    setLoadingId(item.submissionId);
    try {
      const reason = providedReason ?? "";
      if (action === "request_changes" && reason.length < 3) return;
      const entityPath =
        item.entityType === "EVENT" ? "events"
        : item.entityType === "VENUE" ? "venues"
        : item.entityType === "ARTWORK" ? "artwork"
        : "artists";
      const res = await fetch(`/api/admin/${entityPath}/${item.entityId}/moderation-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "request_changes" ? { action, reason } : { action }),
      });
      if (!res.ok) {
        enqueueToast({ title: "Action failed", variant: "error" });
        return;
      }
      enqueueToast({ title: action === "approve_publish" ? "Approved & published" : "Changes requested", variant: "success" });
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  function handleRequestChanges(item: Item) {
    setReasonDialogItem(item);
    setReasonValue("");
    setReasonDialogOpen(true);
  }

  async function bulkApprovePublish() {
    // ARTWORK entries are intentionally included here; only ARTIST requires per-submission review from Submissions.
    const rows = selectedItems.filter((row) => row.entityType !== "ARTIST");
    const skippedArtists = selectedItems.filter((row) => row.entityType === "ARTIST").length;

    for (const row of rows) {
      await moderate(row, "approve_publish");
    }

    if (skippedArtists > 0) {
      enqueueToast({
        title: `${skippedArtists} artist submission${skippedArtists > 1 ? "s" : ""} skipped`,
        message: "Artist submissions must be approved individually from the Submissions page.",
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "needs-review" ? "default" : "outline"} asChild><Link href={qs({ tab: "needs-review", page: "1" })}>Needs review</Link></Button>
        <Button variant={tab === "published" ? "default" : "outline"} asChild><Link href={qs({ tab: "published", page: "1" })}>Published</Link></Button>
        <Button variant={tab === "rejected" ? "default" : "outline"} asChild><Link href={qs({ tab: "rejected", page: "1" })}>Rejected</Link></Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="rounded border px-2 py-1 text-sm" value={typeFilter} onChange={(e) => router.push(qs({ type: e.target.value, page: "1" }))}>
          <option value="all">All types</option>
          <option value="event">Event</option>
          <option value="venue">Venue</option>
          <option value="artist">Artist</option>
        </select>
        <input className="rounded border px-2 py-1 text-sm" placeholder="Publisher" defaultValue={publisherFilter} onBlur={(e) => router.push(qs({ publisher: e.target.value, page: "1" }))} />
        <input type="date" className="rounded border px-2 py-1 text-sm" defaultValue={submittedAfterFilter} onChange={(e) => router.push(qs({ submittedAfter: e.target.value, page: "1" }))} />
        <Button variant="outline" onClick={() => setSelectedIds(new Set(initialItems.map((item) => item.submissionId)))}>Select page</Button>
        <Button variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        <Button onClick={() => void bulkApprovePublish()} disabled={!selectedIds.size}>Bulk Approve & Publish</Button>
      </div>

      <div className="rounded border">
        {initialItems.map((item) => {
          const detailPath =
            item.entityType === "EVENT" ? "event"
            : item.entityType === "VENUE" ? "venue"
            : item.entityType === "ARTWORK" ? "artwork"
            : "artist";
          return (
          <div key={item.submissionId} className="flex items-center justify-between border-b p-3 last:border-b-0">
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selectedIds.has(item.submissionId)} onChange={() => setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(item.submissionId)) next.delete(item.submissionId); else next.add(item.submissionId);
                return next;
              })} />
              <div>
                <div className="flex items-center gap-2"><Badge>{item.entityType}</Badge><span className="font-medium">{item.title}</span></div>
                <div className="text-xs text-muted-foreground">{item.publisher} • {new Date(item.submittedAtISO).toLocaleString()}</div>
                {item.decidedAt ? (
                  <div className="text-xs text-muted-foreground">
                    Decided: {new Date(item.decidedAt).toLocaleString()}
                    {item.decisionReason ? ` — ${item.decisionReason}` : ""}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={loadingId === item.submissionId || item.entityType === "ARTIST"} onClick={() => void moderate(item, "approve_publish")}>Approve & Publish</Button>
              <Button size="sm" variant="outline" disabled={loadingId === item.submissionId} onClick={() => handleRequestChanges(item)}>Request changes</Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/admin/moderation/${detailPath}/${item.entityId}`}>
                  View details
                </Link>
              </Button>
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>Page {page} of {pageCount}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild disabled={page <= 1}><Link href={qs({ page: String(page - 1) })}>Previous</Link></Button>
          <Button variant="outline" size="sm" asChild disabled={page >= pageCount}><Link href={qs({ page: String(page + 1) })}>Next</Link></Button>
        </div>
      </div>

      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Provide a reason that will be sent to the publisher.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded border p-2 text-sm"
            rows={4}
            value={reasonValue}
            onChange={(e) => setReasonValue(e.target.value)}
            placeholder="Describe what needs to change (min. 3 characters)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reasonValue.trim().length < 3 || loadingId !== null}
              onClick={async () => {
                if (!reasonDialogItem) return;
                setReasonDialogOpen(false);
                await moderate(reasonDialogItem, "request_changes", reasonValue.trim());
              }}
            >
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
