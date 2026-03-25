"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InlineBanner } from "@/components/ui/inline-banner";
import { getPublisherStatusLabel, type UnifiedPublishStatus } from "@/lib/publish-intent";
import { enqueueToast } from "@/lib/toast";

type ModerationAction = "approve_publish" | "request_changes" | "reject" | "unpublish" | "restore" | "archive";

export default function ModerationPanel({
  resource,
  id,
  status,
  blockers,
}: {
  resource: "events" | "venues" | "artwork" | "artists";
  id: string;
  status: UnifiedPublishStatus;
  blockers: string[];
}) {
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [reasonAction, setReasonAction] = useState<"request_changes" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [currentStatus, setCurrentStatus] = useState(status);
  const [success, setSuccess] = useState<{ message: string; publicUrl?: string } | null>(null);

  const statusLabel = useMemo(() => getPublisherStatusLabel(currentStatus), [currentStatus]);

  async function runAction(action: ModerationAction, actionReason?: string) {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/${resource}/${id}/moderation-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(actionReason ? { action, reason: actionReason } : { action }),
      });
      const body = (await res.json().catch(() => null)) as { status?: UnifiedPublishStatus; message?: string; publicUrl?: string; error?: { message?: string } } | null;
      if (!res.ok) {
        enqueueToast({ title: "Moderation update failed", message: body?.error?.message ?? "Action failed", variant: "error" });
        return;
      }
      setCurrentStatus((body?.status as UnifiedPublishStatus) ?? currentStatus);
      setSuccess({ message: body?.message ?? "Saved", publicUrl: body?.publicUrl });
      setReason("");
      setReasonAction(null);
      enqueueToast({ title: "Saved", message: body?.message ?? "Moderation updated.", variant: "success" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Moderation</h2>
        <Badge>{statusLabel}</Badge>
      </div>

      {success ? (
        <InlineBanner>
          <div className="flex items-center gap-2 text-sm">
            <span>{success.message}</span>
            {success.publicUrl ? <Link className="underline" href={success.publicUrl} target="_blank">View public page</Link> : null}
          </div>
        </InlineBanner>
      ) : null}

      <div>
        <p className="text-sm font-medium">Preflight checklist</p>
        {blockers.length ? (
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        ) : <p className="text-sm text-emerald-700">No blocking issues.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={Boolean(busy) || blockers.length > 0} onClick={() => void runAction("approve_publish")}>{busy === "approve_publish" ? "Working…" : "Approve & Publish"}</Button>
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => setReasonAction("request_changes")}>Request changes</Button>
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => setReasonAction("reject")}>Reject</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={Boolean(busy)}>More actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void runAction("unpublish")}>Unpublish</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void runAction("restore")}>Restore</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void runAction("archive")}>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {reasonAction ? (
        <div className="space-y-2 rounded border p-3">
          <p className="text-sm font-medium">Reason</p>
          <textarea className="w-full rounded border p-2 text-sm" rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add a short reason" />
          <p className="text-right text-xs text-muted-foreground">
            {reason.length}/1000
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void runAction(reasonAction, reason.trim())} disabled={Boolean(busy) || reason.trim().length < 3 || reason.length > 1000}>{busy === reasonAction ? "Working…" : "Submit"}</Button>
            <Button size="sm" variant="outline" onClick={() => setReasonAction(null)} disabled={Boolean(busy)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
