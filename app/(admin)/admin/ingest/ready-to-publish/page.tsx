import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ReadyToPublishClient from "@/app/(admin)/admin/ingest/ready-to-publish/ready-to-publish-client";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { computeArtistCompleteness } from "@/lib/artist-completeness";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";
import { db } from "@/lib/db";
import { computeEventPublishBlockers, computeReadinessScore, computeVenuePublishBlockers } from "@/lib/publish-readiness";

export const dynamic = "force-dynamic";

type EntityType = "EVENT" | "ARTIST" | "ARTWORK" | "VENUE";
type Origin = "ingest" | "venue_generation" | "claim" | "manual";

type UnifiedRecord = {
  id: string;
  entityType: EntityType;
  title: string;
  subtitle: string | null;
  origin: Origin;
  adminHref: string;
  image: { url: string | null; isProcessing: boolean; hasFailure: boolean } | null;
  readinessScore: number;
  blockers: string[];
  warnings: string[];
  chips: string[];
  publishApiPath: string;
  remediationHref: string | null;
  remediationLabel: string | null;
};

const publishApiPath: Record<EntityType, (id: string) => string> = {
  ARTIST: (id) => `/api/admin/ingest/ready-to-publish/artists/${id}`,
  ARTWORK: (id) => `/api/admin/ingest/ready-to-publish/artworks/${id}`,
  VENUE: (id) => `/api/admin/venues/${id}/publish`,
  EVENT: (id) => `/api/admin/events/${id}/publish`,
};

const remediationHrefByType: Partial<Record<EntityType, (id: string) => string>> = {
  ARTIST: (id) => `/admin/artists/${id}`,
  ARTWORK: (id) => `/admin/artwork/${id}`,
  VENUE: (id) => `/admin/venues/${id}`,
  EVENT: (id) => `/admin/events/${id}`,
};

function deriveOrigin(
  entity: {
    isAiDiscovered?: boolean;
    isAiExtracted?: boolean;
    ingestCandidate?: { id: string } | null;
    generationRunItems?: Array<{ id: string }>;
    submissions?: Array<{ id: string }>
    targetSubmissions?: Array<{ id: string }>
  },
  entityType: EntityType,
): Origin {
  if (entityType === "ARTIST") {
    if (entity.isAiDiscovered) return "ingest";
    if (entity.submissions?.length || entity.targetSubmissions?.length) return "claim";
    return "manual";
  }
  if (entityType === "ARTWORK") {
    if (entity.ingestCandidate) return "ingest";
    return "manual";
  }
  if (entityType === "VENUE") {
    if (entity.generationRunItems?.length) return "venue_generation";
    if (entity.submissions?.length || entity.targetSubmissions?.length) return "claim";
    return "manual";
  }
  if (entityType === "EVENT") {
    if (entity.isAiExtracted) return "ingest";
    if (entity.submissions?.length || entity.targetSubmissions?.length) return "claim";
    return "manual";
  }
  return "manual";
}

function remediationLabelFromBlocker(blocker: string | undefined): string | null {
  if (!blocker) return null;
  const lower = blocker.toLowerCase();
  if (lower.includes("image") || lower.includes("avatar") || lower.includes("cover")) return "Add image";
  if (lower.includes("bio") || lower.includes("profile")) return "Complete profile";
  if (lower.includes("venue")) return "Publish venue first";
  if (lower.includes("timezone") || lower.includes("date")) return "Fix schedule details";
  if (lower.includes("country") || lower.includes("city") || lower.includes("coordinate")) return "Complete location";
  return "Fix required fields";
}

export default async function AdminReadyToPublishPage() {
  await requireAdmin();

  const [user, artistResults, artworkResults, venueResults, eventResults] = await Promise.all([
    getSessionUser(),
    db.artist.findMany({
      where: { status: "IN_REVIEW", deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        mediums: true,
        websiteUrl: true,
        instagramUrl: true,
        featuredAssetId: true,
        isAiDiscovered: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        _count: { select: { artworks: true, images: true } },
        targetSubmissions: { select: { id: true }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.artwork.findMany({
      where: { status: "IN_REVIEW", deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        medium: true,
        year: true,
        description: true,
        dimensions: true,
        provenance: true,
        featuredAssetId: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        artist: { select: { id: true, name: true, slug: true, status: true } },
        _count: { select: { images: true } },
        ingestCandidate: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.venue.findMany({
      where: { status: { in: ["IN_REVIEW", "ONBOARDING"] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        country: true,
        lat: true,
        lng: true,
        eventsPageUrl: true,
        description: true,
        featuredAssetId: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        generationRunItems: { select: { id: true }, take: 1 },
        submissions: { select: { id: true }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.event.findMany({
      where: { status: "DRAFT", isAiExtracted: true, deletedAt: null, venue: { isPublished: false } },
      select: {
        id: true,
        title: true,
        slug: true,
        startAt: true,
        timezone: true,
        featuredAssetId: true,
        description: true,
        isAiExtracted: true,
        featuredAsset: { select: { url: true, originalUrl: true, processingStatus: true, processingError: true, variants: { select: { variantName: true, url: true } } } },
        venue: { select: { id: true, name: true, slug: true, status: true, isPublished: true } },
        submissions: { select: { id: true }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  const artistRecords: UnifiedRecord[] = artistResults.map((artist) => {
    const completeness = computeArtistCompleteness({
      bio: artist.bio,
      mediums: artist.mediums,
      websiteUrl: artist.websiteUrl,
      instagramUrl: artist.instagramUrl,
      nationality: null,
      birthYear: null,
    });
    const blockers = [
      ...(artist.name.trim().length > 0 ? [] : ["Name is required."]),
      ...((artist.bio ?? "").trim().length >= 20 ? [] : ["Bio (20+ chars) is required."]),
      ...(artist.featuredAssetId ? [] : ["Profile image is required."]),
    ];
    const warnings = [
      ...(artist.websiteUrl?.trim() ? [] : ["Website is recommended."]),
      "Nationality is recommended.",
      ...(artist.mediums.length > 0 ? [] : ["At least one medium is recommended."]),
    ];
    const chips = [
      ...(artist.featuredAssetId ? ["Has image"] : []),
      ...((artist.bio ?? "").trim().length >= 20 ? ["Bio ready"] : []),
      ...(artist._count.artworks > 0 ? [`${artist._count.artworks} artwork${artist._count.artworks === 1 ? "" : "s"}`] : []),
    ];

    return {
      id: artist.id,
      entityType: "ARTIST",
      title: artist.name,
      subtitle: artist.slug,
      origin: deriveOrigin(artist, "ARTIST"),
      adminHref: `/admin/artists/${artist.id}`,
      image: resolveAssetDisplay({ asset: artist.featuredAsset, requestedVariant: "thumb" }),
      readinessScore: computeReadinessScore(blockers, warnings, completeness.score),
      blockers,
      warnings,
      chips,
      publishApiPath: publishApiPath.ARTIST(artist.id),
      remediationHref: remediationHrefByType.ARTIST?.(artist.id) ?? null,
      remediationLabel: remediationLabelFromBlocker(blockers[0]),
    };
  });

  const artworkRecords: UnifiedRecord[] = artworkResults.map((artwork) => {
    const completeness = computeArtworkCompleteness(artwork, artwork._count.images);
    const blockers = completeness.required.issues.map((issue) => issue.label);
    const warnings = completeness.recommended.issues.map((issue) => issue.label);
    const chips = [
      ...(artwork.featuredAssetId || artwork._count.images > 0 ? ["Has image"] : []),
      ...(artwork.artist?.name ? ["Linked artist"] : []),
    ];

    return {
      id: artwork.id,
      entityType: "ARTWORK",
      title: artwork.title,
      subtitle: artwork.artist?.name ?? null,
      origin: deriveOrigin(artwork, "ARTWORK"),
      adminHref: `/admin/artwork/${artwork.id}`,
      image: resolveAssetDisplay({ asset: artwork.featuredAsset, requestedVariant: "thumb" }),
      readinessScore: computeReadinessScore(blockers, warnings, completeness.scorePct),
      blockers,
      warnings,
      chips,
      publishApiPath: publishApiPath.ARTWORK(artwork.id),
      remediationHref: remediationHrefByType.ARTWORK?.(artwork.id) ?? null,
      remediationLabel: remediationLabelFromBlocker(blockers[0]),
    };
  });

  const venueRecords: UnifiedRecord[] = venueResults.map((venue) => {
    const blockers = computeVenuePublishBlockers(venue).map((item) => item.message);
    const warnings = [
      ...(venue.featuredAssetId ? [] : ["Add venue image (recommended)."]),
      ...(venue.eventsPageUrl?.trim() ? [] : ["Add events page URL (recommended)."]),
      ...((venue.description ?? "").trim().length >= 20 ? [] : ["Add description (recommended)."]),
    ];
    const checks = [
      Boolean(venue.name?.trim()),
      Boolean(venue.city?.trim()),
      Boolean(venue.country?.trim()),
      venue.lat != null && venue.lng != null,
      Boolean(venue.featuredAssetId),
      Boolean(venue.eventsPageUrl?.trim()),
      (venue.description ?? "").trim().length >= 20,
    ];
    const completenessScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    const chips = [
      ...(venue.lat != null && venue.lng != null ? ["Has coordinates"] : []),
      ...(venue.city && venue.country ? [`${venue.city}, ${venue.country}`] : []),
    ];

    return {
      id: venue.id,
      entityType: "VENUE",
      title: venue.name,
      subtitle: venue.city && venue.country ? `${venue.city}, ${venue.country}` : null,
      origin: deriveOrigin(venue, "VENUE"),
      adminHref: `/admin/venues/${venue.id}`,
      image: resolveAssetDisplay({ asset: venue.featuredAsset, requestedVariant: "thumb" }),
      readinessScore: computeReadinessScore(blockers, warnings, completenessScore),
      blockers,
      warnings,
      chips,
      publishApiPath: publishApiPath.VENUE(venue.id),
      remediationHref: remediationHrefByType.VENUE?.(venue.id) ?? null,
      remediationLabel: remediationLabelFromBlocker(blockers[0]),
    };
  });

  const eventRecords: UnifiedRecord[] = eventResults.map((event) => {
    const blockers = computeEventPublishBlockers({
      startAt: event.startAt,
      timezone: event.timezone,
      venue: event.venue,
    }).map((item) => item.message);
    const warnings = [
      ...(event.featuredAssetId ? [] : ["Add event image (recommended)."]),
      ...((event.description ?? "").trim().length >= 20 ? [] : ["Add event description (recommended)."]),
    ];
    const checks = [
      Boolean(event.startAt),
      Boolean(event.timezone?.trim()),
      event.venue?.isPublished === true || event.venue?.status === "PUBLISHED",
      Boolean(event.featuredAssetId),
      (event.description ?? "").trim().length >= 20,
    ];
    const completenessScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    const chips = [
      ...(event.startAt ? [new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(event.startAt)] : []),
      ...(event.timezone ? [event.timezone] : []),
      ...(event.venue?.name ? [`Venue: ${event.venue.name}`] : []),
    ];

    return {
      id: event.id,
      entityType: "EVENT",
      title: event.title,
      subtitle: event.venue?.name ?? null,
      origin: deriveOrigin(event, "EVENT"),
      adminHref: `/admin/events/${event.id}`,
      image: resolveAssetDisplay({ asset: event.featuredAsset, requestedVariant: "thumb" }),
      readinessScore: computeReadinessScore(blockers, warnings, completenessScore),
      blockers,
      warnings,
      chips,
      publishApiPath: publishApiPath.EVENT(event.id),
      remediationHref: remediationHrefByType.EVENT?.(event.id) ?? null,
      remediationLabel: remediationLabelFromBlocker(blockers[0]),
    };
  });

  const records = [...artistRecords, ...artworkRecords, ...venueRecords, ...eventRecords].sort((a, b) => b.readinessScore - a.readinessScore);

  return (
    <>
      <AdminPageHeader
        title="Ready to publish"
        description="All records awaiting publication — events, artists, artworks, and venues from all origins."
      />
      <ReadyToPublishClient records={records} userRole={user?.role} />
    </>
  );
}
