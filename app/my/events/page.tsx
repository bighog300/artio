import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { ActiveFiltersBar, type FilterPill } from "@/app/my/_components/ActiveFiltersBar";
import { buildClearFiltersHref, buildRemoveFilterHref, getFirstSearchValue, toTitleCase, truncateFilterValue } from "@/app/my/_components/filter-href";
import { resolveVenueFilterLabel } from "@/app/my/_components/resolve-venue-filter-label";
import { MyArchiveActionButton } from "@/app/my/_components/MyArchiveActionButton";
import MyEventSubmitButton from "@/app/my/_components/MyEventSubmitButton";
import MyEventCreateRevisionButton from "@/app/my/_components/MyEventCreateRevisionButton";

export const dynamic = "force-dynamic";

type EventsSearchParams = Promise<{ q?: string; query?: string; status?: string; venueId?: string; sort?: string; dateFrom?: string; dateTo?: string; showArchived?: string }>;

export default async function MyEventsPage({ searchParams }: { searchParams: EventsSearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/events");
  const params = await searchParams;
  const query = getFirstSearchValue(params, ["q", "query"]) ?? "";
  const { status, venueId, dateFrom, dateTo } = params;
  const showArchived = params.showArchived === "1" || status?.toLowerCase() === "archived";
  const sort = params.sort ?? "upcoming";

  const memberships = await db.venueMembership.findMany({ where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } }, select: { venueId: true, venue: { select: { name: true } } } });
  const venueIds = memberships.map((v) => v.venueId);

  const events = await db.event.findMany({
    where: {
      venueId: venueId ? venueId : (venueIds.length ? { in: venueIds } : undefined),
      title: query ? { contains: query, mode: "insensitive" } : undefined,
      deletedAt: showArchived ? { not: null } : null,
    },
    select: { id: true, title: true, slug: true, startAt: true, updatedAt: true, venueId: true, deletedAt: true, venue: { select: { name: true } }, isPublished: true, submissions: { where: { type: "EVENT" }, take: 1, orderBy: { updatedAt: "desc" }, select: { status: true } } },
    orderBy: sort === "updated" ? { updatedAt: "desc" } : { startAt: "asc" },
  });

  const filtered = events.filter((e) => {
    const computedStatus = e.deletedAt ? "Archived" : e.isPublished ? "Published" : e.submissions[0]?.status === "REJECTED" ? "Rejected" : e.submissions[0]?.status === "IN_REVIEW" ? "Submitted" : "Draft";
    return status ? computedStatus.toLowerCase() === status.toLowerCase() : true;
  });

  const pills: FilterPill[] = [];
  if (venueId) {
    pills.push({
      key: "venueId",
      label: resolveVenueFilterLabel(
        venueId,
        memberships.map((membership) => ({ id: membership.venueId, name: membership.venue.name })),
      ),
      value: venueId,
      removeHref: buildRemoveFilterHref("/my/events", params, ["venueId"]),
    });
  }
  if (status) {
    pills.push({
      key: "status",
      label: `Status: ${toTitleCase(status)}`,
      value: status,
      removeHref: buildRemoveFilterHref("/my/events", params, ["status"]),
    });
  }
  if (query) {
    pills.push({
      key: "query",
      label: `Search: \"${truncateFilterValue(query)}\"`,
      value: query,
      removeHref: buildRemoveFilterHref("/my/events", params, ["q", "query"]),
    });
  }
  if (dateFrom || dateTo) {
    pills.push({
      key: "date",
      label: `Date: ${dateFrom ?? "…"} → ${dateTo ?? "…"}`,
      value: `${dateFrom ?? ""}|${dateTo ?? ""}`,
      removeHref: buildRemoveFilterHref("/my/events", params, ["dateFrom", "dateTo"]),
    });
  }

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2"><input className="h-9 rounded border px-2 text-sm" defaultValue={query} name="q" placeholder="Search events" /><Button size="sm">Search</Button></form>
        <select name="venueId" defaultValue={venueId ?? ""} className="h-9 rounded border px-2 text-sm"><option value="">All venues</option>{memberships.map((m) => <option key={m.venueId} value={m.venueId}>{m.venue.name}</option>)}</select>
        {(["Draft", "Submitted", "Published", "Rejected", "Archived"] as const).map((chip) => <Link key={chip} className="rounded border px-2 py-1 text-xs" href={`/my/events?status=${chip}${chip === "Archived" ? "&showArchived=1" : ""}`}>{chip}</Link>)}
        <Link className="rounded border px-2 py-1 text-xs" href="/my/events?sort=updated">Sort: Updated</Link>
        <Button asChild size="sm"><Link href="/my/events/new">+ Create event</Link></Button>
      </div>
      <ActiveFiltersBar pills={pills} clearAllHref={buildClearFiltersHref("/my/events", params, ["status", "q", "query", "sort", "dateFrom", "dateTo", "showArchived"], ["venueId"])} />
      <table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Event</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th></tr></thead><tbody>
        {filtered.map((event) => {
          const submitted = event.submissions[0]?.status;
          return <tr className="border-b" key={event.id}><td className="p-2">{event.title}<div className="text-xs text-muted-foreground">{event.venue?.name ?? "No venue"}</div></td><td className="p-2">{event.deletedAt ? "Archived" : event.isPublished ? "Published" : submitted ?? "Draft"}</td><td className="p-2 text-right space-x-2"><Link className="underline" href={`/my/events/${event.id}`}>Edit</Link><MyEventSubmitButton eventId={event.id} initialLabel="Submit/Resubmit" /><Link className="underline" href={`/events/${event.slug}`}>View Public</Link>{event.isPublished ? <MyEventCreateRevisionButton eventId={event.id} /> : null}<MyArchiveActionButton entityLabel="event" endpointBase={`/api/my/events/${event.id}`} archived={!!event.deletedAt} /></td></tr>;
        })}
      </tbody></table>
    </main>
  );
}
