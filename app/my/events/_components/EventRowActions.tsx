"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { enqueueToast } from "@/lib/toast";

type Props = {
  eventId: string;
  slug: string | null;
  isPublished: boolean;
  isArchived: boolean;
  submissionStatus: string | null;
};

export function EventRowActions({
  eventId,
  slug,
  isPublished,
  isArchived,
  submissionStatus,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    const { ok, body } = await post(`/api/my/events/${eventId}/duplicate`);
    if (ok && typeof body?.eventId === "string") {
      enqueueToast({ title: "Draft duplicated", variant: "success" });
      router.push(`/my/events/${body.eventId}`);
      return;
    }

    enqueueToast({
      title: typeof body?.message === "string" ? body.message : "Failed to duplicate event",
      variant: "error",
    });
  }

  async function handleSubmit() {
    const { ok, status, body } = await post(`/api/my/events/${eventId}/submit`);
    if (ok) {
      enqueueToast({ title: "Submitted for review", variant: "success" });
      router.refresh();
      return;
    }

    if (status === 409) {
      enqueueToast({ title: "Already submitted", variant: "error" });
      return;
    }

    enqueueToast({
      title: typeof body?.message === "string" ? body.message : "Failed to submit",
      variant: "error",
    });
  }

  function handleCreateRevision() {
    enqueueToast({ title: "Edit this event and save changes to prepare a revision.", variant: "success" });
    router.push(`/my/events/${eventId}`);
  }

  async function handleArchive() {
    const action = isArchived ? "restore" : "archive";
    const { ok } = await post(`/api/my/events/${eventId}/${action}`);
    if (ok) {
      enqueueToast({
        title: isArchived ? "Event restored" : "Event archived",
        variant: "success",
      });
      router.refresh();
      return;
    }

    enqueueToast({ title: `Failed to ${action} event`, variant: "error" });
  }

  const submittingDisabled = busy || submissionStatus === "IN_REVIEW";

  return (
    <div className="inline-flex items-center gap-1">
      <Button asChild size="sm">
        <Link href={`/my/events/${eventId}`}>Edit</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label="More actions" disabled={busy}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isPublished && slug ? (
            <DropdownMenuItem asChild>
              <Link href={`/events/${slug}`}>View public page</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void handleDuplicate()}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleSubmit()} disabled={submittingDisabled}>
            Submit / Resubmit
          </DropdownMenuItem>
          {isPublished ? (
            <DropdownMenuItem onSelect={handleCreateRevision}>
              Create revision
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={isArchived ? () => void handleArchive() : () => setConfirmArchiveOpen(true)}
          >
            {isArchived ? "Restore" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmArchiveOpen} onOpenChange={setConfirmArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive event?</DialogTitle>
            <DialogDescription>
              This event will be hidden from your dashboard. You can restore it at any time from the Archived filter.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchiveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmArchiveOpen(false);
                void handleArchive();
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
