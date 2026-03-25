import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type EntityCardProps = {
  href: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  /** @deprecated Transitional compatibility prop; prefer structured `image`. */
  imageUrl?: string | null;
  image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
  imageAlt?: string | null;
  tags?: string[];
  action?: ReactNode;
  artworkCount?: number;
};

export function EntityCard({ href, name, subtitle, description, imageUrl, image, imageAlt, tags = [], action, artworkCount = 0 }: EntityCardProps) {
  const resolvedImageUrl = image?.url ?? imageUrl ?? null;
  const isImageProcessing = Boolean(image?.isProcessing);
  const hasImageFailure = Boolean(image?.hasFailure);
  return (
    <Card className="group overflow-hidden shadow-sm ui-hover-lift ui-press">
      <Link href={href} className="block focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div className="relative aspect-square bg-muted">
          {resolvedImageUrl ? <Image src={resolvedImageUrl} alt={imageAlt ?? name} fill className="object-cover ui-trans motion-safe:group-hover:scale-[1.02] motion-safe:group-focus-visible:scale-[1.02]" sizes="(max-width: 768px) 100vw, 33vw" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No image</div>}
          {isImageProcessing ? <div className="absolute bottom-2 left-2 rounded bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground">Processing image…</div> : null}
          {hasImageFailure ? <div className="absolute bottom-2 left-2 rounded bg-amber-100/95 px-2 py-0.5 text-[10px] text-amber-800">Image processing issue</div> : null}
        </div>
        <div className="space-y-2 p-4">
          <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          {artworkCount > 0 ? <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" />{artworkCount}</p> : null}
          {description ? <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p> : null}
          {tags.length ? <div className="flex flex-wrap gap-1">{tags.slice(0, 2).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}
        </div>
      </Link>
      {action ? <div className="border-t p-3">{action}</div> : null}
    </Card>
  );
}
