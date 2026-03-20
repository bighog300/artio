"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CandidateStatus = "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";

const QUICK_REJECT_REASONS = [
  "Not a real event",
  "Navigation noise",
  "Duplicate content",
  "Missing date or venue",
  "Wrong venue",
] as const;

function extractMissingFields(details?: unknown): string[] {
  if (!details || typeof details !== "object" || !Array.isArray((details as { missingFields?: unknown }).missingFields)) return [];
  return ((details as { missingFields: unknown[] }).missingFields).filter((field): field is string => typeof field === "string");
}

function getActionError(status: number, details?: unknown) {
  if (status === 401 || status === 403) return "Not authorized.";
  if (status === 404) return "Candidate not found.";
  if (status === 409) {
    const missingFields = extractMissingFields(details);
    const labels = missingFields.map((field) => {
      if (field === "startAt") return "start date";
      if (field === "timezone") return "timezone";
      if (field === "endAt") return "end time";
      return field;
    });

    return labels.length > 0
      ? `This candidate is missing required scheduling fields: ${labels.join(", ")}.`
      : "This candidate is missing required scheduling fields.";
  }
  return "Action failed. Please try again.";
}

export default function IngestCandidateActions({
  candidateId,
  venueId,
  status,
  createdEventId,
  rejectionReason,
  userRole,
  patch,
}: {
  candidateId: string;
  venueId: string;
  status: CandidateStatus;
  createdEventId: string | null;
  rejectionReason: string | null;
  userRole?: "USER" | "EDITOR" | "ADMIN";
  patch?: {
    title?: string;
    description?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    timezone?: string | null;
    locationText?: string | null;
  };
}) {
  const router = useRouter();
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | "approve_publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingTimezone, setMissingTimezone] = useState(false);
  const [linkedArtistCount, setLinkedArtistCount] = useState<number | null>(null);
  const [imageSkipWarning, setImageSkipWarning] = useState<string | null>(null);
  const [approvedEventId, setApprovedEventId] = useState<string | null>(createdEventId);
  const [pipelineStatus, setPipelineStatus] = useState<{
    linkedArtists: number;
    artistCandidates: number;
    artworkCandidates: number;
    imageAttached: boolean;
  } | null>(null);
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setApprovedEventId(createdEventId);
  }, [createdEventId]);

  function closeRejectModal() {
    setOpenRejectModal(false);
    setRejectReason("");
  }

  async function approve() {
    if (loadingAction || status !== "PENDING") return;
    setError(null);
    setMissingTimezone(false);
    setImageSkipWarning(null);
    setLoadingAction("approve");
    try {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidateId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch ? { ...patch } : {}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { details?: unknown } } | null;
        const missingFields = extractMissingFields(body?.error?.details);
        setMissingTimezone(missingFields.includes("timezone"));
        setError(getActionError(res.status, body?.error?.details));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        createdEventId?: string;
        linkedArtistCount?: number;
        imageWarning?: string | null;
        imageAttached?: boolean;
      };
      setLinkedArtistCount(body.linkedArtistCount ?? 0);
      if (body.imageWarning && !body.imageAttached) {
        setImageSkipWarning(body.imageWarning);
      }
      if (body.createdEventId) {
        setApprovedEventId(body.createdEventId);
        fetch(`/api/admin/ingest/extracted-events/${candidateId}/pipeline-status`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) {
              setPipelineStatus({
                linkedArtists: data.linkedArtists?.length ?? 0,
                artistCandidates: data.artistCandidates?.length ?? 0,
                artworkCandidates: data.artworkCandidates?.length ?? 0,
                imageAttached: data.imageStatus?.attached ?? false,
              });
            }
          })
          .catch(() => null);
      }
      router.refresh();
    } catch {
      setError("Action failed. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }


  async function approveAndPublish() {
    if (loadingAction || status !== "PENDING") return;
    setError(null);
    setMissingTimezone(false);
    setImageSkipWarning(null);
    setLoadingAction("approve_publish");
    try {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidateId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishImmediately: true, ...(patch ?? {}) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { details?: unknown } } | null;
        const missingFields = extractMissingFields(body?.error?.details);
        setMissingTimezone(missingFields.includes("timezone"));
        setError(getActionError(res.status, body?.error?.details));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        createdEventId?: string;
        linkedArtistCount?: number;
        published?: boolean;
      };
      setLinkedArtistCount(body.linkedArtistCount ?? 0);
      if (body.createdEventId) setApprovedEventId(body.createdEventId);
      router.refresh();
    } catch {
      setError("Action failed. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function reject() {
    if (loadingAction || status !== "PENDING") return;
    if (!rejectReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setError(null);
    setMissingTimezone(false);
    setLoadingAction("reject");
    try {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidateId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { details?: unknown } } | null;
        setError(getActionError(res.status, body?.error?.details));
        return;
      }
      closeRejectModal();
      router.refresh();
    } catch {
      setError("Action failed. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <InlineBanner>
          <div className="space-y-1">
            <div>{error}</div>
            {missingTimezone ? (
              <div>
                Timezone missing. Set venue timezone to approve. <Link href={`/admin/venues/${venueId}`} className="underline">Edit venue</Link>.
              </div>
            ) : null}
          </div>
        </InlineBanner>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={approve} disabled={status !== "PENDING" || loadingAction !== null}>
          {loadingAction === "approve" ? "Approving…" : "Approve"}
        </Button>
        {userRole === "ADMIN" && status === "PENDING" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={approveAndPublish}
            disabled={status !== "PENDING" || loadingAction !== null}
            className="border-emerald-600 text-emerald-800 hover:bg-emerald-50"
          >
            {loadingAction === "approve_publish" ? "Publishing…" : "Approve & Publish"}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setOpenRejectModal(true)} disabled={status !== "PENDING" || loadingAction !== null}>
          {loadingAction === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        {status === "REJECTED" && rejectionReason ? <span className="text-xs text-muted-foreground" title={rejectionReason}>Reason: {rejectionReason}</span> : null}
      </div>
      {approvedEventId ? (
        <div className="space-y-1">
          <a href={`/admin/events/${approvedEventId}`} className="text-xs underline text-muted-foreground">
            View event →
          </a>
          {pipelineStatus ? (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>
                <span className={pipelineStatus.linkedArtists > 0 ? "text-emerald-700" : ""}>
                  {pipelineStatus.linkedArtists} artist{pipelineStatus.linkedArtists === 1 ? "" : "s"} linked
                </span>
                {pipelineStatus.artistCandidates > 0 ? (
                  <>
                    {" "}·{" "}
                    <a href="/admin/ingest/artists" className="underline">
                      {pipelineStatus.artistCandidates} new candidate{pipelineStatus.artistCandidates === 1 ? "" : "s"} queued
                    </a>
                  </>
                ) : null}
              </p>
              {pipelineStatus.artworkCandidates > 0 ? (
                <p>
                  <a href="/admin/ingest/artworks" className="underline">
                    {pipelineStatus.artworkCandidates} artwork candidate{pipelineStatus.artworkCandidates === 1 ? "" : "s"} queued
                  </a>
                </p>
              ) : null}
              <p className={pipelineStatus.imageAttached ? "text-emerald-700" : ""}>
                {pipelineStatus.imageAttached ? "✓ Image attached" : "— No image imported"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {imageSkipWarning ? (
        <div className="mt-1 flex items-start gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
          <span>Event created but no image imported: {imageSkipWarning}</span>
          <button type="button" onClick={() => setImageSkipWarning(null)}>×</button>
        </div>
      ) : null}
      {linkedArtistCount === 0 && status === "APPROVED" ? (
        <p className="text-xs text-amber-700">
          No artists were auto-linked. Check artist names manually.
        </p>
      ) : null}
      {linkedArtistCount !== null && linkedArtistCount > 0 ? (
        <p className="text-xs text-emerald-700">
          {linkedArtistCount} artist{linkedArtistCount === 1 ? "" : "s"} auto-linked.
        </p>
      ) : null}

      <Dialog open={openRejectModal} onOpenChange={(open) => (open ? setOpenRejectModal(true) : closeRejectModal())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject extracted candidate?</DialogTitle>
            <DialogDescription>A rejection reason is required and will be shown in this run record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Rejection reason
              <textarea
                ref={rejectReasonRef}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                rows={4}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Explain why this candidate should be rejected"
                disabled={loadingAction !== null}
              />
            </label>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Quick reasons:</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_REJECT_REASONS.map((reason) => (
                  <Button
                    key={reason}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRejectReason(reason);
                      rejectReasonRef.current?.focus();
                    }}
                    disabled={loadingAction !== null}
                  >
                    {reason}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeRejectModal} disabled={loadingAction !== null}>Cancel</Button>
              <Button variant="outline" onClick={reject} disabled={loadingAction !== null || !rejectReason.trim()}>
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
