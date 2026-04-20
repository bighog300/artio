"use client";

import { Bell, BellOff } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { track } from "@/lib/analytics/client";

type ReminderPreset = "2H" | "24H";

export function ReminderButton({
  eventId,
  eventSlug,
  isAuthenticated,
  nextUrl,
  initialReminderPreset,
}: {
  eventId: string;
  eventSlug: string;
  isAuthenticated: boolean;
  nextUrl: string;
  initialReminderPreset: ReminderPreset | null;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<ReminderPreset | null>(initialReminderPreset);
  const [pending, setPending] = useState(false);

  async function setReminder(nextPreset: ReminderPreset) {
    if (pending) return;
    if (!isAuthenticated) {
      router.push(buildLoginRedirectUrl(nextUrl));
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/events/by-id/${eventId}/reminders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset: nextPreset }),
      });
      if (!response.ok) throw new Error("create_failed");
      setPreset(nextPreset);
      track("event_reminder_created", { eventSlug, source: "events", kind: nextPreset.toLowerCase() });
    } finally {
      setPending(false);
    }
  }

  async function deleteReminder() {
    if (pending || !preset) return;
    setPending(true);
    try {
      const response = await fetch(`/api/events/by-id/${eventId}/reminders`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("delete_failed");
      track("event_reminder_deleted", { eventSlug, source: "events", kind: preset.toLowerCase() });
      setPreset(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2 rounded border border-border bg-background/90 p-1">
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm ${preset === "2H" ? "bg-muted font-medium" : ""}`}
        disabled={pending}
        onClick={() => void setReminder("2H")}
        aria-pressed={preset === "2H"}
      >
        <Bell className="h-4 w-4" />
        Remind 2h
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm ${preset === "24H" ? "bg-muted font-medium" : ""}`}
        disabled={pending}
        onClick={() => void setReminder("24H")}
        aria-pressed={preset === "24H"}
      >
        <Bell className="h-4 w-4" />
        Remind 24h
      </button>
      {preset ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
          disabled={pending}
          onClick={() => void deleteReminder()}
        >
          <BellOff className="h-3.5 w-3.5" />
          Remove
        </button>
      ) : null}
    </div>
  );
}
