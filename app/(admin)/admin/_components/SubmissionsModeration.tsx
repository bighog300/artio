"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { enqueueToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getEventTypeLabel } from "@/lib/event-types";

type SubmissionItem = {
  id: string;
  status: "IN_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT";
  type: "EVENT" | "VENUE" | "ARTIST";
  note: string | null;
  decisionReason: string | null;
  submittedAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  submitter: { email: string; name: string | null };
  venue: { id: string; name: string } | null;
  targetEvent: { id: string; title: string; slug: string; description?: string | null; startAt?: string; eventType?: string | null; venue?: { name: string } | null; images?: Array<{ id: string; url: string; alt: string | null }> } | null;
  targetVenue: { id: string; name: string; slug: string; description?: string | null; city?: string | null; country?: string | null; claimStatus?: string; aiGenerated?: boolean; images?: Array<{ id: string; url: string; alt: string | null }> } | null;
  targetArtist: { id: string; name: string; slug: string } | null;
};

export function getSubmissionModerationErrorMessage(status: number) {
  if (status === 401 || status === 403) return "Not authorized.";
  if (status === 400) return "Invalid request.";
  if (status === 409) return "Conflict: this submission was already handled.";
  return "Something went wrong.";
}

export type BulkResult = { status: "ok" | "error"; message?: string };
type PublishResult = { status: "ok" } | { status: "blocked"; blockers: string[] } | { status: "error"; message: string };

type SubmissionAction = "approve" | "reject" | "publish";

export function buildModerationRequest(item: SubmissionItem, action: SubmissionAction, reason: string | null) {
  if (action === "publish") return null;
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

export function normalizeModerationErrorMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  const withMessage = value as { message?: unknown; code?: unknown };
  if (typeof withMessage.message === "string") return withMessage.message;
  if (typeof withMessage.code === "string") return withMessage.code;

  return undefined;
}

async function readErrorMessage(res: Response) {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown; details?: unknown; reason?: unknown };
    return (
      normalizeModerationErrorMessage(body.message) ||
      normalizeModerationErrorMessage(body.details) ||
      normalizeModerationErrorMessage(body.reason) ||
      normalizeModerationErrorMessage(body.error)
    );
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

function getPublishTarget(item: SubmissionItem): { entityType: "event" | "venue"; entityId: string; title: string } | null {
  if (item.type === "EVENT" && item.targetEvent) return { entityType: "event", entityId: item.targetEvent.id, title: item.targetEvent.title };
  if (item.type === "VENUE" && item.targetVenue) return { entityType: "venue", entityId: item.targetVenue.id, title: item.targetVenue.name };
  return null;
}

async function submitPublishAction(item: SubmissionItem): Promise<PublishResult> {
  const target = getPublishTarget(item);
  if (!target) return { status: "error", message: "This row is not publishable." };

  try {
    const res = await fetch(`/api/admin/${target.entityType}s/${target.entityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED", isPublished: true }),
    });

    if (res.ok) return { status: "ok" };

    const body = (await res.json().catch(() => null)) as { details?: { blockers?: unknown }; error?: { details?: { blockers?: unknown } } } | null;
    const rawBlockers = body?.details?.blockers ?? body?.error?.details?.blockers;
    const blockers = Array.isArray(rawBlockers) ? rawBlockers.filter((value): value is string => typeof value === "string") : [];
    if (res.status === 409 && blockers.length > 0) return { status: "blocked", blockers };

    return { status: "error", message: getSubmissionModerationErrorMessage(res.status) };
  } catch {
    return { status: "error", message: "Request failed" };
  }
}

export default function SubmissionsModeration({ items }: { items: SubmissionItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkAction, setBulkAction] = useState<SubmissionAction | null>(null);
  const [bulkResults, setBulkResults] = useState<Record<string, BulkResult>>({});
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [bulkPublishSummaryOpen, setBulkPublishSummaryOpen] = useState(false);
  const [publishSummary, setPublishSummary] = useState<{ succeeded: number; blocked: Array<{ id: string; title: string; blockers: string[] }> }>({ succeeded: 0, blocked: [] });
  const [approvedVenueContext, setApprovedVenueContext] = useState<{ id: string; slug: string } | null>(null);

  const actionableItems = useMemo(() => items.filter((item) => item.status === "IN_REVIEW"), [items]);
  const actionableById = useMemo(() => new Map(actionableItems.map((item) => [item.id, item])), [actionableItems]);
  const selectableIds = useMemo(() => items.filter((item) => item.status === "IN_REVIEW" || (item.status === "APPROVED" && Boolean(getPublishTarget(item)))).map((item) => item.id), [items]);
  const selectedPublishableCount = useMemo(() => {
    return [...selectedIds].filter((id) => {
      const item = items.find((entry) => entry.id === id);
      return item?.status === "APPROVED" && Boolean(getPublishTarget(item));
    }).length;
  }, [items, selectedIds]);
  const selectedSubmissionId = searchParams.get("submissionId");
  const selectedSubmission = items.find((item) => item.id === selectedSubmissionId) ?? null;

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

  function setPreview(submissionId: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (submissionId) next.set("submissionId", submissionId);
    else next.delete("submissionId");
    router.replace(`/admin/submissions?${next.toString()}`);
  }

  async function decide(item: SubmissionItem, action: Extract<SubmissionAction, "approve" | "reject">) {
    setLoadingId(item.id);
    setPendingAction(action);

    try {
      const result = await submitModerationAction(item, action, reasonById[item.id] || null);
      if (result.status === "error") {
        enqueueToast({ title: "Moderation update failed", message: result.message || "Request failed", variant: "error" });
        return;
      }

      if (action === "approve" && item.type === "VENUE") {
        if (item.targetVenue) setApprovedVenueContext({ id: item.targetVenue.id, slug: item.targetVenue.slug });
        enqueueToast({
          title: "Venue approved",
          message: "View it live, open the owner dashboard, or create an event next.",
          variant: "success",
        });
      } else {
        enqueueToast({
          title: action === "approve" ? "Approved" : item.type === "EVENT" ? "Rejected" : "Changes requested",
          message: action === "approve" ? "Submission approved successfully." : "Moderation decision saved.",
          variant: "success",
        });
      }
      router.refresh();
    } finally {
      setLoadingId(null);
      setPendingAction(null);
    }
  }

  async function runBulk(action: Extract<SubmissionAction, "approve" | "reject">, sharedReason?: string | null) {
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

  async function runBulkPublish() {
    const ids = [...selectedIds].filter((id) => {
      const row = items.find((item) => item.id === id);
      return row?.status === "APPROVED" && Boolean(getPublishTarget(row));
    });
    if (!ids.length) {
      enqueueToast({ title: "Nothing to publish", message: "Select approved events or venues first.", variant: "error" });
      return;
    }

    setIsBulkRunning(true);
    setBulkAction("publish");

    let succeeded = 0;
    const blocked: Array<{ id: string; title: string; blockers: string[] }> = [];

    try {
      await runBulkWithConcurrency(ids, async (id) => {
        const item = items.find((entry) => entry.id === id);
        if (!item) return;
        const target = getPublishTarget(item);
        if (!target) return;

        const result = await submitPublishAction(item);
        if (result.status === "ok") {
          succeeded += 1;
          setBulkResults((prev) => ({ ...prev, [id]: { status: "ok" } }));
          return;
        }

        if (result.status === "blocked") {
          blocked.push({ id, title: target.title, blockers: result.blockers });
          setBulkResults((prev) => ({ ...prev, [id]: { status: "error", message: result.blockers[0] || "Publishing is blocked" } }));
          return;
        }

        setBulkResults((prev) => ({ ...prev, [id]: { status: "error", message: result.message } }));
      });

      setPublishSummary({ succeeded, blocked });
      setBulkPublishSummaryOpen(true);
      enqueueToast({
        title: "Bulk publish completed",
        message: `${succeeded} succeeded, ${blocked.length} blocked`,
        variant: blocked.length ? "error" : "success",
      });
      router.refresh();
    } finally {
      setSelectedIds(new Set());
      setIsBulkRunning(false);
      setBulkAction(null);
    }
  }

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  return (
    <div className="space-y-3">
      {approvedVenueContext ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-900">Venue approved</p>
          <div className="mt-1 space-x-3">
            <Link className="underline" href={`/venues/${approvedVenueContext.slug}`}>View venue public page</Link>
            <Link className="underline" href={`/my?venueId=${approvedVenueContext.id}`}>View venue owner dashboard</Link>
            <Link className="underline" href={`/my/events/new?venueId=${approvedVenueContext.id}`}>Create an event for this venue</Link>
          </div>
        </div>
      ) : null}
      {selectedIds.size > 0 ? (
        <div className="sticky top-0 z-10 rounded border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" disabled={isBulkRunning} onClick={() => setBulkApproveDialogOpen(true)}>
              {isBulkRunning && bulkAction === "approve" ? "Approving…" : "Approve selected"}
            </Button>
            <Button size="sm" variant="secondary" disabled={isBulkRunning || selectedPublishableCount === 0} onClick={() => void runBulkPublish()}>
              {isBulkRunning && bulkAction === "publish" ? "Publishing…" : "Publish selected"}
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

      <Dialog open={bulkApproveDialogOpen} onOpenChange={setBulkApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve selected submissions?</DialogTitle>
            <DialogDescription>
              You are about to approve {selectedIds.size} submission(s). Approved entities can become visible publicly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isBulkRunning} onClick={() => setBulkApproveDialogOpen(false)}>Cancel</Button>
            <Button disabled={isBulkRunning} onClick={async () => { setBulkApproveDialogOpen(false); await runBulk("approve"); }}>Confirm approve</Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={bulkPublishSummaryOpen} onOpenChange={setBulkPublishSummaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk publish summary</DialogTitle>
            <DialogDescription>
              {publishSummary.succeeded} succeeded
              {publishSummary.blocked.length ? `, ${publishSummary.blocked.length} blocked.` : "."}
            </DialogDescription>
          </DialogHeader>
          {publishSummary.blocked.length ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">Blocked items</p>
              <ul className="list-disc space-y-1 pl-5">
                {publishSummary.blocked.map((item) => (
                  <li key={item.id}>{item.title} ({item.blockers.join(", ")})</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => setBulkPublishSummaryOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            const targetName = item.targetEvent?.title ?? item.targetVenue?.name ?? item.targetArtist?.name ?? "Unknown target";
            return (
              <li key={item.id} className="border rounded p-3 space-y-2 cursor-pointer" onClick={() => setPreview(item.id)}>
                <label className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isBulkRunning || !selectableIds.includes(item.id)}
                    onChange={() => toggleOne(item.id)}
                  />
                  Select row
                </label>
                <div className="font-medium">{item.type} — {targetName}</div>
                <div className="text-sm">Status: {item.status}</div>
                <div className="text-sm">Submitter: {item.submitter.name ?? item.submitter.email}</div>
                <div className="text-sm">Created: {new Date(item.createdAt).toLocaleString()}</div>
                {item.submittedAt ? <div className="text-sm">Submitted: {new Date(item.submittedAt).toLocaleString()}</div> : null}
                {item.targetVenue ? <div className="text-sm">Venue preview: {item.targetVenue.city ?? "—"}, {item.targetVenue.country ?? "—"} · claim {item.targetVenue.claimStatus ?? "—"} · {item.targetVenue.aiGenerated ? "AI" : "Manual"} · {item.targetVenue.images?.length ?? 0} images</div> : null}
                {item.targetEvent ? <div className="text-sm">Event preview: {item.targetEvent.startAt ? new Date(item.targetEvent.startAt).toLocaleString() : "—"} · {item.targetEvent.venue?.name ?? "No venue"} · {getEventTypeLabel(item.targetEvent.eventType)}</div> : null}
                {item.venue ? <div className="text-sm">Submission venue: {item.venue.name}</div> : null}
                {item.decidedAt ? <div className="text-sm">Decided: {new Date(item.decidedAt).toLocaleString()}</div> : null}
                {item.note ? <div className="text-sm">Note: {item.note}</div> : null}
                {item.status === "REJECTED" && item.decisionReason ? <div className="text-sm text-red-700">Reason: {item.decisionReason}</div> : null}

                <div className="text-sm space-x-3" onClick={(e) => e.stopPropagation()}>
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

                {item.status === "IN_REVIEW" ? (
                  <>
                    <input
                      className="border rounded p-1 w-full"
                      placeholder={item.type === "EVENT" ? "Rejection reason" : "Requested changes"}
                      value={reasonById[item.id] || ""}
                      disabled={disableRowActions}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <div className="space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={disableRowActions} onClick={() => decide(item, "approve")}>{isLoading && pendingAction === "approve" ? "Approving…" : "Approve"}</button>
                      <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={disableRowActions} onClick={() => decide(item, "reject")}>{isLoading && pendingAction === "reject" ? item.type === "EVENT" ? "Rejecting…" : "Requesting…" : item.type === "EVENT" ? "Reject" : "Request changes"}</button>
                    </div>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>

        <aside className="rounded border p-3">
          {selectedSubmission ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Submission preview</h3>
                <button className="underline" onClick={() => setPreview(null)}>Close</button>
              </div>
              <p className="font-medium">{selectedSubmission.targetEvent?.title ?? selectedSubmission.targetVenue?.name ?? selectedSubmission.targetArtist?.name ?? "Unknown"}</p>
              <p className="text-muted-foreground">{selectedSubmission.type} · {selectedSubmission.status}</p>
              <p>{selectedSubmission.targetEvent?.description ?? selectedSubmission.targetVenue?.description ?? "No description"}</p>
              {selectedSubmission.targetVenue ? <p>{selectedSubmission.targetVenue.city ?? ""} {selectedSubmission.targetVenue.country ?? ""}</p> : null}
              {selectedSubmission.targetEvent?.startAt ? <p>{new Date(selectedSubmission.targetEvent.startAt).toLocaleString()}</p> : null}
              <div className="grid grid-cols-3 gap-2">
                {(selectedSubmission.targetEvent?.images ?? selectedSubmission.targetVenue?.images ?? []).map((image) => (
                  <Image key={image.id} src={image.url} alt={image.alt ?? "preview"} width={128} height={64} className="h-16 w-full rounded object-cover" />
                ))}
              </div>
              <div className="space-y-1">
                {selectedSubmission.targetEvent ? <Link className="underline block" href={`/admin/events/${selectedSubmission.targetEvent.id}`}>Open event admin page</Link> : null}
                {selectedSubmission.targetVenue ? (
                  <>
                    <Link className="underline block" href={`/admin/venues/${selectedSubmission.targetVenue.id}`}>Open venue admin page</Link>
                    <Link className="underline block" href={`/venues/${selectedSubmission.targetVenue.slug}`}>View venue public page</Link>
                    <Link className="underline block" href={`/my?venueId=${selectedSubmission.targetVenue.id}`}>View venue owner dashboard</Link>
                    <Link className="underline block" href={`/my/events/new?venueId=${selectedSubmission.targetVenue.id}`}>Create event for this venue</Link>
                  </>
                ) : null}
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Select a submission row to preview details.</p>}
        </aside>
      </div>
    </div>
  );
}
