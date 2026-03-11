"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type RegistrationsResponse = {
  total: number;
  items: Array<{ confirmationCode: string; quantity: number; status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" }>;
  summary: { confirmed: number };
};

type SuccessPayload = {
  ok: true;
  guestName: string;
  checkedInAt?: string;
};

type StatusPanel =
  | { tone: "success"; message: string }
  | { tone: "warn"; message: string }
  | { tone: "error"; message: string }
  | null;

export default function CheckinClient({
  eventId,
  eventTitle,
  eventStartAtIso,
  initialCheckedIn,
}: {
  eventId: string;
  eventTitle: string;
  eventStartAtIso: string;
  initialCheckedIn: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusPanel, setStatusPanel] = useState<StatusPanel>(null);
  const [checkedInCount, setCheckedInCount] = useState(initialCheckedIn);
  const [registeredCount, setRegisteredCount] = useState<number>(0);
  const [quantityByCode, setQuantityByCode] = useState<Record<string, number>>({});

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadRegistrations() {
      const response = await fetch(`/api/my/events/${eventId}/registrations?page=1&limit=10000`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return;

      const data = (await response.json()) as RegistrationsResponse;
      if (ignore) return;

      setRegisteredCount(data.summary.confirmed ?? data.total ?? 0);
      const map: Record<string, number> = {};
      for (const row of data.items) {
        map[row.confirmationCode.toUpperCase()] = row.quantity;
      }
      setQuantityByCode(map);
    }

    void loadRegistrations();
    return () => {
      ignore = true;
    };
  }, [eventId]);

  const eventDateLabel = useMemo(() => new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(eventStartAtIso)), [eventStartAtIso]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = confirmationCode.trim().toUpperCase();
    if (!code) return;

    setSubmitting(true);
    setStatusPanel(null);

    try {
      const response = await fetch(`/api/checkin/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationCode: code }),
      });

      const payload = (await response.json().catch(() => null)) as SuccessPayload | { checkedInAt?: string } | null;

      if (response.ok && payload && "guestName" in payload) {
        const quantity = quantityByCode[code] ?? 1;
        setCheckedInCount((prev) => prev + quantity);
        setStatusPanel({
          tone: "success",
          message: `Checked in: ${payload.guestName}, ${quantity} ticket${quantity === 1 ? "" : "s"}`,
        });
        setConfirmationCode("");
        inputRef.current?.focus();
        return;
      }

      if (response.status === 409) {
        const alreadyAt = payload && payload.checkedInAt
          ? ` at ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(payload.checkedInAt))}`
          : "";
        setStatusPanel({ tone: "warn", message: `Already checked in${alreadyAt}` });
        return;
      }

      if (response.status === 404) {
        setStatusPanel({ tone: "error", message: "Confirmation code not found" });
        return;
      }

      setStatusPanel({ tone: "error", message: "Unable to check in code" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{eventTitle}</h1>
        <p className="text-sm text-muted-foreground">{eventDateLabel}</p>
        <p className="text-base font-medium">Checked in: {checkedInCount} / {registeredCount}</p>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="confirmationCode">Confirmation code</label>
        <input
          id="confirmationCode"
          ref={inputRef}
          value={confirmationCode}
          onChange={(e) => setConfirmationCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-14 w-full rounded-md border px-4 text-lg uppercase tracking-wider"
          placeholder="e.g. ABC123"
        />

        <button
          type="submit"
          disabled={submitting || confirmationCode.trim().length === 0}
          className="h-14 w-full rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Checking in…" : "Check in"}
        </button>
      </form>

      {statusPanel ? (
        <div
          className={
            statusPanel.tone === "success"
              ? "rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"
              : statusPanel.tone === "warn"
                ? "rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900"
                : "rounded-md border border-red-300 bg-red-50 p-4 text-red-900"
          }
        >
          {statusPanel.message}
        </div>
      ) : null}
    </div>
  );
}
