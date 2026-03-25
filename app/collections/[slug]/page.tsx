import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { CollectionSortMode, getPublishedCuratedCollectionBySlug } from "@/lib/curated-collections";
import { getArtworkPublicHref } from "@/lib/artworks";
import { collectionPageQuerySchema } from "@/lib/validators";

export const revalidate = 300; // 5 minutes, matches venue list

const sortOptions: Array<{ label: string; value: CollectionSortMode }> = [
  { label: "Curated order", value: "CURATED" },
  { label: "Most viewed (30d)", value: "VIEWS_30D_DESC" },
  { label: "Newest", value: "NEWEST" },
];

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const parsed = collectionPageQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 48, sort: "CURATED" as CollectionSortMode };

  const collection = await getPublishedCuratedCollectionBySlug(slug, {
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });
  if (!collection) notFound();

  const totalPages = Math.max(1, Math.ceil((collection.itemCount ?? 0) / query.pageSize));

  return (
    <PageShell className="page-stack">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{collection.title}</h1>
        {collection.description ? <p className="text-sm text-muted-foreground">{collection.description}</p> : null}
        <p className="text-xs text-muted-foreground">{collection.itemCount ?? collection.artworks.length} items</p>
      </div>

      <form className="flex items-center gap-2" method="get">
        <label className="text-sm" htmlFor="sort">Sort</label>
        <select id="sort" name="sort" defaultValue={query.sort} className="rounded border px-2 py-1 text-sm">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input type="hidden" name="page" value="1" />
        <button className="rounded border px-2 py-1 text-sm" type="submit">Apply</button>
      </form>

      {!collection.artworks.length ? <p className="rounded border bg-muted/40 p-4 text-sm">This collection is being updated.</p> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {collection.artworks.map((artwork) => (
            <Link key={artwork.id} href={getArtworkPublicHref(artwork)} className="rounded border p-2">
              <div className="relative mb-2 h-40 overflow-hidden rounded bg-muted">
                {artwork.coverUrl ? <Image src={artwork.coverUrl} alt={artwork.title} fill className="object-cover" unoptimized /> : null}
              </div>
              <div className="font-medium">{artwork.title}</div>
              <div className="text-xs text-muted-foreground">{artwork.artist.name}</div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span>Page {query.page} of {totalPages}</span>
          <div className="flex gap-2">
            {query.page > 1 ? <Link className="underline" href={`/collections/${slug}?sort=${query.sort}&page=${query.page - 1}&pageSize=${query.pageSize}`}>Previous</Link> : <span className="text-muted-foreground">Previous</span>}
            {query.page < totalPages ? <Link className="underline" href={`/collections/${slug}?sort=${query.sort}&page=${query.page + 1}&pageSize=${query.pageSize}`}>Next</Link> : <span className="text-muted-foreground">Next</span>}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
