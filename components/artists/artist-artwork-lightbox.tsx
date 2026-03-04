"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ArtworkSummary } from "@/lib/artists";

export function ArtistArtworkLightbox({ artwork, onClose }: { artwork: ArtworkSummary | null; onClose: () => void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!artwork) return;
    setIndex(0);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex((current) => (current === 0 ? artwork.images.length - 1 : current - 1));
      if (event.key === "ArrowRight") setIndex((current) => (current === artwork.images.length - 1 ? 0 : current + 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [artwork, onClose]);

  const image = useMemo(() => (artwork ? artwork.images[index] : null), [artwork, index]);
  if (!artwork || !image) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95" role="dialog" aria-modal="true" aria-label="Artwork lightbox">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
          <div>
            <h3 className="font-semibold">{artwork.title}</h3>
            <p className="text-sm text-white/70">{artwork.medium ?? ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-white/30 px-3 py-1 text-sm">Close</button>
        </header>
        <main className="relative flex min-h-0 flex-1 items-center justify-center p-4">
          {artwork.images.length > 1 ? <button type="button" onClick={() => setIndex((current) => (current === 0 ? artwork.images.length - 1 : current - 1))} className="absolute left-4 rounded border border-white/30 px-3 py-2 text-white">‹</button> : null}
          <div className="relative h-full w-full">
            {image.url ? <Image src={image.url} alt={artwork.title} fill className="object-contain" sizes="100vw" /> : null}
          </div>
          {artwork.images.length > 1 ? <button type="button" onClick={() => setIndex((current) => (current === artwork.images.length - 1 ? 0 : current + 1))} className="absolute right-4 rounded border border-white/30 px-3 py-2 text-white">›</button> : null}
        </main>
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {artwork.images.map((item, imageIndex) => (
            <button key={item.id} type="button" onClick={() => setIndex(imageIndex)} className={`relative h-14 w-14 flex-none overflow-hidden rounded border ${index === imageIndex ? "border-white" : "border-white/20"}`}>
              {item.url ? <Image src={item.url} alt={artwork.title} fill className="object-cover" sizes="56px" /> : null}
            </button>
          ))}
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3 text-sm text-white">
          <span>{artwork.dimensions ?? "Dimensions unavailable"}</span>
          <span>{artwork.forSale && artwork.price ? `${artwork.price.currency} ${artwork.price.amount.toLocaleString()} • Available` : "Not for sale"}</span>
          <span>{index + 1} / {artwork.images.length}</span>
          <Link href={`/artists/${artwork.artist.slug ?? ""}`} className="underline">Enquire</Link>
        </footer>
      </div>
    </div>
  );
}
