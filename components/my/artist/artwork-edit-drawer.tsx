"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { ArtworkEditForm, type ArtworkFormData } from "@/components/my/artwork/artwork-edit-form";
import { ArtworkGalleryManager } from "@/components/my/artwork/artwork-gallery-manager";
import { PublishPanel } from "@/components/my/PublishPanel";
import type { UnifiedPublishStatus } from "@/lib/publish-intent";
import type { ArtworkCardData } from "./artwork-grid-card";

type DrawerArtwork = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  priceAmount: number | null;
  currency: string | null;
  condition?: string | null;
  conditionNotes?: string | null;
  provenance?: string | null;
  editionInfo?: string | null;
  frameIncluded?: boolean | null;
  shippingNotes?: string | null;
  featuredAssetId: string | null;
  isPublished: boolean;
  status: string;
  deletedAt?: string | null;
  images: Array<{ id: string; alt: string | null; assetId: string; sortOrder: number; asset: { url: string } }>;
};

export function ArtworkEditDrawer({
  artworkId,
  open,
  onClose,
  onSaved,
}: {
  artworkId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Partial<ArtworkCardData> & { id: string }) => void;
}) {
  const [artwork, setArtwork] = useState<DrawerArtwork | null>(null);
  const [formData, setFormData] = useState<ArtworkFormData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingArtwork, setLoadingArtwork] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<UnifiedPublishStatus>("DRAFT");

  const loadArtwork = useCallback(async (id: string) => {
    setLoadingArtwork(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/my/artwork/${id}`);
      if (!res.ok) throw new Error("Failed to load artwork");
      const data = await res.json();
      const a: DrawerArtwork = data.artwork;
      setArtwork(a);
      setFormData({
        title: a.title,
        slug: a.slug,
        description: a.description,
        year: a.year,
        medium: a.medium,
        dimensions: a.dimensions,
        priceAmount: a.priceAmount != null ? a.priceAmount / 100 : null,
        currency: a.currency,
        condition: a.condition,
        conditionNotes: a.conditionNotes,
        provenance: a.provenance,
        editionInfo: a.editionInfo,
        frameIncluded: a.frameIncluded,
        shippingNotes: a.shippingNotes,
      });
      setStatus(a.deletedAt ? "ARCHIVED" : a.isPublished ? "PUBLISHED" : (a.status as UnifiedPublishStatus) ?? "DRAFT");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoadingArtwork(false);
    }
  }, []);

  useEffect(() => {
    if (open && artworkId) void loadArtwork(artworkId);
  }, [open, artworkId, loadArtwork]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleSave() {
    if (!artwork || !formData) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/my/artwork/${artwork.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          slug: formData.slug,
          description: formData.description,
          year: formData.year,
          medium: formData.medium,
          dimensions: formData.dimensions,
          priceAmount: formData.priceAmount != null ? Math.round(formData.priceAmount * 100) : null,
          currency: formData.currency,
          condition: formData.condition,
          conditionNotes: formData.conditionNotes,
          provenance: formData.provenance,
          editionInfo: formData.editionInfo,
          frameIncluded: formData.frameIncluded,
          shippingNotes: formData.shippingNotes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        enqueueToast({ title: body?.error?.message ?? "Save failed", variant: "error" });
        return;
      }
      enqueueToast({ title: "Artwork saved", variant: "success" });
      onSaved({
        id: artwork.id,
        title: formData.title,
        priceAmount: formData.priceAmount != null ? Math.round(formData.priceAmount * 100) : null,
        currency: formData.currency,
      });
      await loadArtwork(artwork.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-background shadow-xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Edit artwork"
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <input
            className="flex-1 bg-transparent text-lg font-semibold outline-none"
            value={formData?.title ?? ""}
            onChange={(e) => setFormData((f) => (f ? { ...f, title: e.target.value } : f))}
            placeholder="Artwork title"
          />
          {artwork && (
            <a
              href={`/artwork/${artwork.slug ?? artwork.id}`}
              target="_blank"
              className="shrink-0 text-xs text-muted-foreground underline"
              rel="noreferrer"
            >
              Public page ↗
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {loadingArtwork && (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((n) => <div key={n} className="h-10 rounded bg-muted" />)}
            </div>
          )}
          {loadError && (
            <p className="text-sm text-destructive">{loadError}</p>
          )}
          {!loadingArtwork && !loadError && formData && (
            <ArtworkEditForm data={formData} onChange={setFormData} />
          )}
          {!loadingArtwork && !loadError && artwork && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Images</h3>
              <ArtworkGalleryManager
                artworkId={artwork.id}
                initialImages={artwork.images.map((img) => ({
                  id: img.id,
                  url: img.asset.url,
                  alt: img.alt,
                  assetId: img.assetId,
                }))}
                initialCoverAssetId={artwork.featuredAssetId}
              />
            </div>
          )}
        </div>

        {!loadingArtwork && !loadError && artwork && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <PublishPanel
              resourceType="artwork"
              id={artwork.id}
              status={status}
              title={formData?.title ?? artwork.title}
              publicUrl={`/artwork/${artwork.slug ?? artwork.id}`}
              onStatusChange={(s) => setStatus(s)}
              requiresConfirmation
              compact
            />
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
