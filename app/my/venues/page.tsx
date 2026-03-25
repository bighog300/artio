import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ActiveFiltersBar, type FilterPill } from "@/app/my/_components/ActiveFiltersBar";
import { buildClearFiltersHref, buildRemoveFilterHref, getFirstSearchValue, toTitleCase, truncateFilterValue } from "@/app/my/_components/filter-href";
import { MyArchiveActionButton } from "@/app/my/_components/MyArchiveActionButton";

export const dynamic = "force-dynamic";

type VenuesSearchParams = Promise<{ q?: string; query?: string; status?: string; sort?: string; venueId?: string; showArchived?: string }>;

function statusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  if (status === "Published" || status === "Live") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Submitted" || status === "Under review") return "secondary";
  return "outline";
}

function buildVenueStatusWhere(status: string | undefined): Prisma.VenueWhereInput {
  if (!status) return {};
  const s = status.toLowerCase();
  if (s === "published") return { isPublished: true };
  if (s === "submitted") return { isPublished: false, targetSubmissions: { some: { type: "VENUE", status: "IN_REVIEW" } } };
  if (s === "rejected") return { isPublished: false, targetSubmissions: { some: { type: "VENUE", status: "REJECTED" } } };
  if (s === "draft") {
    return {
      isPublished: false,
      NOT: { targetSubmissions: { some: { type: "VENUE", status: { in: ["IN_REVIEW", "REJECTED"] } } } },
    };
  }
  return {};
}

export default async function MyVenuesPage({ searchParams }: { searchParams: VenuesSearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/venues");
  const params = await searchParams;
  const query = getFirstSearchValue(params, ["q", "query"]) ?? "";
  const status = params.status;
  const showArchived = params.showArchived === "1" || status?.toLowerCase() === "archived";
  const sort = params.sort ?? "updated";

  const memberships = await db.venueMembership.findMany({
    where: {
      userId: user.id,
      role: { in: ["OWNER", "EDITOR"] },
      venue: {
        deletedAt: showArchived ? { not: null } : null,
        ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
        ...buildVenueStatusWhere(status),
      },
    },
    select: {
      id: true,
      venueId: true,
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          isPublished: true,
          deletedAt: true,
          targetSubmissions: {
            where: { type: "VENUE" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { status: true },
          },
        },
      },
    },
    orderBy: sort === "name" ? { venue: { name: "asc" } } : { venue: { updatedAt: "desc" } },
  });

  const rows = memberships;

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
        {(["Draft", "Submitted", "Published", "Rejected", "Archived"] as const).map((chip) => {
          const isActive = status?.toLowerCase() === chip.toLowerCase();
          return (
            <Link
              key={chip}
              className={isActive
                ? "rounded border border-foreground bg-foreground px-2 py-1 text-xs text-background"
                : "rounded border px-2 py-1 text-xs hover:bg-muted"}
              href={`/my/venues?status=${chip}${chip === "Archived" ? "&showArchived=1" : ""}`}
            >
              {chip}
            </Link>
          );
        })}
        <span className="select-none text-xs text-muted-foreground">Sort:</span>
        <Link className="rounded border px-2 py-1 text-xs hover:bg-muted" href="/my/venues?sort=name">Name</Link>
        <Button asChild size="sm"><Link href="/my/venues/new">+ Create venue</Link></Button>
      </div>
      <ActiveFiltersBar pills={pills} clearAllHref={buildClearFiltersHref("/my/venues", params, ["status", "q", "query", "sort", "showArchived"], ["venueId"])} />
      <table className="w-full text-sm">
        <thead><tr className="border-b"><th className="p-2 text-left">Venue</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th></tr></thead>
        <tbody>
          {rows.map((item) => {
            const latest = item.venue.targetSubmissions[0]?.status;
            const statusLabel = item.venue.deletedAt ? "Archived" : item.venue.isPublished ? "Published" : latest === "IN_REVIEW" ? "Submitted" : latest === "REJECTED" ? "Rejected" : "Draft";
            return (
              <tr key={item.id} className="border-b">
                <td className="p-2">{item.venue.name}</td>
                <td className="p-2">
                  <Badge variant={statusVariant(statusLabel)}>{statusLabel}</Badge>
                </td>
                <td className="p-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button asChild size="sm">
                      <Link href={`/my/venues/${item.venue.id}`}>Edit venue</Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" aria-label="More actions">⋯</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/my/venues/${item.venue.id}/submit-event`}>Submit Event</Link></DropdownMenuItem>
                        {item.venue.slug ? <DropdownMenuItem asChild><Link href={`/venues/${item.venue.slug}`}>View Public</Link></DropdownMenuItem> : null}
                        <DropdownMenuItem asChild><Link href={`/my/team?venueId=${item.venue.id}`}>Manage Team</Link></DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1">
                          <MyArchiveActionButton entityLabel="venue" endpointBase={`/api/my/venues/${item.venue.id}`} archived={!!item.venue.deletedAt} />
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
