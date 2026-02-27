"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CandidateStatus = "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";

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
}: {
  candidateId: string;
  venueId: string;
  status: CandidateStatus;
  createdEventId: string | null;
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingTimezone, setMissingTimezone] = useState(false);

  async function approve() {
    if (loadingAction || status !== "PENDING") return;
    setError(null);
    setMissingTimezone(false);
    setLoadingAction("approve");
    try {
      const res = await fetch(`/api/admin/ingest/extracted-events/${candidateId}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { details?: unknown } } | null;
        const missingFields = extractMissingFields(body?.error?.details);
        setMissingTimezone(missingFields.includes("timezone"));
        setError(getActionError(res.status, body?.error?.details));
        return;
      }
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
      setOpenRejectModal(false);
      setRejectReason("");
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
        <Button size="sm" variant="outline" onClick={() => setOpenRejectModal(true)} disabled={status !== "PENDING" || loadingAction !== null}>
          {loadingAction === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        {status === "APPROVED" && createdEventId ? <Link className="text-xs underline" href={`/admin/events/${createdEventId}`}>View created event</Link> : null}
        {status === "REJECTED" && rejectionReason ? <span className="text-xs text-muted-foreground" title={rejectionReason}>Reason: {rejectionReason}</span> : null}
      </div>

      <Dialog open={openRejectModal} onOpenChange={setOpenRejectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject extracted candidate?</DialogTitle>
            <DialogDescription>A rejection reason is required and will be shown in this run record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Rejection reason
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                rows={4}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Explain why this candidate should be rejected"
                disabled={loadingAction !== null}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenRejectModal(false)} disabled={loadingAction !== null}>Cancel</Button>
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
