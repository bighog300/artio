import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { DuplicatesClient, type DuplicatePair } from "./duplicates-client";

export const dynamic = "force-dynamic";

export default async function AdminIngestDuplicatesPage() {
  const duplicatePairs = await db.$queryRaw<DuplicatePair[]>`
    SELECT
      a1."artistId",
      ar."name" AS "artistName",
      a1."id" AS "artworkId1",
      a1."title" AS "title1",
      a2."id" AS "artworkId2",
      a2."title" AS "title2",
      a1."year" AS "year1",
      a2."year" AS "year2",
      a1."medium" AS "medium1",
      a2."medium" AS "medium2"
    FROM "Artwork" a1
    JOIN "Artwork" a2
      ON a1."artistId" = a2."artistId"
      AND a1."id" < a2."id"
      AND a1."deletedAt" IS NULL
      AND a2."deletedAt" IS NULL
      AND LOWER(TRIM(a1."title")) = LOWER(TRIM(a2."title"))
    JOIN "Artist" ar ON ar."id" = a1."artistId"
    WHERE a1."isPublished" = true
      AND a2."isPublished" = true
      AND NOT EXISTS (
        SELECT 1
        FROM "DismissedDuplicate" dd
        WHERE (dd."artworkId1" = a1."id" AND dd."artworkId2" = a2."id")
           OR (dd."artworkId1" = a2."id" AND dd."artworkId2" = a1."id")
      )
    ORDER BY ar."name", a1."title"
    LIMIT 100
  `;

  const artworkIds = Array.from(new Set(duplicatePairs.flatMap((pair) => [pair.artworkId1, pair.artworkId2])));

  const artworkImages = artworkIds.length
    ? await db.artwork.findMany({
      where: { id: { in: artworkIds } },
      select: {
        id: true,
        featuredAsset: { select: { url: true } },
      },
    })
    : [];

  const imageByArtworkId = Object.fromEntries(
    artworkImages.map((artwork) => [artwork.id, artwork.featuredAsset?.url ?? null]),
  );

  return (
    <>
      <AdminPageHeader
        title="Duplicates"
        description="Likely duplicate published artworks based on artist and normalized title."
      />
      <DuplicatesClient duplicatePairs={duplicatePairs} imageByArtworkId={imageByArtworkId} />
    </>
  );
}
