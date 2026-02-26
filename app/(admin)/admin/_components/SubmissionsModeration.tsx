"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SubmissionItem = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "DRAFT";
  type: "EVENT" | "VENUE" | "ARTIST";
  note: string | null;
  decisionReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  submitter: { email: string; name: string | null };
  venue: { id: string; name: string } | null;
  targetEvent: { id: string; title: string; slug: string } | null;
  targetVenue: { id: string; name: string; slug: string } | null;
  targetArtist: { id: string; name: string; slug: string } | null;
};

export function getSubmissionModerationErrorMessage(status: number) {
  if (status === 401 || status === 403) return "Not authorized.";
  if (status === 400) return "Invalid request.";
  if (status === 409) return "Conflict: this submission was already handled.";
  return "Something went wrong.";
}

export type BulkResult = { status: "ok" | "error"; message?: string };

type SubmissionAction = "approve" | "reject";

export function buildModerationRequest(item: SubmissionItem, action: SubmissionAction, reason: string | null) {
  const trimmedReason = reason?.trim() || "";
  const venueFlow = item.type === "VENUE" || item.type === "ARTIST";
  const endpoint = venueFlow
    ? action === "approve"
      ? `/api/admin/submissions/${item.id}/approve`
      : `/api/admin/submissions/${item.id}/request-changes`
    : `/api/admin/submissions/${item.id}/decision`;

  if (!venueFlow && action === "reject" && !trimmedReason) {
    return null;
  }

  const payload = venueFlow
    ? action === "approve"
      ? {}
      : { message: trimmedReason || "Please address the requested profile changes and resubmit." }
    : action === "approve"
      ? { decision: "APPROVED" as const }
      : { decision: "REJECTED" as const, rejectionReason: trimmedReason };

  return { endpoint, payload };
}

async function readErrorMessage(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; message?: string; details?: string; reason?: string };
    return body.message || body.details || body.reason || body.error;
  } catch {
    return undefined;
  }
}

export async function submitModerationAction(
  item: SubmissionItem,
  action: SubmissionAction,
  reason: string | null,
): Promise<BulkResult> {
  const request = buildModerationRequest(item, action, reason);
  if (!request) {
    return { status: "error", message: "Please provide a rejection reason." };
  }

  const { endpoint, payload } = request;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const apiMessage = await readErrorMessage(res);
      return {
        status: "error",
        message: apiMessage || getSubmissionModerationErrorMessage(res.status),
      };
    }

    return { status: "ok" };
  } catch {
    return { status: "error", message: "Request failed" };
  }
}

export async function runBulkWithConcurrency(ids: string[], worker: (id: string) => Promise<void>, concurrency = 3) {
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: concurrency }).map(async () => {
      while (queue.length) {
        const id = queue.shift();
        if (!id) return;
        await worker(id);
      }
    }),
  );
}

export default function SubmissionsModeration({ items }: { items: SubmissionItem[] }) {
  const router = useRouter();
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkAction, setBulkAction] = useState<SubmissionAction | null>(null);
  const [bulkResults, setBulkResults] = useState<Record<string, BulkResult>>({});
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");

  const actionableItems = useMemo(() => items.filter((item) => item.status === "SUBMITTED"), [items]);
  const actionableById = useMemo(() => new Map(actionableItems.map((item) => [item.id, item])), [actionableItems]);
  const selectableIds = actionableItems.map((item) => item.id);

  function toggleOne(id: string) {
    if (isBulkRunning) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage(idsOnPage: string[]) {
    if (isBulkRunning) return;
    setSelectedIds(new Set(idsOnPage));
  }

  function clearSelection() {
    if (isBulkRunning) return;
    setSelectedIds(new Set());
  }

  async function decide(item: SubmissionItem, action: SubmissionAction) {
    setLoadingId(item.id);
    setPendingAction(action);

    try {
      const result = await submitModerationAction(item, action, reasonById[item.id] || null);
      if (result.status === "error") {
        enqueueToast({ title: "Moderation update failed", message: result.message || "Request failed", variant: "error" });
        return;
      }

      enqueueToast({
        title: action === "approve" ? "Approved" : item.type === "EVENT" ? "Rejected" : "Changes requested",
        message: action === "approve" ? "Submission approved successfully." : "Moderation decision saved.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setLoadingId(null);
      setPendingAction(null);
    }
  }

  async function runBulk(action: SubmissionAction, sharedReason?: string | null) {
    const ids = [...selectedIds].filter((id) => actionableById.has(id));
    if (!ids.length) return;

    setIsBulkRunning(true);
    setBulkAction(action);

    let succeeded = 0;
    let failed = 0;

    try {
      await runBulkWithConcurrency(ids, async (id) => {
        const item = actionableById.get(id);
        if (!item) return;
        const rowReason = action === "reject" ? sharedReason || reasonById[id] || null : reasonById[id] || null;
        const result = await submitModerationAction(item, action, rowReason);
        if (result.status === "ok") succeeded += 1;
        else failed += 1;
        setBulkResults((prev) => ({ ...prev, [id]: result }));
      });

      enqueueToast({
        title: action === "approve" ? "Bulk approve completed" : "Bulk reject completed",
        message: `${succeeded} succeeded, ${failed} failed`,
        variant: failed ? "error" : "success",
      });
      router.refresh();
    } finally {
      setSelectedIds(new Set());
      setIsBulkRunning(false);
      setBulkAction(null);
      setBulkRejectReason("");
    }
  }

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-10 rounded border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" disabled={isBulkRunning} onClick={() => runBulk("approve")}>
              {isBulkRunning && bulkAction === "approve" ? "Approving…" : "Approve selected"}
            </Button>
            <Button size="sm" variant="outline" disabled={isBulkRunning} onClick={() => setBulkRejectDialogOpen(true)}>
              {isBulkRunning && bulkAction === "reject" ? "Rejecting…" : "Reject selected"}
            </Button>
            <Button size="sm" variant="ghost" disabled={isBulkRunning} onClick={clearSelection}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={bulkRejectDialogOpen} onOpenChange={setBulkRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject selected submissions?</DialogTitle>
            <DialogDescription>
              Optionally add a shared reason that will apply to all selected rows.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="min-h-24 w-full rounded border p-2 text-sm"
            placeholder="Reason (optional)"
            value={bulkRejectReason}
            disabled={isBulkRunning}
            onChange={(e) => setBulkRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBulkRunning} onClick={() => setBulkRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isBulkRunning}
              onClick={async () => {
                setBulkRejectDialogOpen(false);
                await runBulk("reject", bulkRejectReason || null);
              }}
            >
              Reject selected
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ul className="space-y-3">
        <li className="flex items-center gap-2 rounded border p-3 text-sm">
          <input
            type="checkbox"
            aria-label="Select all submissions on this page"
            checked={allSelected}
            disabled={isBulkRunning || selectableIds.length === 0}
            onChange={(e) => (e.target.checked ? selectAllOnPage(selectableIds) : clearSelection())}
          />
          Select all on this page
        </li>
        {items.map((item) => {
          const isLoading = loadingId === item.id;
          const isSelected = selectedIds.has(item.id);
          const rowResult = bulkResults[item.id];
          const disableRowActions = isBulkRunning || isLoading;
          return (
            <li key={item.id} className="border rounded p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isBulkRunning || item.status !== "SUBMITTED"}
                  onChange={() => toggleOne(item.id)}
                />
                Select row
              </label>
              <div className="font-medium">{item.type} — {item.targetEvent?.title ?? item.targetVenue?.name ?? item.targetArtist?.name ?? "Unknown target"}</div>
              <div className="text-sm">Status: {item.status}</div>
              <div className="text-sm">Submitter: {item.submitter.email}</div>
              {item.venue ? <div className="text-sm">Venue: {item.venue.name}</div> : null}
              {item.submittedAt ? <div className="text-sm">Submitted: {new Date(item.submittedAt).toLocaleString()}</div> : null}
              {item.decidedAt ? <div className="text-sm">Decided: {new Date(item.decidedAt).toLocaleString()}</div> : null}
              {item.note ? <div className="text-sm">Note: {item.note}</div> : null}
              {item.status === "REJECTED" && item.decisionReason ? <div className="text-sm text-red-700">Reason: {item.decisionReason}</div> : null}

              <div className="text-sm space-x-3">
                {item.targetEvent ? <Link className="underline" href={`/events/${item.targetEvent.slug}`}>View target</Link> : null}
                {item.targetVenue ? <Link className="underline" href={`/venues/${item.targetVenue.slug}`}>View target</Link> : null}
                {item.targetArtist ? <Link className="underline" href={`/artists/${item.targetArtist.slug}`}>View target</Link> : null}
                {item.targetEvent ? <Link className="underline" href={`/admin/events/${item.targetEvent.id}`}>Edit target</Link> : null}
                {item.targetVenue ? <Link className="underline" href={`/admin/venues/${item.targetVenue.id}`}>Edit target</Link> : null}
                {item.targetArtist ? <Link className="underline" href={`/admin/artists/${item.targetArtist.id}`}>Edit target</Link> : null}
              </div>

              {rowResult ? (
                <div className={`text-sm ${rowResult.status === "ok" ? "text-green-700" : "text-red-700"}`}>
                  {rowResult.status === "ok" ? "✅ Updated" : `❌ Failed: ${rowResult.message || "Request failed"}`}
                </div>
              ) : null}

              {item.status === "SUBMITTED" ? (
                <>
                  <input
                    className="border rounded p-1 w-full"
                    placeholder={item.type === "EVENT" ? "Rejection reason" : "Requested changes"}
                    value={reasonById[item.id] || ""}
                    disabled={disableRowActions}
                    onChange={(e) => setReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <div className="space-x-2">
                    <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={disableRowActions} onClick={() => decide(item, "approve")}>{isLoading && pendingAction === "approve" ? "Approving…" : "Approve"}</button>
                    <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={disableRowActions} onClick={() => decide(item, "reject")}>{isLoading && pendingAction === "reject" ? item.type === "EVENT" ? "Rejecting…" : "Requesting…" : item.type === "EVENT" ? "Reject" : "Request changes"}</button>
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
