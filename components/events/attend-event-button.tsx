"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/client";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { recordFeedback } from "@/lib/personalization/feedback";
import { enqueueToast } from "@/lib/toast";

type AttendEventButtonProps = {
  eventId: string;
  nextUrl: string;
  isAuthenticated: boolean;
  ticketingMode?: "EXTERNAL" | "RSVP" | "PAID" | null;
  analytics?: {
    eventSlug?: string;
    ui?: "detail" | "calendar_panel";
  };
};

export function AttendEventButton({ eventId, nextUrl, isAuthenticated, analytics, ticketingMode }: AttendEventButtonProps) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [isGoing, setIsGoing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (ticketingMode === "RSVP") {
      setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      try {
        const res = await fetch(`/api/events/by-id/${eventId}/attend`, { method: "GET" });
        if (!res.ok) return;
        const body = await res.json() as { count?: number; isGoing?: boolean };
        if (!mounted) return;
        setCount(Math.max(0, Number(body.count ?? 0)));
        setIsGoing(Boolean(body.isGoing));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [eventId, ticketingMode]);

  if (ticketingMode === "RSVP") return null;

  async function onToggle() {
    if (isPending || isLoading) return;
    if (!isAuthenticated) {
      router.push(buildLoginRedirectUrl(nextUrl));
      return;
    }

    const nextGoing = !isGoing;
    setIsGoing(nextGoing);
    setCount((current) => Math.max(0, current + (nextGoing ? 1 : -1)));
    setIsPending(true);

    try {
      const response = await fetch(`/api/events/by-id/${eventId}/attend`, {
        method: nextGoing ? "POST" : "DELETE",
      });

      if (response.status === 401) {
        router.push(buildLoginRedirectUrl(nextUrl));
        setIsGoing(!nextGoing);
        setCount((current) => Math.max(0, current + (nextGoing ? -1 : 1)));
        return;
      }

      if (!response.ok) {
        setIsGoing(!nextGoing);
        setCount((current) => Math.max(0, current + (nextGoing ? -1 : 1)));
        enqueueToast({ title: "Could not update attendance", variant: "error" });
        return;
      }

      track("event_attendance_toggled", {
        eventSlug: analytics?.eventSlug,
        ui: analytics?.ui,
        nextState: nextGoing ? "going" : "not_going",
      });
      if (nextGoing) {
        recordFeedback({ type: "attend", source: "events", item: { type: "event", idOrSlug: eventId } });
      }
      enqueueToast({ title: nextGoing ? "You're going" : "You're no longer going" });
    } catch {
      setIsGoing(!nextGoing);
      setCount((current) => Math.max(0, current + (nextGoing ? -1 : 1)));
      enqueueToast({ title: "Could not update attendance", variant: "error" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending || isLoading}
        className="group inline-flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm ui-trans ui-press hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        aria-pressed={isGoing}
        aria-busy={isPending || isLoading}
        aria-label={isGoing ? "Mark event as not going" : "Mark event as going"}
      >
        <span>{isPending ? "Updating..." : isGoing ? "Going ✓" : "I'm going"}</span>
      </button>
      {count > 0 ? <span className="text-sm text-muted-foreground">{count} going</span> : null}
    </div>
  );
}
