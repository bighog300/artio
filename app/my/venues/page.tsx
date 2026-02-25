import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { ActiveFiltersBar, type FilterPill } from "@/app/my/_components/ActiveFiltersBar";
import { buildClearFiltersHref, buildRemoveFilterHref, getFirstSearchValue, toTitleCase, truncateFilterValue } from "@/app/my/_components/filter-href";
import { MyArchiveActionButton } from "@/app/my/_components/MyArchiveActionButton";

export const dynamic = "force-dynamic";

type VenuesSearchParams = Promise<{ q?: string; query?: string; status?: string; sort?: string; venueId?: string; showArchived?: string }>;

export default async function MyVenuesPage({ searchParams }: { searchParams: VenuesSearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/venues");
  const params = await searchParams;
  const query = getFirstSearchValue(params, ["q", "query"]) ?? "";
  const status = params.status;
  const showArchived = params.showArchived === "1" || status?.toLowerCase() === "archived";
  const sort = params.sort ?? "updated";

  const memberships = await db.venueMembership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: showArchived ? { not: null } : null } },
    include: { venue: { include: { targetSubmissions: { where: { type: "VENUE" }, orderBy: { updatedAt: "desc" }, take: 1 } } } },
    orderBy: sort === "name" ? { venue: { name: "asc" } } : { venue: { updatedAt: "desc" } },
  });

  const rows = memberships.filter((m) => {
    const s = m.venue.targetSubmissions[0]?.status;
    if (status === "Draft" || status === "draft") return !m.venue.isPublished && s !== "SUBMITTED" && s !== "REJECTED";
    if (status === "Submitted" || status === "submitted") return s === "SUBMITTED";
    if (status === "Rejected" || status === "rejected") return s === "REJECTED";
    if (status === "Published" || status === "published") return m.venue.isPublished;
    if (status === "Archived" || status === "archived") return !!m.venue.deletedAt;
    return true;
  }).filter((m) => m.venue.name.toLowerCase().includes(query.toLowerCase()));

  const pills: FilterPill[] = [];
  if (status) {
    pills.push({
      key: "status",
      label: `Status: ${toTitleCase(status)}`,
      value: status,
      removeHref: buildRemoveFilterHref("/my/venues", params, ["status"]),
    });
  }
  if (query) {
    pills.push({
      key: "query",
      label: `Search: \"${truncateFilterValue(query)}\"`,
      value: query,
      removeHref: buildRemoveFilterHref("/my/venues", params, ["q", "query"]),
    });
  }

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2"><input name="q" defaultValue={query} placeholder="Search venues" className="h-9 rounded border px-2 text-sm" /><Button size="sm" type="submit">Search</Button></form>
        {(["Draft", "Submitted", "Published", "Rejected", "Archived"] as const).map((chip) => <Link key={chip} className="rounded border px-2 py-1 text-xs" href={`/my/venues?status=${chip}${chip === "Archived" ? "&showArchived=1" : ""}`}>{chip}</Link>)}
        <Link className="rounded border px-2 py-1 text-xs" href="/my/venues?sort=name">Sort: Name</Link>
        <Button asChild size="sm"><Link href="/my/venues/new">+ Create venue</Link></Button>
      </div>
      <ActiveFiltersBar pills={pills} clearAllHref={buildClearFiltersHref("/my/venues", params, ["status", "q", "query", "sort", "showArchived"], ["venueId"])} />
      <table className="w-full text-sm">
        <thead><tr className="border-b"><th className="p-2 text-left">Venue</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th></tr></thead>
        <tbody>
          {rows.map((item) => {
            const latest = item.venue.targetSubmissions[0]?.status;
            const statusLabel = item.venue.deletedAt ? "Archived" : item.venue.isPublished ? "Published" : latest === "SUBMITTED" ? "Submitted" : latest === "REJECTED" ? "Rejected" : "Draft";
            return (
              <tr key={item.id} className="border-b">
                <td className="p-2">{item.venue.name}</td>
                <td className="p-2">{statusLabel}</td>
                <td className="p-2 text-right space-x-2">
                  <Link className="underline" href={`/my/venues/${item.venue.id}`}>Edit Venue</Link>
                  <Link className="underline" href={`/my/venues/${item.venue.id}/submit-event`}>Submit Event</Link>
                  <Link className="underline" href={`/venues/${item.venue.slug}`}>View Public</Link>
                  <Link className="underline" href={`/my/team?venueId=${item.venue.id}`}>Manage Team</Link>
                  <MyArchiveActionButton entityLabel="venue" endpointBase={`/api/my/venues/${item.venue.id}`} archived={!!item.venue.deletedAt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
