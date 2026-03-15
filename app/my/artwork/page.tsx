import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { ActiveFiltersBar, type FilterPill } from "@/app/my/_components/ActiveFiltersBar";
import { buildClearFiltersHref, buildRemoveFilterHref, getFirstSearchValue, toTitleCase, truncateFilterValue } from "@/app/my/_components/filter-href";
import { MyArchiveActionButton } from "@/app/my/_components/MyArchiveActionButton";
import { MyArtworkPublishToggleButton } from "@/app/my/_components/MyArtworkPublishToggleButton";
import { DEFAULT_CURRENCY, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

type ArtworkSearchParams = Promise<{ q?: string; query?: string; status?: string; sort?: string; venueId?: string; showArchived?: string }>;

export default async function MyArtworkPage({ searchParams }: { searchParams: ArtworkSearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/artwork");
  const params = await searchParams;
  const query = getFirstSearchValue(params, ["q", "query"]) ?? "";
  const status = params.status;
  const showArchived = params.showArchived === "1" || status?.toLowerCase() === "archived";
  const sort = params.sort ?? "updated";

  const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
  const items = artist
    ? await db.artwork.findMany({
        where: {
          artistId: artist.id,
          title: query ? { contains: query, mode: "insensitive" } : undefined,
          isPublished:
            status?.toLowerCase() === "published" ? true : status?.toLowerCase() === "draft" ? false : undefined,
          deletedAt: showArchived ? { not: null } : null,
        },
        orderBy: sort === "title" ? { title: "asc" } : { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          isPublished: true,
          status: true,
          updatedAt: true,
          deletedAt: true,
          priceAmount: true,
          currency: true,
          _count: { select: { venues: true, events: true } },
          featuredAsset: { select: { url: true } },
          images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { asset: { select: { url: true } } } },
        },
      })
    : [];

  const pills: FilterPill[] = [];
  if (status) {
    pills.push({
      key: "status",
      label: `Status: ${toTitleCase(status)}`,
      value: status,
      removeHref: buildRemoveFilterHref("/my/artwork", params, ["status"]),
    });
  }
  if (query) {
    pills.push({
      key: "query",
      label: `Search: \"${truncateFilterValue(query)}\"`,
      value: query,
      removeHref: buildRemoveFilterHref("/my/artwork", params, ["q", "query"]),
    });
  }

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2"><input name="q" defaultValue={query} className="h-9 rounded border px-2 text-sm" placeholder="Search artwork" /><Button size="sm">Search</Button></form>
        {(["Draft", "Published", "Archived"] as const).map((chip) => <Link key={chip} className="rounded border px-2 py-1 text-xs" href={`/my/artwork?status=${chip}${chip === "Archived" ? "&showArchived=1" : ""}`}>{chip}</Link>)}
        <Link className="rounded border px-2 py-1 text-xs" href="/my/artwork?sort=title">Sort: Title</Link>
        <Button asChild size="sm"><Link href="/my/artwork/new">Add artwork</Link></Button>
      </div>
      <ActiveFiltersBar pills={pills} clearAllHref={buildClearFiltersHref("/my/artwork", params, ["status", "q", "query", "sort", "showArchived"], ["venueId"])} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="rounded border p-3">
            {(() => {
              const coverUrl = item.featuredAsset?.url ?? item.images[0]?.asset?.url ?? null;
              return coverUrl ? (
                <div className="relative mb-2 h-28 w-full overflow-hidden rounded bg-muted">
                  <Image src={coverUrl} alt={item.title} fill className="object-cover" />
                </div>
              ) : (
                <div className="mb-2 h-28 w-full rounded bg-muted" />
              );
            })()}
            <h3 className="font-medium">{item.title}</h3>
            <p className={`text-xs font-medium ${
              item.deletedAt ? "text-muted-foreground"
              : item.isPublished ? "text-emerald-700"
              : item.status === "IN_REVIEW" ? "text-amber-700"
              : item.status === "REJECTED" ? "text-destructive"
              : item.status === "CHANGES_REQUESTED" ? "text-orange-600"
              : "text-muted-foreground"
            }`}>
              {item.deletedAt ? "Archived"
              : item.isPublished ? "Published"
              : item.status === "IN_REVIEW" ? "In review"
              : item.status === "REJECTED" ? "Rejected"
              : item.status === "CHANGES_REQUESTED" ? "Changes requested"
              : "Draft"}
            </p>
            {item.priceAmount != null && (
              <p className="text-xs text-muted-foreground">{formatPrice(item.priceAmount, item.currency ?? DEFAULT_CURRENCY)}</p>
            )}
            {(item._count.venues > 0 || item._count.events > 0) && (
              <p className="text-xs text-muted-foreground">
                {[
                  item._count.venues > 0 ? `${item._count.venues} venue${item._count.venues === 1 ? "" : "s"}` : null,
                  item._count.events > 0 ? `${item._count.events} event${item._count.events === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="mt-2 space-x-2 text-sm">
              <Link className="underline" href={`/my/artwork/${item.id}`}>
                Edit
              </Link>
              <MyArtworkPublishToggleButton artworkId={item.id} initialIsPublished={item.isPublished} status={item.status} />
              <Link className="underline" href={`/artwork/${item.slug ?? item.id}`}>
                View Public
              </Link>
              <MyArchiveActionButton entityLabel="artwork" endpointBase={`/api/my/artwork/${item.id}`} archived={!!item.deletedAt} />
            </div>
          </article>
        ))}
      </div>
      {items.length === 0 && artist && (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No artworks yet.</p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/my/artwork/new">Add your first artwork</Link>
          </Button>
        </div>
      )}
      {!artist && (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Create an artist profile to start adding artworks.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/my/artist">Create artist profile</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
