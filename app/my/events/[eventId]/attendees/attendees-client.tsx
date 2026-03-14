"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { enqueueToast } from "@/lib/toast";

type Item = {
  id: string;
  guestName: string;
  guestEmail: string;
  status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED";
  stripePaymentIntentId?: string | null;
  refundedAt?: string | null;
  refundedAmountGbp?: number | null;
};

export function AttendeesClient({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [partialById, setPartialById] = useState<Record<string, string>>({});
  const [openRefund, setOpenRefund] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/my/events/${eventId}/registrations`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      enqueueToast({ title: body?.error?.message ?? "Failed to load attendees", variant: "error" });
      setLoading(false);
      return;
    }
    setItems(Array.isArray(body.items) ? body.items : []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [eventId, load]);

  async function cancelRegistration(id: string) {
    const res = await fetch(`/api/my/events/${eventId}/registrations/${id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      enqueueToast({ title: body?.error?.message ?? "Failed to cancel", variant: "error" });
      return;
    }
    enqueueToast({ title: "Registration cancelled" });
    await load();
  }

  async function refundRegistration(id: string) {
    const raw = partialById[id]?.trim();
    const amount = raw ? Number(raw) : undefined;
    const payload = Number.isInteger(amount) && amount! > 0 ? { amount } : {};
    const res = await fetch(`/api/my/events/${eventId}/registrations/${id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      enqueueToast({ title: body?.error?.message ?? "Failed to refund", variant: "error" });
      return;
    }
    enqueueToast({ title: `Refund issued (£${((body.refundedAmount ?? 0) / 100).toFixed(2)})` });
    setOpenRefund(null);
    await load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading attendees…</p>;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{item.guestName}</p>
              <p className="text-sm text-muted-foreground">{item.guestEmail}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{item.status}</Badge>
              {item.refundedAt ? <Badge variant="secondary">Refunded</Badge> : null}
              {item.status === "CONFIRMED" ? <Button size="sm" variant="outline" onClick={() => void cancelRegistration(item.id)}>Cancel</Button> : null}
              {item.status === "CONFIRMED" && item.stripePaymentIntentId ? (
                <Button size="sm" variant="outline" onClick={() => setOpenRefund(openRefund === item.id ? null : item.id)}>Refund</Button>
              ) : null}
            </div>
          </div>
          {openRefund === item.id ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                className="w-48 rounded border p-2 text-sm"
                placeholder="Partial amount (pence, optional)"
                inputMode="numeric"
                value={partialById[item.id] ?? ""}
                onChange={(e) => setPartialById((prev) => ({ ...prev, [item.id]: e.target.value }))}
              />
              <Button size="sm" onClick={() => void refundRegistration(item.id)}>Confirm refund</Button>
            </div>
          ) : null}
        </div>
      ))}
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No registrations yet.</p> : null}
    </div>
  );
}
