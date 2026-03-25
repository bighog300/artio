import { EntityHeaderSkeleton } from "@/components/entities/entity-header-skeleton";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { PageShell } from "@/components/ui/page-shell";

export default function Loading() {
  return (
    <PageShell className="page-stack">
      <EntityHeaderSkeleton />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="card-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </PageShell>
  );
}
