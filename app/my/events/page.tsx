import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ActiveFiltersBar, type FilterPill } from "@/app/my/_components/ActiveFiltersBar";
import { buildClearFiltersHref, buildRemoveFilterHref, getFirstSearchValue, toTitleCase, truncateFilterValue } from "@/app/my/_components/filter-href";
import { resolveVenueFilterLabel } from "@/app/my/_components/resolve-venue-filter-label";
import { MyArchiveActionButton } from "@/app/my/_components/MyArchiveActionButton";
import MyEventSubmitButton from "@/app/my/_components/MyEventSubmitButton";
import MyEventCreateRevisionButton from "@/app/my/_components/MyEventCreateRevisionButton";
import MyEventDuplicateButton from "@/app/my/_components/MyEventDuplicateButton";
import { VenueFilterSelect } from "@/app/my/events/_components/VenueFilterSelect";
import { getPublisherStatusLabel, type UnifiedPublishStatus } from "@/lib/publish-intent";

export const dynamic = "force-dynamic";

type EventsSearchParams = Promise<{ q?: string; query?: string; status?: string; venueId?: string; sort?: string; dateFrom?: string; dateTo?: string; showArchived?: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

function buildEventStatusWhere(status: string | undefined, showArchived: boolean): object {
  if (showArchived || status?.toLowerCase() === "archived") return { deletedAt: { not: null } };
  const base = { deletedAt: null };
  if (!status) return base;
  const s = status.toLowerCase();
  if (s === "published") return { ...base, isPublished: true };
  if (s === "submitted") return { ...base, isPublished: false, submissions: { some: { type: "EVENT", status: "IN_REVIEW" } } };
  if (s === "rejected") return { ...base, isPublished: false, submissions: { some: { type: "EVENT", status: "REJECTED" } } };
  if (s === "draft") return { ...base, isPublished: false, NOT: { submissions: { some: { type: "EVENT", status: { in: ["IN_REVIEW", "REJECTED"] } } } } };
  return base;
}

export default async function MyEventsPage({ searchParams }: { searchParams: EventsSearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/events");
  const params = await searchParams;
  const query = getFirstSearchValue(params, ["q", "query"]) ?? "";
  const { status, dateFrom, dateTo } = params;
  const rawVenueId = params.venueId;
  const venueId = rawVenueId && UUID_RE.test(rawVenueId.trim()) ? rawVenueId.trim() : undefined;
  const showArchived = params.showArchived === "1" || status?.toLowerCase() === "archived";
  const sort = params.sort ?? "upcoming";

  const memberships = await db.venueMembership.findMany({ where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } }, select: { venueId: true, venue: { select: { name: true } } } });
  const venueIds = memberships.map((v) => v.venueId);

  const events = await db.event.findMany({
    where: {
      venueId: venueId ? venueId : (venueIds.length ? { in: venueIds } : undefined),
      title: query ? { contains: query, mode: "insensitive" } : undefined,
      ...buildEventStatusWhere(status, showArchived),
    },
    select: { id: true, title: true, slug: true, startAt: true, updatedAt: true, venueId: true, deletedAt: true, venue: { select: { name: true } }, isPublished: true, submissions: { where: { type: "EVENT" }, take: 1, orderBy: { updatedAt: "desc" }, select: { status: true } } },
    orderBy: sort === "updated" ? { updatedAt: "desc" } : { startAt: "asc" },
  });

  const rows = events;

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
        <VenueFilterSelect
          memberships={memberships.map((m) => ({ venueId: m.venueId, name: m.venue.name }))}
          currentVenueId={venueId}
        />
        {(["Draft", "Submitted", "Published", "Rejected", "Archived"] as const).map((chip) => <Link key={chip} className="rounded border px-2 py-1 text-xs" href={`/my/events?status=${chip}${chip === "Archived" ? "&showArchived=1" : ""}`}>{chip}</Link>)}
        <Link className="rounded border px-2 py-1 text-xs" href="/my/events?sort=updated">Sort: Updated</Link>
        <Button asChild size="sm"><Link href="/my/events/new">+ Create event</Link></Button>
      </div>
      <ActiveFiltersBar pills={pills} clearAllHref={buildClearFiltersHref("/my/events", params, ["status", "q", "query", "sort", "dateFrom", "dateTo", "showArchived"], ["venueId"])} />
      <table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Event</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th></tr></thead><tbody>
        {rows.map((event) => {
          const submitted = event.submissions[0]?.status;
          return <tr className="border-b" key={event.id}><td className="p-2"><p className="font-medium">{event.title}</p><p className="text-xs text-muted-foreground">{event.venue?.name ?? "No venue"} · {formatDate(event.startAt)}</p></td><td className="p-2">{getPublisherStatusLabel(
  (event.deletedAt ? "ARCHIVED" : event.isPublished ? "PUBLISHED" : (submitted ?? "DRAFT")) as UnifiedPublishStatus
)}</td><td className="p-2 text-right"><div className="inline-flex items-center gap-1"><Button asChild size="sm"><Link href={`/my/events/${event.id}`}>Edit</Link></Button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="More actions">⋯</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><>
  {event.isPublished && event.slug ? <DropdownMenuItem asChild><Link href={`/events/${event.slug}`}>View public page</Link></DropdownMenuItem> : null}
  <div className="px-2 py-1"><MyEventDuplicateButton eventId={event.id} /></div>
  <div className="px-2 py-1"><MyEventSubmitButton eventId={event.id} initialLabel="Submit / Resubmit" /></div>
  {event.isPublished ? <div className="px-2 py-1"><MyEventCreateRevisionButton eventId={event.id} /></div> : null}
  <DropdownMenuSeparator />
  <div className="px-2 py-1"><MyArchiveActionButton entityLabel="event" endpointBase={`/api/my/events/${event.id}`} archived={!!event.deletedAt} /></div>
</></DropdownMenuContent></DropdownMenu></div></td></tr>;
        })}
      </tbody></table>
    </main>
  );
}
