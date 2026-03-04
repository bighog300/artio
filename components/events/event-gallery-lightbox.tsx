"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

type GalleryImage = {
  id: string;
  src: string;
  alt: string;
};

export function EventGalleryLightbox({ images }: { images: GalleryImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (selectedIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndex(null);
      if (event.key === "ArrowRight") setSelectedIndex((i) => (i! + 1) % images.length);
      if (event.key === "ArrowLeft") setSelectedIndex((i) => (i! - 1 + images.length) % images.length);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [images.length, selectedIndex]);

  const selectedImage = selectedIndex === null ? null : images[selectedIndex];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">Gallery</h2>
        <p className="text-sm text-muted-foreground">{images.length} photos</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className="relative aspect-[4/3] overflow-hidden rounded border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
            aria-label={`View photo ${index + 1} of ${images.length}`}
          >
            <Image src={image.src} alt={image.alt} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover" />
          </button>
        ))}
      </div>
      {selectedImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Event photo preview">
          <button type="button" onClick={() => setSelectedIndex(null)} className="absolute inset-0 cursor-default" aria-label="Close photo preview" />
          <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded bg-black">
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex((i) => (i! - 1 + images.length) % images.length);
                  }}
                  className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex((i) => (i! + 1) % images.length);
                  }}
                  className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
            <div className="relative aspect-[4/3]">
              <Image src={selectedImage.src} alt={selectedImage.alt} fill sizes="(max-width: 1200px) 100vw, 1200px" className="object-contain" />
            </div>
            <p className="py-2 text-center text-xs text-white/60">
              {selectedIndex! + 1} / {images.length}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
