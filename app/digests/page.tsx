import Link from "next/link";
import { digestSnapshotItemsSchema } from "@/lib/digest";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { db } from "@/lib/db";
import { EventRow } from "@/components/events/event-row";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";

function formatPeriodRange(periodKey: string, createdAt: Date) {
  const weekly = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (!weekly) return createdAt.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

  const year = Number(weekly[1]);
  const week = Number(weekly[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return `${monday.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}`;
}

export default async function DigestsPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/digests");

  const items = await db.digestRun.findMany({
    where: { userId: user.id },
    include: { savedSearch: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  return (
    <PageShell className="page-stack">
      <PageViewTracker name="digests_list_viewed" />
      <PageHeader
        title="Digests"
        subtitle="Your personalized event roundups"
        actions={<Link href="/saved-searches" className="rounded border border-border px-3 py-1.5 text-sm font-medium ui-trans ui-press hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Create saved search</Link>}
      />

      {items.length === 0 ? (
        <EmptyState title="No digests yet" description="Create a saved search to start receiving curated updates." actions={[{ label: "Create a saved search", href: "/saved-searches" }]} />
      ) : null}

      <ul className="page-stack">
        {items.map((item, index) => {
          const preview = digestSnapshotItemsSchema.safeParse(item.itemsJson);
          const previewItems = preview.success ? preview.data.slice(0, 3) : [];
          const isFresh = Date.now() - item.createdAt.getTime() < 1000 * 60 * 60 * 24;
          return (
            <li
              key={item.id}
              className={`group rounded-2xl border border-border bg-card p-6 shadow-sm ui-hover-lift ui-press ${isFresh ? "bg-amber-50/40" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.savedSearch.name}</p>
                  <h2 className="mt-1 type-h3">{item.itemCount} events this week</h2>
                  <p className="text-sm text-muted-foreground">{formatPeriodRange(item.periodKey, item.createdAt)} · Generated {item.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}</p>
                </div>
                {isFresh || index === 0 ? <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">New</span> : null}
              </div>

              {previewItems.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                  <ul className="space-y-2">
                    {previewItems.map((previewItem) => (
                      <li key={`${item.id}-${previewItem.slug}`}>
                        <EventRow href={`/events/${previewItem.slug}`} title={previewItem.title} startAt={previewItem.startAt} venueName={previewItem.venueName} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No event preview available for this digest snapshot.</p>
              )}

              <div className="mt-4">
                <Link className="rounded border border-border px-3 py-2 text-sm font-medium ui-trans ui-press hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href={`/digests/${item.id}`}>View digest</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
