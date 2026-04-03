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
      <p className="text-sm text-muted-foreground">
        Connect your venue to Stripe to accept payments for paid ticket registrations.
      </p>

      {!status ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status.status === "ACTIVE" && status.chargesEnabled ? (
        <p className="text-sm text-emerald-700 font-medium">
          ✓ Stripe connected — your venue can accept paid registrations.
        </p>
      ) : status.status === "PENDING" || status.status === "RESTRICTED" ? (
        <div className="space-y-2">
          <p className="text-sm">
            Your Stripe account is being set up. Complete onboarding to start accepting payments.
          </p>
          <Button type="button" onClick={() => void startConnect()} disabled={loading}>
            {loading ? "Starting…" : "Continue onboarding"}
          </Button>
        </div>
      ) : status.status === "DEAUTHORIZED" ? (
        <div className="space-y-2">
          <p className="text-sm">
            Your Stripe account was disconnected. Reconnect to accept payments again.
          </p>
          <Button type="button" onClick={() => void startConnect()} disabled={loading}>
            {loading ? "Starting…" : "Reconnect Stripe"}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => void startConnect()} disabled={loading}>
          {loading ? "Starting…" : "Connect Stripe Account"}
        </Button>
      )}
    </section>
  );
}
