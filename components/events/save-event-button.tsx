"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics/client";
import { enqueueToast } from "@/lib/toast";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { recordFeedback } from "@/lib/personalization/feedback";
import { recordOutcome } from "@/lib/personalization/measurement";

type SaveEventButtonProps = {
  eventId: string;
  initialSaved: boolean;
  nextUrl: string;
  isAuthenticated: boolean;
  analytics?: {
    eventSlug?: string;
    ui?: "detail" | "calendar_panel";
  };
};

export function SaveEventButton({ eventId, initialSaved, nextUrl, isAuthenticated, analytics }: SaveEventButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, setIsPending] = useState(false);
  const [showSavedHint, setShowSavedHint] = useState(false);

  useEffect(() => {
    if (!showSavedHint) return;
    const timeout = setTimeout(() => setShowSavedHint(false), 2000);
    return () => clearTimeout(timeout);
  }, [showSavedHint]);

  async function onToggle() {
    if (isPending) return;
    if (!isAuthenticated) {
      router.push(buildLoginRedirectUrl(nextUrl));
      return;
    }

    const nextSaved = !saved;
    setSaved(nextSaved);
    setIsPending(true);

    try {
      const response = await fetch(`/api/events/by-id/${eventId}/save`, {
        method: nextSaved ? "POST" : "DELETE",
      });

      if (response.status === 401) {
        router.push(buildLoginRedirectUrl(nextUrl));
        setSaved(!nextSaved);
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string } | string } | null;
        setSaved(!nextSaved);
        if (body?.error === "rate_limited" || body?.error && typeof body.error !== "string" && body.error.code === "rate_limited") {
          enqueueToast({ title: "Too many requests, try again", variant: "error" });
          return;
        }
        enqueueToast({ title: "Could not update saved event", variant: "error" });
        return;
      }

      track("event_saved_toggled", {
        eventSlug: analytics?.eventSlug,
        ui: analytics?.ui,
        nextState: nextSaved ? "saved" : "unsaved",
      });
      if (nextSaved) {
        recordFeedback({ type: "save", source: "events", item: { type: "event", idOrSlug: eventId } });
        recordOutcome({ action: "save", itemType: "event", itemKey: `event:${analytics?.eventSlug ?? eventId}`.toLowerCase() });
      }
      enqueueToast({ title: nextSaved ? "Saved" : "Removed from saved" });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("artio:event_saved_toggled", { detail: { eventId, nextState: nextSaved ? "saved" : "unsaved" } }));
      }
      if (nextSaved) setShowSavedHint(true);
    } catch {
      setSaved(!nextSaved);
      enqueueToast({ title: "Could not update saved event", variant: "error" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      className="group inline-flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm ui-trans ui-press hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      aria-pressed={saved}
      aria-busy={isPending}
      aria-label={saved ? "Remove event from saved" : "Save event"}
    >
      <span aria-hidden="true" className={`ui-trans motion-safe:transform-gpu motion-safe:group-hover:scale-105 ${saved ? "motion-safe:scale-110" : ""}`}>{saved ? "♥" : "♡"}</span>
      <span className="ui-trans">{isPending ? "Saving..." : saved ? "Saved" : "Save"}</span>
      {isPending ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" /> : null}
      <span className="sr-only" aria-live="polite">{isPending ? "Saving" : showSavedHint ? "Saved" : ""}</span>
    </button>
  );
}
