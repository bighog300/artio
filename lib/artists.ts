import { resolveImageUrl } from "@/lib/assets";
import { db } from "@/lib/db";
import {
  buildUpdatedAtIdCursorPredicate,
  UPDATED_AT_ID_ASC_ORDER_BY,
  UPDATED_AT_ID_DESC_ORDER_BY,
  type UpdatedAtIdCursor,
} from "@/lib/cursor-predicate";

export type ArtistCoverSource = {
  featuredAsset?: { url: string | null } | null;
  featuredImageUrl?: string | null;
  avatarImageUrl?: string | null;
  images?: Array<{ url?: string | null; asset?: { url: string | null } | null }>;
};

export type ArtworkSummary = {
  id: string;
  key: string;
  title: string;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  forSale: boolean;
  price: { amount: number; currency: string } | null;
  description: string | null;
  tags: string[];
  featured: boolean;
  images: Array<{ id: string; url: string | null; isPrimary: boolean; order: number }>;
  artist: { name: string; slug: string | null };
  updatedAt: Date;
};

export function resolveArtistCoverUrl(artist: ArtistCoverSource): string | null {
  if (artist.featuredAsset?.url) return artist.featuredAsset.url;
  if (artist.featuredImageUrl) return artist.featuredImageUrl;
  if (artist.avatarImageUrl) return artist.avatarImageUrl;

  const firstImage = artist.images?.find((image) => image.asset?.url || image.url);
  return firstImage?.asset?.url || firstImage?.url || null;
}

type GetArtistArtworksOptions = {
  tag?: string;
  forSale?: boolean;
  sort?: "newest" | "oldest" | "az";
  limit?: number;
  cursor?: string;
};

export async function getArtistArtworks(
  slug: string,
  opts: GetArtistArtworksOptions = {},
): Promise<{ artworks: ArtworkSummary[]; nextCursor: string | null; total: number }> {
  const artist = await db.artist.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: { id: true, slug: true, name: true },
  });
  if (!artist) return { artworks: [], nextCursor: null, total: 0 };

  const tag = opts.tag?.trim();
  const sort = opts.sort ?? "newest";
  const take = Math.min(Math.max(opts.limit ?? 24, 1), 48);

  const where = {
    artistId: artist.id,
    isPublished: true,
    deletedAt: null,
    ...(opts.forSale ? { priceAmount: { not: null } } : {}),
    ...(tag ? { medium: { contains: tag, mode: "insensitive" as const } } : {}),
  };

  let cursorItem: UpdatedAtIdCursor | null = null;
  if (opts.cursor) {
    const foundCursor = await db.artwork.findFirst({
      where: { id: opts.cursor, artistId: artist.id, isPublished: true, deletedAt: null },
      select: { id: true, updatedAt: true },
    });
    if (foundCursor) cursorItem = foundCursor;
  }

  const cursorWhere =
    sort === "oldest" ? buildUpdatedAtIdCursorPredicate(cursorItem, "asc")
      : sort === "az" && cursorItem ? [{ id: { gt: cursorItem.id } }]
      : buildUpdatedAtIdCursorPredicate(cursorItem, "desc");

  const orderBy =
    sort === "oldest" ? UPDATED_AT_ID_ASC_ORDER_BY
      : sort === "az" ? [{ title: "asc" as const }, { id: "asc" as const }]
      : UPDATED_AT_ID_DESC_ORDER_BY;

  const [items, total, featuredRows] = await Promise.all([
    db.artwork.findMany({
      where: { ...where, ...cursorWhere[0] ? cursorWhere[0] : {} },
      orderBy,
      take: take + 1,
      select: {
        id: true,
        slug: true,
        title: true,
        year: true,
        medium: true,
        dimensions: true,
        description: true,
        priceAmount: true,
        currency: true,
        updatedAt: true,
        images: {
          orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
          select: { id: true, sortOrder: true, alt: true, asset: { select: { url: true } } },
        },
      },
    }),
    db.artwork.count({ where }),
    db.artistFeaturedArtwork.findMany({ where: { artistId: artist.id }, select: { artworkId: true } }),
  ]);

  const featuredIds = new Set(featuredRows.map((row) => row.artworkId));
  const hasMore = items.length > take;
  const slice = hasMore ? items.slice(0, take) : items;

  const artworks = slice.map((item) => ({
    id: item.id,
    key: item.slug ?? item.id,
    title: item.title,
    year: item.year,
    medium: item.medium,
    dimensions: item.dimensions,
    forSale: item.priceAmount != null,
    price: item.priceAmount != null ? { amount: item.priceAmount, currency: item.currency ?? "USD" } : null,
    description: item.description,
    tags: item.medium ? [item.medium] : [],
    featured: featuredIds.has(item.id),
    images: item.images.map((image, index) => ({
      id: image.id,
      url: resolveImageUrl(image.asset?.url, null),
      isPrimary: index === 0,
      order: image.sortOrder,
    })),
    artist: { name: artist.name, slug: artist.slug },
    updatedAt: item.updatedAt,
  }));

  return {
    artworks,
    nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
    total,
  };
}
