"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateArtworkReadiness } from "@/lib/publish-readiness";
import { ArtworkGalleryManager } from "@/components/my/artwork/artwork-gallery-manager";
import { ArtworkRelationsPanel } from "@/components/my/artwork/artwork-relations-panel";
import { ArtworkEditForm, type ArtworkFormData } from "@/components/my/artwork/artwork-edit-form";
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
  const [artwork, setArtwork] = useState<Artwork>({
    ...initialArtwork,
    priceAmount: initialArtwork.priceAmount != null ? initialArtwork.priceAmount / 100 : null,
  });
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
      setArtwork({
        ...data.artwork,
        priceAmount: data.artwork.priceAmount != null ? data.artwork.priceAmount / 100 : null,
      });
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
          priceAmount: artwork.priceAmount != null ? Math.round(artwork.priceAmount * 100) : null,
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
          <ArtworkEditForm
            data={{
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
            }}
            onChange={(updated: ArtworkFormData) => setArtwork((a) => ({ ...a, ...updated }))}
          />
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
          }} requiresConfirmation />
        </aside>
      </div>
      <ArtworkRelationsPanel artworkId={artwork.id} initialVenues={initialVenues} initialEvents={initialEvents} />
    </main>
  );
}
