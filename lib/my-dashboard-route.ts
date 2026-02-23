import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { resolveImageUrl } from "@/lib/assets";
import { computeArtworkAnalytics, type ArtworkAnalyticsInputDailyRow } from "@/lib/artwork-analytics";
import { evaluateArtistReadiness, evaluateVenueReadiness, evaluateArtworkReadiness } from "@/lib/publish-readiness";

type SessionUser = { id: string; role?: "USER" | "EDITOR" | "ADMIN" };

type ArtistRecord = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  websiteUrl: string | null;
  featuredAssetId: string | null;
  avatarImageUrl: string | null;
  featuredAsset: { url: string } | null;
};

type ArtworkRecord = {
  id: string;
  title: string;
  slug: string | null;
  isPublished: boolean;
  featuredAssetId: string | null;
  updatedAt: Date;
  featuredAsset: { url: string } | null;
  images: Array<{ asset: { url: string } }>;
  _count: { images: number };
};

type EventRecord = {
  id: string;
  title: string;
  slug: string;
  startAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  venueId: string | null;
  venue: { name: string } | null;
};

type VenueRecord = { id: string };

type ManagedVenueRecord = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  isPublished: boolean;
  featuredAssetId: string | null;
  featuredAsset: { url: string } | null;
  submissions: Array<{ status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" }>;
};

type ActionInboxItem = {
  id: string;
  label: string;
  count: number;
  href: string;
  severity: "warn" | "info";
};

type AuditRecord = {
  action: string;
  targetId: string | null;
  createdAt: Date;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  findOwnedArtistByUserId: (userId: string) => Promise<ArtistRecord | null>;
  listManagedVenuesByUserId: (userId: string) => Promise<VenueRecord[]>;
  listManagedVenueDetailsByUserId: (userId: string) => Promise<ManagedVenueRecord[]>;
  listArtworksByArtistId: (artistId: string) => Promise<ArtworkRecord[]>;
  listEventsByContext: (input: { artistId: string; managedVenueIds: string[] }) => Promise<EventRecord[]>;
  listArtworkViewDailyRows: (artworkIds: string[], start: Date) => Promise<ArtworkAnalyticsInputDailyRow[]>;
  listRecentAuditActivity?: (userId: string) => Promise<AuditRecord[]>;
  getPublisherApprovalNotice?: (userId: string) => Promise<{ id: string } | null>;
  listEventsPipelineByUserId?: (userId: string) => Promise<Array<{
    id: string;
    title: string;
    startAtISO: string | null;
    venueName: string | null;
    statusLabel: string | null;
  }>>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function mapAuditToRecent(audits: AuditRecord[]) {
  const allowlist = new Set([
    "ARTWORK_CREATED",
    "ARTWORK_UPDATED",
    "ARTWORK_PUBLISHED",
    "EVENT_CREATED",
    "EVENT_UPDATED",
    "EVENT_SUBMITTED",
    "VENUE_CREATED",
    "VENUE_UPDATED",
    "VENUE_SUBMITTED",
    "IMPORT_APPLIED",
  ]);

  return audits
    .filter((entry) => allowlist.has(entry.action))
    .slice(0, 8)
    .map((entry) => ({
      label: entry.action.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\w/g, (char) => char.toUpperCase()),
      href: entry.targetId ? `/my/${entry.targetId}` : "/my",
      occurredAtISO: entry.createdAt.toISOString(),
    }));
}

function synthesizeRecent(artworks: ArtworkRecord[], events: EventRecord[]) {
  return [
    ...artworks.slice(0, 4).map((item) => ({ label: `Updated artwork: ${item.title}`, href: `/my/artwork/${item.id}`, occurredAtISO: item.updatedAt.toISOString(), occurredAt: item.updatedAt })),
    ...events.slice(0, 4).map((item) => ({ label: `Updated event: ${item.title}`, href: `/my/events/${item.id}`, occurredAtISO: item.updatedAt.toISOString(), occurredAt: item.updatedAt })),
  ]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 8)
    .map(({ label, href, occurredAtISO }) => ({ label, href, occurredAtISO }));
}

function getProfileCompleteness(artist: ArtistRecord, publishedArtworkCount: number) {
  const checks = [
    { key: "bio", ok: Boolean(artist.bio?.trim()) },
    { key: "websiteUrl", ok: Boolean(artist.websiteUrl?.trim()) },
    { key: "avatar", ok: Boolean(artist.featuredAssetId || artist.avatarImageUrl || artist.featuredAsset?.url) },
    { key: "publishedArtwork", ok: publishedArtworkCount > 0 },
  ];
  const complete = checks.filter((item) => item.ok).length;
  return {
    completenessPct: Math.round((complete / checks.length) * 100),
    missing: checks.filter((item) => !item.ok).map((item) => item.key),
  };
}

function buildActionInbox(items: ActionInboxItem[]) {
  const severityRank: Record<ActionInboxItem["severity"], number> = { warn: 0, info: 1 };
  const priority: Record<string, number> = {
    "venue-needs-edits": 0,
    "venue-submitted": 1,
    "artwork-missing-cover": 2,
    "venue-missing-cover": 3,
    "artwork-drafts": 4,
    "event-drafts": 5,
    "events-missing-venue": 6,
    "profile-missing-avatar": 7,
    "profile-missing-bio": 8,
  };

  return items
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      const severityDiff = severityRank[a.severity] - severityRank[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return (priority[a.id] ?? Number.MAX_SAFE_INTEGER) - (priority[b.id] ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 8);
}

export async function handleGetMyDashboard(deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const artist = await deps.findOwnedArtistByUserId(user.id);
    if (!artist) {
      return NextResponse.json({
        needsOnboarding: true,
        message: "Create your artist profile to get started.",
        nextHref: "/my/artist",
      }, { headers: NO_STORE_HEADERS });
    }

    const [managedVenues, managedVenueDetails, artworks] = await Promise.all([
      deps.listManagedVenuesByUserId(user.id),
      deps.listManagedVenueDetailsByUserId(user.id),
      deps.listArtworksByArtistId(artist.id),
    ]);

    const now = new Date();
    const today = startOfUtcDay(now);
    const start90 = addDays(today, -89);
    const next30 = addDays(today, 30);

    const [events, dailyRows, audits] = await Promise.all([
      deps.listEventsByContext({ artistId: artist.id, managedVenueIds: managedVenues.map((venue) => venue.id) }),
      artworks.length > 0 ? deps.listArtworkViewDailyRows(artworks.map((artwork) => artwork.id), start90) : Promise.resolve([]),
      deps.listRecentAuditActivity ? deps.listRecentAuditActivity(user.id) : Promise.resolve([]),
    ]);
    const [publisherApprovalNotice, eventsPipelineItems] = await Promise.all([
      deps.getPublisherApprovalNotice
        ? deps.getPublisherApprovalNotice(user.id)
        : Promise.resolve(null),
      deps.listEventsPipelineByUserId
        ? deps.listEventsPipelineByUserId(user.id)
        : Promise.resolve(null),
    ]);

    const analytics = computeArtworkAnalytics(
      artworks.map((item) => ({ id: item.id, title: item.title, slug: item.slug, isPublished: item.isPublished })),
      dailyRows,
      now,
    );

    const publishedArtworkCount = artworks.filter((item) => item.isPublished).length;
    const artworkDraftCount = artworks.length - publishedArtworkCount;
    const missingCoverCount = artworks.filter((item) => evaluateArtworkReadiness({ title: item.title, featuredAssetId: item.featuredAssetId, medium: null, year: null }, item._count.images > 0 ? [{ id: "img" }] : []).blocking.some((check) => check.id === "artwork-images" || check.id === "artwork-cover")).length;

    const upcomingEvents = events
      .filter((item) => item.startAt >= today && item.startAt <= next30)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const draftEventCount = events.filter((item) => !item.isPublished).length;
    const missingVenueCount = events.filter((item) => !item.venueId).length;

    const managedVenueIds = new Set(managedVenues.map((venue) => venue.id));
    const venueList = managedVenueDetails
      .filter((venue) => managedVenueIds.has(venue.id))
      .map((venue) => {
      const submissionStatus = venue.submissions[0]?.status ?? null;
      return {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        city: venue.city,
        country: venue.country,
        isPublished: venue.isPublished,
        coverUrl: resolveImageUrl(venue.featuredAsset?.url, null),
        submissionStatus,
      };
      });
    const venuePublishedCount = venueList.filter((venue) => venue.isPublished).length;
    const venueDraftCount = venueList.filter((venue) => !venue.isPublished).length;
    const venueIncompleteCount = venueList.filter((venue) => !evaluateVenueReadiness({ name: venue.name, city: venue.city, country: venue.country, featuredAssetId: venue.coverUrl ? "cover" : null }).ready).length;
    const venueMissingCoverCount = venueList.filter((venue) => !venue.coverUrl).length;
    const venueSubmissionsPending = venueList.filter((venue) => venue.submissionStatus === "SUBMITTED").length;
    const venueSubmissionsNeedsEdits = venueList.filter((venue) => venue.submissionStatus === "REJECTED").length;
    const artistReadiness = evaluateArtistReadiness({ name: artist.name, bio: artist.bio, featuredAssetId: artist.featuredAssetId, websiteUrl: artist.websiteUrl });
    const profileMissingAvatarCount = artistReadiness.blocking.some((item) => item.id === "artist-avatar") ? 1 : 0;
    const profileMissingBioCount = artistReadiness.blocking.some((item) => item.id === "artist-bio") ? 1 : 0;

    const actionInbox = buildActionInbox([
      { id: "artwork-missing-cover", label: "Artworks missing cover", count: missingCoverCount, href: "/my/artwork?filter=missingCover", severity: "warn" },
      { id: "artwork-drafts", label: "Draft artworks", count: artworkDraftCount, href: "/my/artwork?filter=draft", severity: "warn" },
      { id: "events-missing-venue", label: "Events missing venue", count: missingVenueCount, href: "/my/events?filter=missingVenue", severity: "warn" },
      { id: "event-drafts", label: "Draft events", count: draftEventCount, href: "/my/events?filter=draft", severity: "warn" },
      { id: "venue-incomplete", label: "Venue incomplete", count: venueIncompleteCount, href: "/my/venues?filter=missingCover", severity: "warn" },
      { id: "venue-missing-cover", label: "Venues missing cover", count: venueMissingCoverCount, href: "/my/venues?filter=missingCover", severity: "warn" },
      { id: "venue-needs-edits", label: "Venue submissions needing edits", count: venueSubmissionsNeedsEdits, href: "/my/venues?filter=needsEdits", severity: "warn" },
      { id: "venue-submitted", label: "Venue submissions pending moderation", count: venueSubmissionsPending, href: "/my/venues?filter=submitted", severity: "warn" },
      { id: "profile-missing-avatar", label: "Artist profile missing avatar", count: profileMissingAvatarCount, href: "/my/artist#avatar", severity: "info" },
      { id: "profile-missing-bio", label: "Artist profile missing bio", count: profileMissingBioCount, href: "/my/artist#bio", severity: "info" },
    ]);

    const recent = mapAuditToRecent(audits);
    const topArtworks30 = analytics.views.top30.slice(0, 5).map((item) => {
      const artwork = artworks.find((entry) => entry.id === item.artworkId);
      return {
        id: item.artworkId,
        slug: item.slug,
        title: item.title,
        coverUrl: resolveImageUrl(artwork?.featuredAsset?.url, artwork?.images[0]?.asset.url ?? null),
        views30: item.views,
      };
    });

    return NextResponse.json({
      viewer: {
        role: user.role ?? "USER",
      },
      artist: {
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
        avatarUrl: resolveImageUrl(artist.featuredAsset?.url, artist.avatarImageUrl),
      },
      stats: {
        artworks: {
          total: artworks.length,
          published: publishedArtworkCount,
          drafts: artworkDraftCount,
          missingCover: missingCoverCount,
        },
        events: {
          total: events.length,
          upcoming30: upcomingEvents.length,
          drafts: draftEventCount,
          missingVenue: missingVenueCount,
          nextEvent: upcomingEvents[0]
            ? {
              id: upcomingEvents[0].id,
              title: upcomingEvents[0].title,
              startAtISO: upcomingEvents[0].startAt.toISOString(),
              venueName: upcomingEvents[0].venue?.name ?? null,
            }
            : undefined,
        },
        venues: {
          totalManaged: venueList.length,
          published: venuePublishedCount,
          drafts: venueDraftCount,
          submissionsPending: venueSubmissionsPending,
        },
        views: {
          last7: analytics.views.last7,
          last30: analytics.views.last30,
          last90: analytics.views.last90,
        },
        profile: getProfileCompleteness(artist, publishedArtworkCount),
      },
      actionInbox,
      topArtworks30,
      entities: {
        venues: venueList,
      },
      recent: recent.length > 0 ? recent : synthesizeRecent(artworks, events),
      eventsPipeline: eventsPipelineItems
        ? {
          items: eventsPipelineItems,
        }
        : undefined,
      links: {
        addArtworkHref: "/my/artwork/new",
        addEventHref: "/my/events/new",
        analyticsHref: "/my/analytics",
        artworksHref: "/my/artwork",
        eventsHref: "/my/events",
        artistHref: "/my/artist",
        venuesNewHref: "/my/venues/new",
        venuesHref: "/my/venues",
      },
      publisher: publisherApprovalNotice
        ? {
          approval: {
            showBanner: true,
            noticeId: publisherApprovalNotice.id,
          },
        }
        : undefined,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
