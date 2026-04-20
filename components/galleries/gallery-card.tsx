import Link from "next/link";
import Image from "next/image";

type GalleryCardProps = {
  id: string;
  title: string;
  description?: string | null;
  href?: string;
  coverUrl?: string | null;
  creator: { name: string; href: string; badge?: string | null };
  itemCount: number;
  savesCount?: number;
  reason?: string;
  className?: string;
};

export function GalleryCard({
  id,
  title,
  description,
  href,
  coverUrl,
  creator,
  itemCount,
  savesCount,
  reason,
  className,
}: GalleryCardProps) {
  const targetHref = href ?? `/galleries/${id}`;

  return (
    <article className={className ?? "rounded-xl border bg-card p-3"}>
      <Link href={targetHref} className="block space-y-3">
        <div className="relative h-44 w-full overflow-hidden rounded-lg bg-muted">
          {coverUrl ? <Image src={coverUrl} alt={title} fill className="object-cover" unoptimized /> : null}
          <span className="absolute left-2 top-2 rounded-full border bg-background/90 px-2 py-0.5 text-[11px] font-medium">Gallery</span>
        </div>
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-base font-semibold">{title}</h3>
          {description ? <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p> : null}
          <p className="text-xs text-muted-foreground">
            by <span className="font-medium text-foreground">{creator.name}</span>{creator.badge ? ` · ${creator.badge}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{itemCount} works{typeof savesCount === "number" ? ` · ${savesCount} saves` : ""}</p>
          {reason ? <p className="text-xs font-medium text-muted-foreground">{reason}</p> : null}
        </div>
      </Link>
      <div className="pt-2">
        <Link href={creator.href} className="text-xs underline text-muted-foreground hover:text-foreground">
          View creator
        </Link>
      </div>
    </article>
  );
}
