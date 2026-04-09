import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { digestSnapshotItemsSchema } from "@/lib/digest";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageShell } from "@/components/ui/page-shell";
import { EventCard } from "@/components/events/event-card";
import { EventRow } from "@/components/events/event-row";
import { dateGroupLabel } from "@/lib/date-grouping";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";

async function disableSavedSearch(id: string) {
  "use server";
  const user = await requireAuth();
  await db.savedSearch.updateMany({ where: { id, userId: user.id }, data: { isEnabled: false } });
}

function periodLabel(periodKey: string) {
  return periodKey.includes("-W") ? "Weekly" : "Custom";
}

export default async function DigestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return <main className="p-6">Please <Link className="underline" href="/login">login</Link>.</main>;

  const routeParams = await params;
  const digest = await db.digestRun.findFirst({
    where: { id: routeParams.id, userId: user.id },
    include: { savedSearch: { select: { id: true, name: true } } },
  });
  if (!digest) return <main className="p-6">Digest not found.</main>;

  const items = digestSnapshotItemsSchema.parse(digest.itemsJson);
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const label = dateGroupLabel(new Date(item.startAt));
    acc[label] = [...(acc[label] ?? []), item];
    return acc;
  }, {});
  const sections = Object.entries(grouped);

  return (
    <PageShell className="page-stack">
      <PageViewTracker name="digest_opened" props={{ digestId: digest.id }} />
      <Breadcrumbs items={[{ label: "Saved Searches", href: "/saved-searches" }, { label: digest.savedSearch.name, href: `/saved-searches/${digest.savedSearch.id}` }, { label: digest.periodKey, href: `/digests/${digest.id}` }]} />

      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Digest snapshot</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{digest.savedSearch.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{digest.periodKey} · Generated {digest.createdAt.toLocaleString("en-GB", { timeZone: "UTC" })}</p>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">{periodLabel(digest.periodKey)}</span>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Events matching your saved search for <span className="font-medium text-foreground">{digest.savedSearch.name}</span>.</p>
      </section>

      <section className="page-stack">
        {sections.map(([label, dayItems], sectionIndex) => (
          <div key={label} className="section-stack">
            <h2 className="type-h3">{label}</h2>
            {sectionIndex === 0 ? (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dayItems.map((item) => (
                  <li key={`${digest.id}-${item.slug}`}>
                    <EventCard href={`/events/${item.slug}`} title={item.title} startAt={item.startAt} venueName={item.venueName} badges={["Digest"]} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="section-stack">
                {dayItems.map((item) => (
                  <li key={`${digest.id}-${item.slug}`}>
                    <EventRow href={`/events/${item.slug}`} title={item.title} startAt={item.startAt} venueName={item.venueName} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Keep this digest useful</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="rounded border border-border px-3 py-2 text-sm font-medium" href={`/saved-searches/${digest.savedSearch.id}`}>Refine search</Link>
          <Link className="rounded border border-border px-3 py-2 text-sm font-medium" href="/saved-searches">Change frequency</Link>
          <form action={disableSavedSearch.bind(null, digest.savedSearch.id)}>
            <button type="submit" className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700">Turn off updates</button>
          </form>
        </div>
      </section>
    </PageShell>
  );
}
