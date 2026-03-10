"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type ArtistStripeConnectButtonProps = {
  children: string;
};

export function ArtistStripeConnectButton({ children }: ArtistStripeConnectButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/my/artist/stripe/connect", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        enqueueToast({ title: body?.error?.message ?? "Unable to start Stripe onboarding", variant: "error" });
        return;
      }
      window.location.href = body.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" onClick={() => void handleConnect()} disabled={loading}>
      {loading ? "Redirecting…" : children}
    </Button>
  );
}
