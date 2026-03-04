import { db } from "@/lib/db";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";

type CollectionState = "FUTURE" | "EXPIRED" | "ACTIVE" | "ALWAYS" | "DRAFT";

export function getCollectionState(collection: { isPublished: boolean; publishStartsAt: Date | null; publishEndsAt: Date | null }, now: Date): CollectionState {
  if (!collection.isPublished) return "DRAFT";
  if (collection.publishStartsAt && collection.publishStartsAt > now) return "FUTURE";
  if (collection.publishEndsAt && collection.publishEndsAt <= now) return "EXPIRED";
  if (!collection.publishStartsAt && !collection.publishEndsAt) return "ALWAYS";
  return "ACTIVE";
}

export async function getCollectionPreview(collectionId: string) {
  const collection = await db.curatedCollection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, title: true, description: true, isPublished: true, publishStartsAt: true, publishEndsAt: true, homeRank: true, showOnHome: true, showOnArtwork: true },
  });
  if (!collection) return null;

  const items = await db.curatedCollectionItem.findMany({
    where: { collectionId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      artwork: {
        select: {
          id: true,
          title: true,
          slug: true,
          isPublished: true,
          featuredAssetId: true,
          description: true,
          medium: true,
          year: true,
          images: { select: { id: true }, take: 1 },
          _count: { select: { images: true } },
        },
      },
    },
  });

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 30);
  start.setUTCHours(0, 0, 0, 0);
  const ids = items.map((item) => item.artwork.id);
  const viewRows = ids.length
    ? await db.pageViewDaily.groupBy({ by: ["entityId"], where: { entityType: "ARTWORK", entityId: { in: ids }, day: { gte: start } }, _sum: { views: true } })
    : [];
  const viewsById = new Map(viewRows.map((row) => [row.entityId, Number(row._sum.views ?? 0)]));

  return {
    collection,
    items: items.map((item) => {
      const completeness = computeArtworkCompleteness(item.artwork, item.artwork._count.images);
      return {
        artworkId: item.artwork.id,
        title: item.artwork.title,
        slug: item.artwork.slug,
        isPublished: item.artwork.isPublished,
        coverOk: Boolean(item.artwork.featuredAssetId) || item.artwork.images.length > 0,
        completeness: {
          requiredOk: completeness.required.ok,
          scorePct: completeness.scorePct,
          requiredIssues: completeness.required.issues,
        },
        views30: viewsById.get(item.artwork.id) ?? 0,
      };
    }),
  };
}

export async function getCurationQaSummary(now: Date = new Date()) {
  const [collections, items] = await Promise.all([
    db.curatedCollection.findMany({ select: { id: true, title: true, slug: true, isPublished: true, publishStartsAt: true, publishEndsAt: true, homeRank: true } }),
    db.curatedCollectionItem.findMany({
      // Cap at 2000 items — sufficient for QA analysis; avoids unbounded memory load
      take: 2000,
      select: {
        collectionId: true,
        artworkId: true,
        artwork: {
          select: {
            id: true,
            title: true,
            slug: true,
            isPublished: true,
            featuredAssetId: true,
            description: true,
            medium: true,
            year: true,
            _count: { select: { images: true } },
          },
        },
      },
    }),
  ]);
  const rankCounts = new Map<number, number>();
  for (const c of collections) {
    if (c.homeRank == null) continue;
    rankCounts.set(c.homeRank, (rankCounts.get(c.homeRank) ?? 0) + 1);
  }

  const collectionMap = new Map(collections.map((c) => [c.id, c]));
  const itemsByCollection = new Map<string, typeof items>();
  const collectionsByArtwork = new Map<string, string[]>();

  for (const item of items) {
    const list = itemsByCollection.get(item.collectionId) ?? [];
    list.push(item);
    itemsByCollection.set(item.collectionId, list);

    const seen = collectionsByArtwork.get(item.artworkId) ?? [];
    seen.push(item.collectionId);
    collectionsByArtwork.set(item.artworkId, seen);
  }

  const duplicates = Array.from(collectionsByArtwork.entries())
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([artworkId, ids]) => {
      const first = items.find((item) => item.artworkId === artworkId)?.artwork;
      const uniqueIds = Array.from(new Set(ids));
      return {
        artworkId,
        title: first?.title ?? "Untitled",
        slug: first?.slug ?? null,
        collections: uniqueIds.map((id) => {
          const collection = collectionMap.get(id);
          return { id, title: collection?.title ?? "Unknown", slug: collection?.slug ?? "", isPublished: collection?.isPublished ?? false };
        }),
      };
    });

  const duplicateSet = new Set(duplicates.map((dup) => dup.artworkId));

  const byCollection = collections.map((collection) => {
    const rows = itemsByCollection.get(collection.id) ?? [];
    let unpublishedArtworks = 0;
    let missingCover = 0;
    let publishBlocked = 0;
    let duplicatesInOtherCollections = 0;

    for (const row of rows) {
      if (!row.artwork.isPublished) unpublishedArtworks += 1;
      const hasCover = Boolean(row.artwork.featuredAssetId) || row.artwork._count.images > 0;
      if (!hasCover) missingCover += 1;
      const completeness = computeArtworkCompleteness(row.artwork, row.artwork._count.images);
      if (!completeness.required.ok) publishBlocked += 1;
      if (duplicateSet.has(row.artworkId)) duplicatesInOtherCollections += 1;
    }

    const state = getCollectionState(collection, now);
    const rankCollision = collection.homeRank != null && (rankCounts.get(collection.homeRank) ?? 0) > 1;

    const flags = [
      unpublishedArtworks > 0 ? "HAS_UNPUBLISHED" : null,
      missingCover > 0 ? "HAS_MISSING_COVER" : null,
      publishBlocked > 0 ? "HAS_PUBLISH_BLOCKED" : null,
      duplicatesInOtherCollections > 0 ? "HAS_DUPES" : null,
      state === "FUTURE" ? "SCHEDULED_FUTURE" : null,
      state === "EXPIRED" ? "EXPIRED" : null,
      rankCollision ? "RANK_COLLISION" : null,
    ].filter((value): value is string => Boolean(value));

    const suggestedActions = [
      unpublishedArtworks > 0 ? "Review unpublished artworks before publishing rail." : null,
      missingCover > 0 ? "Add featured image or gallery image to affected artworks." : null,
      publishBlocked > 0 ? "Fix required publish fields (title + image)." : null,
      duplicatesInOtherCollections > 0 ? "Consider replacing duplicate artworks across collections." : null,
      state === "FUTURE" ? "Collection is scheduled for the future; adjust start date to publish now." : null,
      state === "EXPIRED" ? "Collection has expired; clear or extend end date to republish." : null,
      rankCollision ? "Resolve homepage rank collision by saving homepage order." : null,
    ].filter((value): value is string => Boolean(value));

    return {
      id: collection.id,
      title: collection.title,
      slug: collection.slug,
      isPublished: collection.isPublished,
      state,
      pinned: collection.homeRank != null,
      homeRank: collection.homeRank,
      counts: { totalItems: rows.length, unpublishedArtworks, missingCover, publishBlocked, duplicatesInOtherCollections },
      flags,
      adminEditHref: `/admin/curation?collectionId=${collection.id}`,
      publicHref: collection.isPublished ? `/collections/${collection.slug}` : null,
      suggestedActions,
    };
  });

  return {
    totals: {
      collections: collections.length,
      publishedCollections: collections.filter((collection) => collection.isPublished).length,
      items: items.length,
    },
    byCollection,
    duplicates,
  };
}
