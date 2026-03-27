"use client";

import Link from "next/link";
import { useState } from "react";

export type DuplicatePair = {
  artistId: string;
  artistName: string;
  artworkId1: string;
  title1: string;
  artworkId2: string;
  title2: string;
  year1: number | null;
  year2: number | null;
  medium1: string | null;
  medium2: string | null;
};

type Props = {
  duplicatePairs: DuplicatePair[];
  imageByArtworkId: Record<string, string | null>;
};

function ArtworkCard({ id, title, year, medium, imageUrl }: { id: string; title: string; year: number | null; medium: string | null; imageUrl: string | null }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex gap-3">
        <div className="h-9 w-9 overflow-hidden rounded bg-muted">
          {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          <Link href={`/admin/artwork/${id}`} className="line-clamp-1 text-sm font-medium underline">
            {title || "Untitled"}
          </Link>
          <p className="text-xs text-muted-foreground">{year ?? "—"} · {medium ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

export function DuplicatesClient({ duplicatePairs, imageByArtworkId }: Props) {
  const [pairs, setPairs] = useState(duplicatePairs);
  const [error, setError] = useState<string | null>(null);

  async function dismissPair(artworkId1: string, artworkId2: string) {
    setError(null);
    const previous = pairs;
    setPairs((current) => current.filter((pair) => !(pair.artworkId1 === artworkId1 && pair.artworkId2 === artworkId2)));

    try {
      const response = await fetch("/api/admin/ingest/duplicates/dismiss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkId1, artworkId2 }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
        throw new Error(body.error?.message ?? body.message ?? "Failed to dismiss pair");
      }
    } catch (err) {
      setPairs(previous);
      setError(err instanceof Error ? err.message : "Failed to dismiss pair");
    }
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
        No duplicate artworks detected.
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <p className="text-xs text-muted-foreground">Showing {pairs.length} likely duplicate pair{pairs.length === 1 ? "" : "s"}.</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {pairs.map((pair) => (
          <article key={`${pair.artworkId1}-${pair.artworkId2}`} className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{pair.artistName}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <ArtworkCard
                id={pair.artworkId1}
                title={pair.title1}
                year={pair.year1}
                medium={pair.medium1}
                imageUrl={imageByArtworkId[pair.artworkId1] ?? null}
              />
              <ArtworkCard
                id={pair.artworkId2}
                title={pair.title2}
                year={pair.year2}
                medium={pair.medium2}
                imageUrl={imageByArtworkId[pair.artworkId2] ?? null}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void dismissPair(pair.artworkId1, pair.artworkId2)}
                className="text-xs text-muted-foreground underline"
              >
                Not a duplicate
              </button>
              <a href={`/admin/artwork/${pair.artworkId2}`} className="rounded border px-3 py-1 text-xs">
                Review →
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
