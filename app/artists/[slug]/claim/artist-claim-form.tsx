"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ClaimArtistForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-lg border bg-background p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus(null);
        setError(null);
        try {
          const response = await fetch(`/api/artists/${encodeURIComponent(slug)}/claim`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, email }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) throw new Error(body?.error?.message ?? "Failed to submit claim");
          setStatus("Check your email — we've sent a verification link.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to submit claim");
        }
      }}
    >
      <label className="block text-sm font-medium">Your name</label>
      <input className="w-full rounded-md border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
      <label className="block text-sm font-medium">Email</label>
      <input className="w-full rounded-md border px-3 py-2 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={240} required />
      <Button type="submit">Send verification link</Button>
      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
