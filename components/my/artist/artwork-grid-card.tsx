"use client";

import Image from "next/image";
import { Eye, EyeOff, Pencil, Star } from "lucide-react";
import { formatPrice, DEFAULT_CURRENCY } from "@/lib/format";

export type ArtworkCardData = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  isPublished: boolean;
  deletedAt: string | null;
  priceAmount: number | null;
  currency: string | null;
  isFeatured: boolean;
  coverUrl: string | null;
};

function statusConfig(status: string, isPublished: boolean, deletedAt: string | null) {
  if (deletedAt) return { label: "Archived", color: "bg-muted-foreground", bar: "bg-muted-foreground/40" };
  if (isPublished) return { label: "Published", color: "bg-emerald-500", bar: "bg-emerald-500" };
  if (status === "IN_REVIEW") return { label: "In review", color: "bg-amber-500", bar: "bg-amber-400" };
  if (status === "REJECTED") return { label: "Rejected", color: "bg-destructive", bar: "bg-destructive" };
  if (status === "CHANGES_REQUESTED") return { label: "Changes requested", color: "bg-orange-500", bar: "bg-orange-400" };
  return { label: "Draft", color: "bg-muted-foreground", bar: "bg-muted/60" };
}

export function ArtworkGridCard({
  artwork,
  onEdit,
  onTogglePublish,
  onToggleFeatured,
  publishBusy,
  featureBusy,
}: {
  artwork: ArtworkCardData;
  onEdit: (id: string) => void;
  onTogglePublish: (id: string, isPublished: boolean) => void;
  onToggleFeatured: (id: string, isFeatured: boolean) => void;
  publishBusy?: boolean;
  featureBusy?: boolean;
}) {
  const cfg = statusConfig(artwork.status, artwork.isPublished, artwork.deletedAt);
  const priceLabel = artwork.priceAmount != null
    ? formatPrice(artwork.priceAmount, artwork.currency ?? DEFAULT_CURRENCY)
    : null;
  const canTogglePublish = artwork.status !== "IN_REVIEW" && !artwork.deletedAt;

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {artwork.coverUrl
          ? <Image src={artwork.coverUrl} alt={artwork.title} fill className="object-cover transition group-hover:scale-[1.02]" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
          : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>}

        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${cfg.color}`}>
          {cfg.label}
        </span>

        {priceLabel && (
          <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">
            {priceLabel}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 hidden items-center justify-center gap-2 bg-black/60 py-2 group-hover:flex">
          <button
            type="button"
            title="Edit"
            className="rounded border border-white/30 p-1.5 text-white hover:bg-white/20"
            onClick={() => onEdit(artwork.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            title={artwork.isPublished ? "Unpublish" : "Publish"}
            className="rounded border border-white/30 p-1.5 text-white hover:bg-white/20 disabled:opacity-40"
            disabled={!canTogglePublish || publishBusy}
            onClick={() => canTogglePublish && onTogglePublish(artwork.id, artwork.isPublished)}
          >
            {artwork.isPublished
              ? <EyeOff className="h-3.5 w-3.5" />
              : <Eye className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            title={artwork.isFeatured ? "Remove from featured" : "Add to featured"}
            className="rounded border border-white/30 p-1.5 hover:bg-white/20 disabled:opacity-40"
            disabled={featureBusy}
            onClick={() => onToggleFeatured(artwork.id, artwork.isFeatured)}
          >
            <Star className={`h-3.5 w-3.5 ${artwork.isFeatured ? "fill-yellow-400 text-yellow-400" : "text-white"}`} />
          </button>
        </div>
      </div>

      <div className={`h-1 w-full ${cfg.bar}`} />

      <div className="px-3 py-2">
        <p className="line-clamp-1 text-sm font-medium">{artwork.title || "Untitled"}</p>
      </div>
    </div>
  );
}
