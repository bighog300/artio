"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SubmitClaimButton({ token, venueName }: { token: string; venueName: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/claim/${token}`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not submit claim");
      setState("done");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Could not submit claim");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-2">
        <p className="text-emerald-700 font-medium">Your claim is under review.</p>
        <p className="text-sm text-muted-foreground">Our team usually reviews claims within 2–3 business days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Submit your claim for <strong>{venueName}</strong>.</p>
      <Button onClick={() => void submit()} disabled={state === "loading"}>
        {state === "loading" ? "Submitting…" : "Submit claim"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
