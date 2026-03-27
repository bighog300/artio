import type { EnrichmentEntityType, PrismaClient } from "@prisma/client";
import { buildArtistWhere, buildArtworkWhere, buildEventWhere, buildVenueWhere, type GapFilter, type StatusFilter } from "@/lib/enrichment/build-where";
import { enrichArtistBio } from "@/lib/enrichment/enrich-artist-bio";
import { enrichArtistImage } from "@/lib/enrichment/enrich-artist-image";
import { enrichArtworkDescription } from "@/lib/enrichment/enrich-artwork-description";
import { enrichArtworkImage } from "@/lib/enrichment/enrich-artwork-image";
import { enrichEventImage } from "@/lib/enrichment/enrich-event-image";
import { enrichVenueDescription } from "@/lib/enrichment/enrich-venue-description";
import type { EnrichItemResult, EnrichmentSettings } from "@/lib/enrichment/types";
import type { EnrichmentTemplateKey } from "@/lib/enrichment/templates";

export type SearchProvider = "google_pse" | "brave";

export type EnrichmentTarget = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  missingImage: boolean;
  gaps: string[];
};

type EnrichmentFnArgs = {
  db: PrismaClient;
  templateId: EnrichmentTemplateKey;
  entityId: string;
  searchProvider: SearchProvider;
  settings: EnrichmentSettings;
  dryRun?: boolean;
};

export async function runEnrichmentForTemplate(args: EnrichmentFnArgs): Promise<EnrichItemResult> {
  switch (args.templateId) {
    case "ARTIST_BIO":
      return enrichArtistBio({ db: args.db, entityId: args.entityId, searchProvider: args.searchProvider, settings: args.settings, dryRun: args.dryRun });
    case "ARTIST_IMAGE":
      return enrichArtistImage({ db: args.db, entityId: args.entityId, searchProvider: args.searchProvider, settings: args.settings, dryRun: args.dryRun });
    case "ARTWORK_DESCRIPTION":
      return enrichArtworkDescription({ db: args.db, entityId: args.entityId, searchProvider: args.searchProvider, settings: args.settings, dryRun: args.dryRun });
    case "ARTWORK_IMAGE":
      return enrichArtworkImage({ db: args.db, entityId: args.entityId, searchProvider: args.searchProvider, settings: args.settings, dryRun: args.dryRun });
    case "VENUE_DESCRIPTION":
      return enrichVenueDescription({ db: args.db, entityId: args.entityId, searchProvider: args.searchProvider, settings: args.settings, dryRun: args.dryRun });
    case "EVENT_IMAGE":
      return enrichEventImage({ db: args.db, entityId: args.entityId, searchProvider: args.searchProvider, settings: args.settings, dryRun: args.dryRun });
  }
}

function sortTargets(items: EnrichmentTarget[]): EnrichmentTarget[] {
  return [...items].sort((a, b) => {
    if (a.missingImage !== b.missingImage) return a.missingImage ? -1 : 1;
    if (a.confidenceScore !== b.confidenceScore) return a.confidenceScore - b.confidenceScore;
    return a.name.localeCompare(b.name);
  });
}

function artistConfidenceScore(args: {
  bio: string | null;
  featuredAssetId: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
}): number {
  let score = 0;
  if (args.bio?.trim()) score += 40;
  if (args.featuredAssetId) score += 30;
  if (args.websiteUrl?.trim()) score += 10;
  if (args.instagramUrl?.trim()) score += 10;
  if (args.twitterUrl?.trim()) score += 10;
  return score;
}

function venueConfidenceScore(args: {
  description: string | null;
  featuredAssetId: string | null;
  websiteUrl: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
}): number {
  let score = 0;
  if (args.description?.trim()) score += 35;
  if (args.featuredAssetId) score += 35;
  if (args.websiteUrl?.trim()) score += 10;
  if (args.addressLine1?.trim()) score += 10;
  if (args.city?.trim() && args.country?.trim()) score += 10;
  return score;
}

function eventConfidenceScore(args: {
  description: string | null;
  featuredAssetId: string | null;
  venueId: string | null;
  startAt: Date;
  endAt: Date | null;
}): number {
  let score = 0;
  if (args.description?.trim()) score += 40;
  if (args.featuredAssetId) score += 30;
  if (args.venueId) score += 20;
  if (args.startAt && args.endAt) score += 10;
  return score;
}

function gapsFromFlags(flags: string[]): string[] {
  return flags
    .filter((flag) => flag.startsWith("MISSING_"))
    .map((flag) => flag.replace("MISSING_", ""));
}

export async function countEnrichmentTargets(
  db: PrismaClient,
  args: { entityType: EnrichmentEntityType; gapFilter: GapFilter; statusFilter: StatusFilter },
): Promise<number> {
  switch (args.entityType) {
    case "ARTIST":
      return db.artist.count({ where: buildArtistWhere(args) });
    case "ARTWORK":
      return db.artwork.count({ where: buildArtworkWhere(args) });
    case "VENUE":
      return db.venue.count({ where: buildVenueWhere(args) });
    case "EVENT":
      return db.event.count({ where: buildEventWhere(args) });
  }
}

export async function getEnrichmentTargets(
  db: PrismaClient,
  args: { entityType: EnrichmentEntityType; gapFilter: GapFilter; statusFilter: StatusFilter; limit: number },
): Promise<EnrichmentTarget[]> {
  if (args.entityType === "ARTWORK") {
    const artworks = await db.artwork.findMany({
      where: buildArtworkWhere(args),
      select: {
        id: true,
        title: true,
        status: true,
        completenessScore: true,
        completenessFlags: true,
        featuredAssetId: true,
      },
      orderBy: [{ featuredAssetId: "asc" }, { completenessScore: "asc" }, { title: "asc" }],
      take: args.limit,
    });

    return artworks.map((item) => ({
      id: item.id,
      name: item.title,
      status: item.status,
      confidenceScore: item.completenessScore,
      missingImage: item.completenessFlags.includes("MISSING_IMAGE") || !item.featuredAssetId,
      gaps: gapsFromFlags(item.completenessFlags),
    }));
  }

  if (args.entityType === "ARTIST") {
    const artists = await db.artist.findMany({
      where: buildArtistWhere(args),
      select: {
        id: true,
        name: true,
        status: true,
        bio: true,
        featuredAssetId: true,
        websiteUrl: true,
        instagramUrl: true,
        twitterUrl: true,
      },
      orderBy: [{ featuredAssetId: "asc" }, { name: "asc" }],
      take: args.limit,
    });

    return sortTargets(artists.map((item) => {
      const gaps: string[] = [];
      if (!item.bio?.trim()) gaps.push("BIO");
      if (!item.featuredAssetId) gaps.push("IMAGE");
      return {
        id: item.id,
        name: item.name,
        status: item.status,
        confidenceScore: artistConfidenceScore(item),
        missingImage: !item.featuredAssetId,
        gaps,
      };
    }));
  }

  if (args.entityType === "VENUE") {
    const venues = await db.venue.findMany({
      where: buildVenueWhere(args),
      select: {
        id: true,
        name: true,
        status: true,
        description: true,
        featuredAssetId: true,
        websiteUrl: true,
        addressLine1: true,
        city: true,
        country: true,
      },
      orderBy: [{ featuredAssetId: "asc" }, { name: "asc" }],
      take: args.limit,
    });

    return sortTargets(venues.map((item) => {
      const gaps: string[] = [];
      if (!item.description?.trim()) gaps.push("DESCRIPTION");
      if (!item.featuredAssetId) gaps.push("IMAGE");
      return {
        id: item.id,
        name: item.name,
        status: item.status,
        confidenceScore: venueConfidenceScore(item),
        missingImage: !item.featuredAssetId,
        gaps,
      };
    }));
  }

  const events = await db.event.findMany({
    where: buildEventWhere(args),
    select: {
      id: true,
      title: true,
      status: true,
      description: true,
      featuredAssetId: true,
      venueId: true,
      startAt: true,
      endAt: true,
    },
    orderBy: [{ featuredAssetId: "asc" }, { startAt: "desc" }, { title: "asc" }],
    take: args.limit,
  });

  return sortTargets(events.map((item) => {
    const gaps: string[] = [];
    if (!item.description?.trim()) gaps.push("DESCRIPTION");
    if (!item.featuredAssetId) gaps.push("IMAGE");
    return {
      id: item.id,
      name: item.title,
      status: item.status,
      confidenceScore: eventConfidenceScore(item),
      missingImage: !item.featuredAssetId,
      gaps,
    };
  }));
}

export function toRunItemForeignKeys(entityType: EnrichmentEntityType, entityId: string) {
  return {
    artistId: entityType === "ARTIST" ? entityId : null,
    artworkId: entityType === "ARTWORK" ? entityId : null,
    venueId: entityType === "VENUE" ? entityId : null,
    eventId: entityType === "EVENT" ? entityId : null,
  };
}
