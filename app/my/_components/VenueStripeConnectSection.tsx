"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type StripeStatus = {
  connected: boolean;
  status: "PENDING" | "ACTIVE" | "RESTRICTED" | "DEAUTHORIZED" | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

const STATUS_LABELS: Record<NonNullable<StripeStatus["status"]>, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  RESTRICTED: "Restricted",
  DEAUTHORIZED: "Deauthorized",
};

export default function VenueStripeConnectSection({ venueId }: { venueId: string }) {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/my/venues/${venueId}/stripe/status`, { cache: "no-store" });
    if (!res.ok) return;
    setStatus(await res.json());
  }, [venueId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startConnect() {
    setLoading(true);
    try {
      const res = await fetch(`/api/my/venues/${venueId}/stripe/connect`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        enqueueToast({ title: body?.error?.message ?? "Could not start Stripe onboarding", variant: "error" });
        return;
      }
      window.location.href = body.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Stripe Connect</h2>
      <p className="text-sm text-muted-foreground">Connect your venue to Stripe to receive payouts for paid registrations.</p>
      <div className="rounded border bg-muted/30 p-3 text-sm">
        <p>Status: <span className="font-medium">{status?.status ? STATUS_LABELS[status.status] : "Not connected"}</span></p>
        <p>Charges enabled: <span className="font-medium">{status?.chargesEnabled ? "Yes" : "No"}</span></p>
        <p>Payouts enabled: <span className="font-medium">{status?.payoutsEnabled ? "Yes" : "No"}</span></p>
      </div>
      <Button type="button" onClick={() => void startConnect()} disabled={loading}>
        {loading ? "Starting…" : "Connect Stripe Account"}
      </Button>
    </section>
  );
}
