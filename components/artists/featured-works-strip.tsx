"use client";

import Image from "next/image";
import type { ArtworkSummary } from "@/lib/artists";

export function FeaturedWorksStrip({ artworks, onSelect }: { artworks: ArtworkSummary[]; onSelect: (artwork: ArtworkSummary) => void }) {
  if (!artworks.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="type-h3">Featured Works</h2>
          <p className="type-caption text-red-500">Highlights from this artist</p>
        </div>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
        {artworks.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item)} className="w-[74%] shrink-0 snap-start rounded border bg-card p-3 text-left transition hover:bg-muted/40 md:w-auto">
            <div className="relative mb-2 aspect-square overflow-hidden rounded bg-muted">
              {item.images[0]?.url ? <Image src={item.images[0].url} alt={item.title} fill className="object-cover" /> : null}
            </div>
            <div className="line-clamp-1 font-medium">{item.title}</div>
            {item.price ? <div className="mt-1 text-xs text-muted-foreground">{item.price.currency} {item.price.amount.toLocaleString()}</div> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
