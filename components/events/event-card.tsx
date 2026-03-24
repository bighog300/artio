import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EventUrgencyBadge } from "@/components/events/event-urgency-badge";
import { formatEventDateRange, formatEventDayMonth } from "@/components/events/event-format";
import { getEventUrgencyStatus } from "@/lib/events/event-urgency";
import { cn } from "@/lib/utils";

type EventCardProps = {
  title: string;
  startAt: string | Date;
  endAt?: string | Date | null | undefined;
  venueName?: string | null | undefined;
  venueSlug?: string | null | undefined;
  imageUrl?: string | null;
  image?: {
    url: string | null;
    isProcessing?: boolean;
    hasFailure?: boolean;
  } | null;
  imageAlt?: string | null;
  href: string;
  badges?: string[];
  tags?: string[];
  secondaryText?: string;
  action?: ReactNode;
  distanceLabel?: string;
  className?: string;
  onOpen?: () => void;
  artworkCount?: number;
  viewArtworksHref?: string;
};

export function EventCard({ title, startAt, endAt, venueName, imageUrl, image, imageAlt, href, badges, tags, secondaryText, action, distanceLabel, className, onOpen, artworkCount = 0, viewArtworksHref }: EventCardProps) {
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  const end = endAt ? (typeof endAt === "string" ? new Date(endAt) : endAt) : undefined;
  const hasValidStart = !Number.isNaN(start.getTime());
  const dayMonth = hasValidStart ? formatEventDayMonth(start) : null;
  const dateRange = hasValidStart ? formatEventDateRange(start, end) : null;
  const chips = badges ?? tags;
  const urgencyStatus = getEventUrgencyStatus(start, end);
  const resolvedImageUrl = image?.url ?? imageUrl ?? null;
  const isImageProcessing = Boolean(image?.isProcessing);
  const hasImageFailure = Boolean(image?.hasFailure);

  return (
    <article className={cn("group overflow-hidden rounded-xl border border-border bg-card shadow-sm ui-hover-lift ui-press", className)}>
      <Link
        href={href}
        aria-label={`Open event ${title}`}
        className="block focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={onOpen}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          {resolvedImageUrl ? (
            <Image
              src={resolvedImageUrl}
              alt={imageAlt ?? title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover ui-trans motion-safe:group-hover:scale-[1.02] motion-safe:group-focus-visible:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">No event image</div>
          )}
          {isImageProcessing ? <div className="absolute bottom-2 left-3 rounded bg-background/90 px-2 py-0.5 text-[10px] text-muted-foreground">Processing image…</div> : null}
          {hasImageFailure ? <div className="absolute bottom-2 left-3 rounded bg-amber-100/95 px-2 py-0.5 text-[10px] text-amber-800">Image processing issue</div> : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          {dayMonth ? (
            <div className="absolute left-3 top-3 rounded-md bg-background/95 px-2 py-1 text-center text-xs font-semibold leading-tight text-foreground">
              <p>{dayMonth.day}</p>
              <p className="uppercase text-[10px] text-muted-foreground">{dayMonth.month}</p>
            </div>
          ) : null}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            {urgencyStatus ? <EventUrgencyBadge status={urgencyStatus} /> : null}
            {distanceLabel ? <Badge className="bg-background/90 text-foreground">{distanceLabel}</Badge> : null}
          </div>
        </div>

        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-foreground">{title}</h3>
          {dateRange ? <p className="text-sm text-muted-foreground">{dateRange}</p> : null}
          {secondaryText ? <p className="text-sm text-muted-foreground">{secondaryText}</p> : null}
          {venueName ? <p className="line-clamp-1 text-sm text-muted-foreground">{venueName}</p> : null}
          {artworkCount > 0 ? <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" />{artworkCount}</p> : null}
          {chips?.length ? (
            <div className="flex flex-wrap gap-1">
              {chips.slice(0, 2).map((badge) => (
                <Badge key={badge} variant="secondary" className="text-xs">
                  {badge}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Link>
      {action ? <div className="border-t border-border p-3">{action}</div> : null}
      {viewArtworksHref ? (
        <div className="border-t border-border px-4 py-2">
          <Link href={viewArtworksHref} className="text-sm text-muted-foreground underline hover:text-foreground">
            Browse artworks →
          </Link>
        </div>
      ) : null}
    </article>
  );
}
