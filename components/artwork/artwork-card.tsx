"use client";

import Image from "next/image";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { formatPrice } from "@/lib/format";

export type ArtworkListItem = {
  id: string;
  slug: string | null;
  title: string;
  year: number | null;
  medium: string | null;
  priceAmount: number | null;
  currency: string | null;
  coverUrl: string | null;
  views30?: number;
  artist: { id: string; name: string; slug: string };
};

type ArtworkCardProps = {
  item: ArtworkListItem;
  view: "grid" | "list";
  isSaved: boolean;
  signedIn: boolean;
  isViewsSort: boolean;
  onToggleFavorite: (id: string) => void;
};

export function ArtworkCard({
  item,
  view,
  isSaved,
  signedIn,
  isViewsSort,
  onToggleFavorite,
}: ArtworkCardProps) {
  const href = `/artwork/${item.slug ?? item.id}`;

  if (view === "list") {
    return (
      <article className="relative flex gap-3 rounded border p-3 hover:bg-muted/40">
        <Link href={href} className="shrink-0">
          <div className="relative h-20 w-28 overflow-hidden rounded bg-muted">
            {item.coverUrl ? (
              <Image
                src={item.coverUrl}
                alt={item.title}
                fill
                className="object-contain"
                sizes="112px"
              />
            ) : null}
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="block font-medium leading-tight hover:underline">
            {item.title}
          </Link>
          <Link
            href={`/artists/${item.artist.slug}`}
            className="text-sm text-muted-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {item.artist.name}
          </Link>
          <div className="mt-1 text-xs text-muted-foreground">
            {[item.year, item.medium].filter(Boolean).join(" · ")}
          </div>
          {item.priceAmount != null && item.currency ? (
            <div className="mt-1 text-sm font-medium">
              {formatPrice(item.priceAmount, item.currency)}
            </div>
          ) : null}
          {isViewsSort ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {item.views30 ?? 0} views (30d)
            </div>
          ) : null}
        </div>
        {signedIn ? (
          <button
            type="button"
            aria-label={isSaved ? "Unsave artwork" : "Save artwork"}
            aria-pressed={isSaved}
            onClick={() => onToggleFavorite(item.id)}
            className="shrink-0 self-start rounded-full border border-border bg-background/90 p-1.5 text-foreground shadow-sm hover:bg-muted"
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <article className="relative rounded border p-3 hover:bg-muted/40">
      <Link href={href} className="block">
        <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded bg-muted">
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt={item.title}
              fill
              className="object-contain"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : null}
        </div>
        <div className="font-medium">{item.title}</div>
      </Link>
      <Link
        href={`/artists/${item.artist.slug}`}
        className="text-sm text-muted-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {item.artist.name}
      </Link>
      <div className="text-xs text-muted-foreground">
        {item.year ?? ""} {item.medium ?? ""}
      </div>
      {item.priceAmount != null && item.currency ? (
        <div className="text-xs">{formatPrice(item.priceAmount, item.currency)}</div>
      ) : null}
      {isViewsSort ? (
        <div className="text-xs text-muted-foreground">
          {item.views30 ?? 0} views (30d)
        </div>
      ) : null}
      {signedIn ? (
        <button
          type="button"
          aria-label={isSaved ? "Unsave artwork" : "Save artwork"}
          aria-pressed={isSaved}
          onClick={() => onToggleFavorite(item.id)}
          className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm hover:bg-muted"
        >
          <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
        </button>
      ) : null}
    </article>
  );
}
