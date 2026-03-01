"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  defaultVenueId?: string;
};

export function CreateEventForm({ defaultVenueId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 2) return;

    setCreating(true);
    setError(null);
    const res = await fetch("/api/my/events/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, venueId: defaultVenueId }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error?.message ?? "Failed to create draft event");
      setCreating(false);
      return;
    }

    router.replace(`/my/events/${body.eventId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-3 rounded border p-4">
      <label className="block">
        <span className="text-sm">Event title</span>
        <input className="w-full rounded border p-2" required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">We&apos;ll create a draft instantly. You can complete details on the next screen.</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={creating}>{creating ? "Creating draft..." : "Create draft"}</Button>
    </form>
  );
}
