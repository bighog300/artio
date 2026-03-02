"use client";

import { useState } from "react";
import type { ContentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enqueueToast } from "@/lib/toast";

type ModerationStatus = ContentStatus;

const actionsByStatus: Record<ModerationStatus, Array<{ label: string; nextStatus: ModerationStatus }>> = {
  DRAFT: [{ label: "Submit for Review", nextStatus: "IN_REVIEW" }],
  IN_REVIEW: [{ label: "Approve", nextStatus: "APPROVED" }, { label: "Request Changes", nextStatus: "CHANGES_REQUESTED" }, { label: "Reject", nextStatus: "REJECTED" }],
  APPROVED: [{ label: "Publish", nextStatus: "PUBLISHED" }, { label: "Reject", nextStatus: "REJECTED" }],
  REJECTED: [{ label: "Reopen", nextStatus: "IN_REVIEW" }],
  CHANGES_REQUESTED: [{ label: "Move to Draft", nextStatus: "DRAFT" }, { label: "Resubmit for Review", nextStatus: "IN_REVIEW" }],
  PUBLISHED: [{ label: "Unpublish", nextStatus: "APPROVED" }, { label: "Archive", nextStatus: "ARCHIVED" }],
  ARCHIVED: [{ label: "Restore", nextStatus: "APPROVED" }],
};


export default function ModerationDetailClient({
  type,
  id,
  status,
  blockers,
}: {
  type: "venue" | "event";
  id: string;
  status: ModerationStatus;
  blockers: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ModerationStatus>(status);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ label: string; nextStatus: ModerationStatus } | null>(null);

  const actions = actionsByStatus[currentStatus] ?? [];

  async function applyAction() {
    if (!pendingAction) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/${type}s/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: pendingAction.nextStatus,
          ...(pendingAction.nextStatus === "PUBLISHED" ? { isPublished: true } : {}),
          ...(["APPROVED", "DRAFT", "IN_REVIEW", "REJECTED", "CHANGES_REQUESTED", "ARCHIVED"].includes(pendingAction.nextStatus) ? { isPublished: false } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.error?.message ?? "Action failed";
        enqueueToast({ title: message, variant: "error" });
        return;
      }
      setCurrentStatus(pendingAction.nextStatus);
      enqueueToast({ title: `${pendingAction.label} complete` });
      setConfirmOpen(false);
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="rounded border p-4 space-y-3">
        <h3 className="font-semibold">Action Panel</h3>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const isPublishAction = action.nextStatus === "PUBLISHED";
            const publishDisabled = isPublishAction && blockers.length > 0;
            return (
              <Button
                key={action.label}
                disabled={busy || publishDisabled}
                onClick={() => {
                  setPendingAction(action);
                  setConfirmOpen(true);
                }}
                variant={action.nextStatus === "REJECTED" || action.nextStatus === "ARCHIVED" ? "destructive" : "default"}
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
            <DialogDescription>
              {pendingAction ? `Are you sure you want to ${pendingAction.label.toLowerCase()}?` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void applyAction()} disabled={busy}>{busy ? "Working…" : "Confirm"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
