"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

export default function ArtistStripeRefreshPage() {
  const [loading, setLoading] = useState(false);

  async function refreshLink() {
    setLoading(true);
    try {
      const res = await fetch("/api/my/artist/stripe/connect", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        enqueueToast({ title: body?.error?.message ?? "Unable to generate a new onboarding link", variant: "error" });
        return;
      }
      window.location.href = body.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Stripe onboarding link expired</h1>
      <p className="text-sm text-muted-foreground">Your previous onboarding link has expired. Generate a new one to continue.</p>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void refreshLink()} disabled={loading}>{loading ? "Refreshing…" : "Generate new onboarding link"}</Button>
        <Link className="underline" href="/my/artist">Back to artist dashboard</Link>
      </div>
    </main>
  );
}
