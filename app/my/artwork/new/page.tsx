"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function MyArtworkNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 2) return;

    setCreating(true);
    setError(null);
    const response = await fetch("/api/my/artwork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });

    const data = (await response.json().catch(() => ({}))) as { artwork?: { id: string }; error?: { message?: string } };
    if (!response.ok) {
      setError(data?.error?.message ?? "Failed to create artwork. Please try again.");
      setCreating(false);
      return;
    }

    if (data.artwork?.id) {
      router.replace(`/my/artwork/${data.artwork.id}`);
      router.refresh();
      return;
    }

    setError("Unexpected response. Please try again.");
    setCreating(false);
  }

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">New Artwork</h1>
      <form onSubmit={onSubmit} className="max-w-xl space-y-3 rounded border p-4">
        <label className="block">
          <span className="text-sm">Artwork title</span>
          <input
            className="w-full rounded border p-2"
            required
            minLength={2}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">We&apos;ll create a draft instantly. You can complete details on the next screen.</p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={creating}>{creating ? "Creating draft..." : "Create draft"}</Button>
          <Button variant="outline" asChild>
            <Link href="/my/artwork">Back to artworks</Link>
          </Button>
        </div>
      </form>
    </main>
  );
}
