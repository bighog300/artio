"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { enqueueToast } from "@/lib/toast";
import { isHardDeleteConfirmMatch, requestHardDelete } from "./AdminHardDeleteButton";

export type AdminInlineRowActionsProps<T extends Record<string, unknown>> = {
  entityLabel: string;
  entityType: "events" | "venues" | "artists" | "artwork";
  id: string;
  initial: T;
  editable: ReadonlyArray<{
    key: keyof T;
    label: string;
    type: "text" | "textarea" | "checkbox" | "datetime";
  }>;
  patchUrl: string;
  archiveUrl: string;
  restoreUrl: string;
  deleteUrl: string;
  isArchived: boolean;
  isEditing: boolean;
  status?: string;
  publishBlockers?: string[];
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveSuccess?: () => void;
  onAfterMutate?: () => void;
};

export function buildEditableDraft<T extends Record<string, unknown>>(
  initial: T,
  editable: AdminInlineRowActionsProps<T>["editable"],
) {
  return editable.reduce<Record<string, unknown>>((acc, field) => {
    acc[String(field.key)] = initial[field.key] ?? (field.type === "checkbox" ? false : "");
    return acc;
  }, {});
}

export function computeDraftPatch(initial: Record<string, unknown>, draft: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  Object.entries(draft).forEach(([key, value]) => {
    const initialValue = initial[key];
    if (value !== initialValue) payload[key] = value;
  });
  return payload;
}

export function getNextEditingId(currentEditingId: string | null, nextId: string) {
  if (currentEditingId === nextId) return currentEditingId;
  return nextId;
}

export async function requestInlinePatch(patchUrl: string, payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch) {
  return fetchImpl(patchUrl, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function requestInlineArchiveToggle(url: string, fetchImpl: typeof fetch = fetch) {
  return fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

function actionErrorMessage(status: number, fallback: string) {
  if (status === 401 || status === 403) return "Not authorized";
  if (status === 409) return "Conflict: please refresh and try again";
  return fallback;
}

function getReadinessLabel(status?: string, blockers: string[] = []) {
  if (status !== "APPROVED") return { icon: "❌", label: "Blocked" };
  if (blockers.length > 0) return { icon: "⚠", label: `Missing ${blockers.length} fields` };
  return { icon: "✅", label: "Ready" };
}

export default function AdminInlineRowActions<T extends Record<string, unknown>>({
  entityLabel,
  entityType,
  id,
  initial,
  editable,
  patchUrl,
  archiveUrl,
  restoreUrl,
  deleteUrl,
  isArchived,
  isEditing,
  status,
  publishBlockers = [],
  onStartEdit,
  onCancelEdit,
  onSaveSuccess,
  onAfterMutate,
}: AdminInlineRowActionsProps<T>) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => buildEditableDraft(initial, editable));
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const mutateDone = useMemo(() => onAfterMutate ?? (() => router.refresh()), [onAfterMutate, router]);
  const controlsDisabled = isSaving || isArchiving || isDeleting || isPublishing;
  const supportsModeratedPublish = entityType === "events" || entityType === "venues";
  const canPublish = status === "APPROVED" && publishBlockers.length === 0;
  const readiness = getReadinessLabel(status, publishBlockers);

  async function save() {
    setRowError(null);
    setIsSaving(true);
    try {
      const payload = computeDraftPatch(initial, draft);
      const res = await requestInlinePatch(patchUrl, payload);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const blockerMessage = Array.isArray(body?.error?.details?.blockers)
          ? `Publish blocked: ${body.error.details.blockers.map((b: { message?: string }) => b.message).filter(Boolean).join(" ")}`
          : null;
        const message = blockerMessage ?? actionErrorMessage(res.status, "Save failed");
        setRowError(message);
        enqueueToast({ title: message, variant: "error" });
        return;
      }
      enqueueToast({ title: `${entityLabel} updated` });
      onSaveSuccess?.();
      onCancelEdit();
      mutateDone();
    } finally {
      setIsSaving(false);
    }
  }

  async function publish() {
    if (!supportsModeratedPublish || !canPublish) return;
    setRowError(null);
    setIsPublishing(true);
    try {
      const res = await requestInlinePatch(patchUrl, { status: "PUBLISHED", isPublished: true });
      if (!res.ok) {
        const message = actionErrorMessage(res.status, "Publish failed");
        setRowError(message);
        enqueueToast({ title: message, variant: "error" });
        return;
      }
      enqueueToast({ title: `${entityLabel} published` });
      mutateDone();
    } finally {
      setIsPublishing(false);
    }
  }

  function cancel() {
    setDraft(buildEditableDraft(initial, editable));
    setRowError(null);
    onCancelEdit();
  }

  async function toggleArchive() {
    setRowError(null);
    setIsArchiving(true);
    try {
      const res = await requestInlineArchiveToggle(isArchived ? restoreUrl : archiveUrl);
      if (!res.ok) {
        const message = actionErrorMessage(res.status, "Request failed");
        setRowError(message);
        enqueueToast({ title: message, variant: "error" });
        return;
      }
      enqueueToast({ title: isArchived ? "Restored" : "Archived" });
      mutateDone();
    } finally {
      setIsArchiving(false);
    }
  }

  async function hardDelete() {
    if (!isHardDeleteConfirmMatch(deleteConfirmation, "DELETE")) return;
    setRowError(null);
    setIsDeleting(true);
    try {
      const res = await requestHardDelete(deleteUrl);
      if (!res.ok) {
        const message = actionErrorMessage(res.status, "Delete failed");
        setRowError(message);
        enqueueToast({ title: message, variant: "error" });
        return;
      }
      enqueueToast({ title: "Deleted permanently" });
      onCancelEdit();
      setDeleteOpen(false);
      mutateDone();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {supportsModeratedPublish ? (
          <span
            className="rounded border px-2 py-1 text-xs"
            title={publishBlockers.length > 0 ? publishBlockers.join("\n") : "No publish blockers"}
          >
            {readiness.icon} {readiness.label}
          </span>
        ) : null}

        {isEditing ? (
          <>
            <Button type="button" size="sm" onClick={() => void save()} disabled={controlsDisabled}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={controlsDisabled}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => onStartEdit(id)} disabled={controlsDisabled}>
            Edit
          </Button>
        )}

        {supportsModeratedPublish ? (
          <Button type="button" size="sm" onClick={() => void publish()} disabled={controlsDisabled || !canPublish}>
            {isPublishing ? "Publishing…" : "Publish"}
          </Button>
        ) : null}

        <Button type="button" size="sm" variant={isArchived ? "secondary" : "destructive"} onClick={() => void toggleArchive()} disabled={controlsDisabled}>
          {isArchiving ? "Working…" : isArchived ? "Restore" : "Archive"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" disabled={controlsDisabled}>More</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive">
              Delete permanently…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rowError ? <p className="text-xs text-destructive">{rowError}</p> : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {entityLabel} permanently?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Type DELETE to continue.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm" htmlFor={`inline-hard-delete-${id}`}>
            Confirmation
            <input
              id={`inline-hard-delete-${id}`}
              className="w-full rounded border p-2"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void hardDelete()}
              disabled={!isHardDeleteConfirmMatch(deleteConfirmation, "DELETE") || isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
