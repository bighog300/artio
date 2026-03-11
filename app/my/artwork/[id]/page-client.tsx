"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateArtworkReadiness } from "@/lib/publish-readiness";
import { ArtworkGalleryManager } from "@/components/my/artwork/artwork-gallery-manager";
import { ArtworkRelationsPanel } from "@/components/my/artwork/artwork-relations-panel";
import { PublishPanel } from "@/components/my/PublishPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { getPublisherStatusLabel, type UnifiedPublishStatus } from "@/lib/publish-intent";

type Artwork = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  condition?: string | null;
  conditionNotes?: string | null;
  provenance?: string | null;
  editionInfo?: string | null;
  frameIncluded?: boolean | null;
  shippingNotes?: string | null;
  priceAmount: number | null;
  currency: string | null;
  featuredAssetId: string | null;
  isPublished: boolean;
  deletedAt?: string | null;
  images: Array<{ id: string; alt: string | null; assetId: string; sortOrder: number; asset: { url: string } }>;
  initialVenues?: Array<{ id: string; name: string; slug: string }>;
  initialEvents?: Array<{ id: string; title: string; slug: string; startAt: string }>;
};

export function ArtworkDetailClient({
  initialArtwork,
  initialVenues,
  initialEvents,
}: {
  initialArtwork: Artwork;
  initialVenues: Array<{ id: string; name: string; slug: string }>;
  initialEvents: Array<{ id: string; title: string; slug: string; startAt: string }>;
}) {
  const router = useRouter();
  const [artwork, setArtwork] = useState<Artwork>(initialArtwork);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/my/artwork/${initialArtwork.id}`);
      if (!res.ok) {
        setLoadError(res.status === 404 ? "Artwork not found." : res.status === 403 ? "Access denied." : "Failed to load artwork.");
        return;
      }
      const data = await res.json();
      setArtwork(data.artwork);
    } catch {
      setLoadError("Failed to load artwork.");
    }
  }, [initialArtwork.id]);

  async function onSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/my/artwork/${artwork.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: artwork.title,
          slug: artwork.slug,
          description: artwork.description,
          year: artwork.year,
          medium: artwork.medium,
          dimensions: artwork.dimensions,
          priceAmount: artwork.priceAmount,
          currency: artwork.currency,
          condition: artwork.condition,
          conditionNotes: artwork.conditionNotes,
          provenance: artwork.provenance,
          editionInfo: artwork.editionInfo,
          frameIncluded: artwork.frameIncluded,
          shippingNotes: artwork.shippingNotes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        enqueueToast({ title: body?.error?.message ?? "Failed to save artwork", variant: "error" });
        return;
      }
      enqueueToast({ title: "Artwork saved", variant: "success" });
      await refresh();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <main className="space-y-3 p-6">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button onClick={() => void refresh()}>Retry</Button>
      </main>
    );
  }

  const readiness = evaluateArtworkReadiness(artwork, artwork.images);
  const orderedImages = [...artwork.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const status: UnifiedPublishStatus = artwork.deletedAt ? "ARCHIVED" : artwork.isPublished ? "PUBLISHED" : "DRAFT";
  const statusLabel = getPublisherStatusLabel(status);

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Edit Artwork</h1>
          <Badge variant={statusLabel === "Live" ? "default" : statusLabel === "Archived" ? "outline" : "secondary"}>{statusLabel}</Badge>
        </div>
        <Link href="/my/artwork" className="rounded-md border px-3 py-1 text-sm">← My artworks</Link>
      </div>
      {!readiness.ready ? <div className="rounded border bg-muted/20 p-3 text-sm">Complete required fields before publishing.</div> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <input id="title" className="w-full rounded border px-2 py-1" value={artwork.title} onChange={(e) => setArtwork({ ...artwork, title: e.target.value })} />
          <input className="w-full rounded border px-2 py-1" value={artwork.slug ?? ""} onChange={(e) => setArtwork({ ...artwork, slug: e.target.value || null })} placeholder="slug (optional)" />
          <textarea id="description" className="w-full rounded border px-2 py-1" value={artwork.description ?? ""} onChange={(e) => setArtwork({ ...artwork, description: e.target.value })} />
          <input
            className="w-full rounded border px-2 py-1"
            type="number"
            placeholder="Year (e.g. 2023)"
            value={artwork.year ?? ""}
            onChange={(e) => setArtwork({ ...artwork, year: e.target.value ? Number(e.target.value) : null })}
          />
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Medium (e.g. Oil on Canvas)"
            value={artwork.medium ?? ""}
            onChange={(e) => setArtwork({ ...artwork, medium: e.target.value || null })}
          />
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Dimensions (e.g. 60 × 80 cm)"
            value={artwork.dimensions ?? ""}
            onChange={(e) => setArtwork({ ...artwork, dimensions: e.target.value || null })}
          />
          <div className="flex gap-2">
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              placeholder="Price (whole number)"
              value={artwork.priceAmount ?? ""}
              onChange={(e) => setArtwork({ ...artwork, priceAmount: e.target.value ? Number(e.target.value) : null })}
            />
            <select
              className="rounded border px-2 py-1"
              value={artwork.currency ?? "GBP"}
              onChange={(e) => setArtwork({ ...artwork, currency: e.target.value })}
            >
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">Sale details</summary>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1">
                <span className="text-sm">Condition</span>
                <select
                  className="w-full rounded border px-2 py-1"
                  value={artwork.condition ?? ""}
                  onChange={(e) => setArtwork({ ...artwork, condition: e.target.value || null })}
                >
                  <option value="">Select condition</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm">Condition notes</span>
                <textarea
                  className="w-full rounded border px-2 py-1"
                  maxLength={500}
                  value={artwork.conditionNotes ?? ""}
                  onChange={(e) => setArtwork({ ...artwork, conditionNotes: e.target.value || null })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm">Provenance</span>
                <textarea
                  className="w-full rounded border px-2 py-1"
                  maxLength={1000}
                  value={artwork.provenance ?? ""}
                  onChange={(e) => setArtwork({ ...artwork, provenance: e.target.value || null })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm">Edition info</span>
                <input
                  className="w-full rounded border px-2 py-1"
                  maxLength={100}
                  value={artwork.editionInfo ?? ""}
                  onChange={(e) => setArtwork({ ...artwork, editionInfo: e.target.value || null })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(artwork.frameIncluded)}
                  onChange={(e) => setArtwork({ ...artwork, frameIncluded: e.target.checked })}
                />
                Frame included
              </label>
              <label className="block space-y-1">
                <span className="text-sm">Shipping notes</span>
                <textarea
                  className="w-full rounded border px-2 py-1"
                  maxLength={500}
                  value={artwork.shippingNotes ?? ""}
                  onChange={(e) => setArtwork({ ...artwork, shippingNotes: e.target.value || null })}
                />
              </label>
            </div>
          </details>
          <div className="flex gap-2">
            <button className="rounded border px-2 py-1 disabled:opacity-60" disabled={saving} onClick={() => void onSave()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <h2 id="images" className="font-semibold">Images</h2>
          <p className="text-xs text-muted-foreground">Add at least one image to publish. If cover is missing, one will be auto-selected on publish.</p>
          <ArtworkGalleryManager artworkId={artwork.id} initialImages={orderedImages.map((image) => ({ id: image.id, url: image.asset.url, alt: image.alt, assetId: image.assetId }))} initialCoverAssetId={artwork.featuredAssetId ?? null} />
        </section>
        <aside>
          <PublishPanel resourceType="artwork" id={artwork.id} status={status} title={artwork.title || "Untitled artwork"} publicUrl={`/artwork/${artwork.slug ?? artwork.id}`} onStatusChange={() => {
            void refresh();
            router.refresh();
          }} />
        </aside>
      </div>
      <ArtworkRelationsPanel artworkId={artwork.id} initialVenues={initialVenues} initialEvents={initialEvents} />
    </main>
  );
}
