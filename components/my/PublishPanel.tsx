"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPublisherStatusLabel, type PublishIntentResponse, type PublishOutcome, type UnifiedPublishStatus } from "@/lib/publish-intent";

type Props = {
  resourceType: "event" | "venue" | "artwork";
  id: string;
  status: UnifiedPublishStatus;
  title: string;
  publicUrl?: string;
  onStatusChange?: (status: UnifiedPublishStatus) => void;
  requiresConfirmation?: boolean;
  compact?: boolean;
};

function getStatusVariant(status: UnifiedPublishStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PUBLISHED" || status === "APPROVED") return "default";
  if (status === "IN_REVIEW") return "secondary";
  if (status === "REJECTED" || status === "CHANGES_REQUESTED") return "destructive";
  return "outline";
}

export function PublishPanel({ resourceType, id, status, title, publicUrl, onStatusChange, requiresConfirmation, compact }: Props) {
  const [currentStatus, setCurrentStatus] = useState<UnifiedPublishStatus>(status);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublishIntentResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const statusLabel = getPublisherStatusLabel(currentStatus);

  const state = useMemo(() => {
    if (currentStatus === "ARCHIVED") return { cta: "Restore", disabled: false, action: "restore" as const };
    if (currentStatus === "PUBLISHED" || currentStatus === "APPROVED") return { cta: "Unpublish", disabled: false, action: "unpublish" as const };
    if (currentStatus === "IN_REVIEW") return { cta: "Pending review", disabled: true, action: "none" as const };
    return { cta: "Publish", disabled: false, action: "publish" as const };
  }, [currentStatus]);

  async function runAction(action: "publish" | "unpublish" | "restore") {
    setLoading(true);
    setResult(null);
    try {
      const endpoint = action === "publish"
        ? `/api/my/${resourceType === "event" ? "events" : resourceType === "venue" ? "venues" : "artwork"}/${id}/publish-intent`
        : `/api/my/${resourceType === "event" ? "events" : resourceType === "venue" ? "venues" : "artwork"}/${id}/${action}`;
      const method = action === "publish" ? "POST" : "POST";
      const res = await fetch(endpoint, { method });
      const data = await res.json();
      if (!res.ok) {
        setResult({
          outcome: "blocked",
          status: currentStatus,
          message: data?.message ?? "Action failed.",
          blockingIssues: [],
        });
        return;
      }

      if (action !== "publish") {
        const nextStatus: UnifiedPublishStatus = action === "restore" ? "DRAFT" : "DRAFT";
        setCurrentStatus(nextStatus);
        onStatusChange?.(nextStatus);
        setResult({ outcome: "published", status: nextStatus, message: action === "restore" ? "Restored to draft." : "Moved back to draft." });
        return;
      }

      const outcome = (data?.outcome ?? "blocked") as PublishOutcome;
      const nextStatus = (data?.status ?? currentStatus) as UnifiedPublishStatus;
      setCurrentStatus(nextStatus);
      onStatusChange?.(nextStatus);
      setResult(data as PublishIntentResponse);
      if (outcome === "blocked" && data?.blockingIssues?.length) {
        setResult(data as PublishIntentResponse);
      }
    } finally {
      setLoading(false);
    }
  }


  if (compact) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(currentStatus)}>{statusLabel}</Badge>
          <Button
            size="sm"
            variant={(currentStatus === "PUBLISHED" || currentStatus === "APPROVED") ? "destructive" : "default"}
            disabled={state.disabled || loading}
            onClick={() => {
              if (state.action === "publish") {
                if (requiresConfirmation) {
                  setConfirmOpen(true);
                } else {
                  void runAction("publish");
                }
                return;
              }
              if (state.action === "unpublish") void runAction("unpublish");
              if (state.action === "restore") void runAction("restore");
            }}
          >
            {loading ? "Working…" : state.cta}
          </Button>
          {result?.publicUrl && result.outcome === "published" && (
            <a href={result.publicUrl} target="_blank" className="text-xs underline text-muted-foreground" rel="noreferrer">
              View →
            </a>
          )}
        </div>
        {result?.message && (
          <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>
        )}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit for review?</DialogTitle>
              <DialogDescription>
                Your {resourceType} will be reviewed by our team before going live.
                You&apos;ll receive an email confirmation once submitted.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>Cancel</Button>
              <Button onClick={() => { setConfirmOpen(false); void runAction("publish"); }} disabled={loading}>
                Submit for review
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card id="publish-panel" className="lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle className="text-lg">Publish {resourceType}</CardTitle>
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(currentStatus)}>{statusLabel}</Badge>
          <p className="text-sm text-muted-foreground">Status: {statusLabel}</p>
        </div>

        <Button
          variant={(currentStatus === "PUBLISHED" || currentStatus === "APPROVED") ? "destructive" : "default"}
          disabled={state.disabled || loading}
          onClick={() => {
            if (state.action === "publish") {
              if (requiresConfirmation) {
                setConfirmOpen(true);
              } else {
                void runAction("publish");
              }
              return;
            }
            if (state.action === "unpublish") void runAction("unpublish");
            if (state.action === "restore") void runAction("restore");
          }}
          className="w-full"
        >
          {loading ? "Working..." : state.cta}
        </Button>

        {result ? (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <p className="font-medium">
              {result.outcome === "published" ? "✅ Published" : result.outcome === "submitted" ? "🕓 Submitted for review" : "Please fix the required items"}
            </p>
            <p className="mt-1 text-muted-foreground">{result.message}</p>

            {(result.publicUrl ?? publicUrl) && result.outcome === "published" ? (
              <Link className="mt-2 inline-block underline" href={result.publicUrl ?? publicUrl ?? "#"}>View public page</Link>
            ) : null}

            {result.blockingIssues?.length ? (
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                {result.blockingIssues.map((issue) => (
                  <li key={issue.key}>
                    {issue.href ? <a className="underline" href={issue.href}>{issue.label}</a> : issue.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for review?</DialogTitle>
            <DialogDescription>
              Your {resourceType} will be reviewed by our team before going live. You&apos;ll receive an email confirmation once submitted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void runAction("publish");
              }}
              disabled={loading}
            >
              Submit for review
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
