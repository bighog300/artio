import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { CollectionEntityType } from "@prisma/client";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const WINDOW_HOURS = 24;
const LIMIT = 8;

const getTrendingCollections = unstable_cache(async () => {
  const since = new Date();
  since.setHours(since.getHours() - WINDOW_HOURS);

  const interactions = await db.collectionItem.groupBy({
    by: ["collectionId"],
    where: {
      entityType: CollectionEntityType.EVENT,
      createdAt: { gte: since },
      collection: { isPublic: true },
    },
    _count: { _all: true },
    orderBy: { _count: { collectionId: "desc" } },
    take: LIMIT * 2,
  });

  if (!interactions.length) return [];

  const scoreMap = new Map(interactions.map((row) => [row.collectionId, row._count._all]));
  const collections = await db.collection.findMany({
    where: { id: { in: Array.from(scoreMap.keys()) }, isPublic: true },
    select: {
      id: true,
      title: true,
      description: true,
      user: { select: { username: true, displayName: true, isCurator: true } },
      _count: { select: { items: true } },
    },
  });

  return collections
    .map((collection) => ({
      ...collection,
      score: scoreMap.get(collection.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, LIMIT);
}, ["api-trending-collections-v1"], { revalidate: 300 });

export async function GET() {
  const items = await getTrendingCollections();
  return NextResponse.json({ items }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=60" } });
}
