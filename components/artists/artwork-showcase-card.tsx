import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import type { ArtworkSummary } from "@/lib/artists";

export function ArtworkShowcaseCard({
  artwork,
  view,
  onClick,
}: {
  artwork: ArtworkSummary;
  view: "grid" | "list";
  onClick: () => void;
}) {
  const cover = artwork.images[0]?.url;
  const priceLabel = artwork.price ? `${artwork.price.currency} ${artwork.price.amount.toLocaleString()}` : null;

  if (view === "list") {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:bg-muted/40">
        <div className="relative h-[90px] w-[120px] flex-none overflow-hidden rounded bg-muted">
          {cover ? <Image src={cover} alt={artwork.title} fill className="object-cover" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="line-clamp-1 text-base font-semibold">{artwork.title}</h3>
            {artwork.featured ? <Badge variant="secondary">Featured</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{[artwork.year, artwork.medium].filter(Boolean).join(" • ")}</p>
          {artwork.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{artwork.description}</p> : null}
          {priceLabel ? <Badge>{priceLabel}</Badge> : <Badge variant="outline">Not for sale</Badge>}
        </div>
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className="group w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:bg-muted/40">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {cover ? <Image src={cover} alt={artwork.title} fill className="object-cover" /> : null}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
          <span>{artwork.images.length} image{artwork.images.length === 1 ? "" : "s"}</span>
          {artwork.featured ? <span>Featured</span> : null}
        </div>
        {priceLabel ? <div className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">{priceLabel}</div> : null}
      </div>
      <div className="space-y-2 p-3">
        <h3 className="line-clamp-1 text-base font-semibold">{artwork.title}</h3>
        <p className="text-sm text-muted-foreground">{[artwork.year, artwork.medium].filter(Boolean).join(" • ")}</p>
        {artwork.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{artwork.description}</p> : null}
        {artwork.tags.length ? <div className="flex flex-wrap gap-1">{artwork.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}
      </div>
    </button>
  );
}
