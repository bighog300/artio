import { db } from "@/lib/db";
import { MyDashboardResponseSchema, type MyDashboardResponse, type PublisherStatus } from "@/lib/my/dashboard-schema";
import { evaluateVenueReadiness } from "@/lib/publish-readiness";


const VENUE_READINESS_LABELS: Record<string, string> = {
  "venue-name": "Name",
  "venue-city": "City",
  "venue-country": "Country",
  "venue-cover": "Cover image",
};

function toVenueCompleteness(venue: { name: string | null; city: string | null; country: string | null; featuredAssetId: string | null }) {
  const readiness = evaluateVenueReadiness(venue);
  const requiredCount = 4;
  const completedCount = Math.max(0, requiredCount - readiness.blocking.length);
  const missing = readiness.blocking.map((item) => VENUE_READINESS_LABELS[item.id] ?? item.label.replace(/^Add\s+/i, "").replace(/\.$/, ""));
  return {
    percent: Math.round((completedCount / requiredCount) * 100),
    missing,
  };
}

function mapSubmissionStatus(status: string | null | undefined, isPublished: boolean): PublisherStatus {
  if (isPublished) return "Published";
  if (status === "IN_REVIEW") return "Submitted";
  if (status === "REJECTED") return "Rejected";
  return "Draft";
}

function withAttentionTimestamps(createdAt: Date, updatedAt?: Date) {
  const createdAtISO = createdAt.toISOString();
  return {
    createdAtISO,
    updatedAtISO: (updatedAt ?? createdAt).toISOString(),
  };
}

export async function getMyDashboard({ userId, venueId }: { userId: string; venueId?: string | null }): Promise<MyDashboardResponse> {
  const memberships = await db.venueMembership.findMany({
    where: { userId, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null } },
    select: { venueId: true, role: true, venue: { select: { name: true, city: true, country: true, featuredAssetId: true, updatedAt: true, isPublished: true, submissions: { where: { type: "VENUE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { status: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  const allowedVenueIds = memberships.map((m) => m.venueId);
  const selectedVenueId = venueId && allowedVenueIds.includes(venueId) ? venueId : null;
  const scopedVenueIds = selectedVenueId ? [selectedVenueId] : allowedVenueIds;

  const artist = await db.artist.findUnique({ where: { userId }, select: { id: true } });

  const [events, artworks, pendingInvites, eventCountsByStatus, venueCountsByStatus, artworkDraftCount, artworkPublishedCount] = await Promise.all([
    db.event.findMany({
      where: {
        AND: [{ deletedAt: null }, {
          OR: [
            scopedVenueIds.length ? { venueId: { in: scopedVenueIds } } : undefined,
            artist?.id ? { eventArtists: { some: { artistId: artist.id } } } : undefined,
          ].filter(Boolean) as never,
        }],
      },
      select: {
        id: true,
        title: true,
        venueId: true,
        updatedAt: true,
        startAt: true,
        isPublished: true,
        venue: { select: { name: true } },
        submissions: { where: { type: "EVENT" }, take: 1, orderBy: { updatedAt: "desc" }, select: { status: true } },
      },
      orderBy: [{ startAt: "asc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    artist?.id
      ? db.artwork.findMany({
        where: { artistId: artist.id, deletedAt: null },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          isPublished: true,
          featuredAsset: { select: { url: true } },
          _count: { select: { images: true } },
          venues: { select: { venueId: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
      : Promise.resolve([]),
    scopedVenueIds.length
      ? db.venueInvite.findMany({ where: { venueId: { in: scopedVenueIds }, status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true, venueId: true, createdAt: true } })
      : Promise.resolve([]),
    Promise.all([
      db.event.count({ where: { deletedAt: null, venueId: scopedVenueIds.length ? { in: scopedVenueIds } : undefined, isPublished: true } }),
      db.event.count({ where: { deletedAt: null, venueId: scopedVenueIds.length ? { in: scopedVenueIds } : undefined, isPublished: false, submissions: { some: { type: "EVENT", status: "IN_REVIEW" } } } }),
      db.event.count({ where: { deletedAt: null, venueId: scopedVenueIds.length ? { in: scopedVenueIds } : undefined, isPublished: false, submissions: { some: { type: "EVENT", status: "REJECTED" } } } }),
      db.event.count({ where: { deletedAt: null, venueId: scopedVenueIds.length ? { in: scopedVenueIds } : undefined, isPublished: false, NOT: { submissions: { some: { type: "EVENT", status: { in: ["IN_REVIEW", "REJECTED"] } } } } } }),
    ]),
    Promise.all([
      db.venueMembership.count({ where: { userId, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null, isPublished: true, ...(selectedVenueId ? { id: selectedVenueId } : {}) } } }),
      db.venueMembership.count({ where: { userId, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null, isPublished: false, submissions: { some: { type: "VENUE", status: "IN_REVIEW" } }, ...(selectedVenueId ? { id: selectedVenueId } : {}) } } }),
      db.venueMembership.count({ where: { userId, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null, isPublished: false, submissions: { some: { type: "VENUE", status: "REJECTED" } }, ...(selectedVenueId ? { id: selectedVenueId } : {}) } } }),
      db.venueMembership.count({ where: { userId, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null, isPublished: false, NOT: { submissions: { some: { type: "VENUE", status: { in: ["IN_REVIEW", "REJECTED"] } } } }, ...(selectedVenueId ? { id: selectedVenueId } : {}) } } }),
    ]),
    artist?.id ? db.artwork.count({ where: { artistId: artist.id, deletedAt: null, isPublished: false } }) : Promise.resolve(0),
    artist?.id ? db.artwork.count({ where: { artistId: artist.id, deletedAt: null, isPublished: true } }) : Promise.resolve(0),
  ]);

  const venuesForContext = memberships.map((m) => ({ id: m.venueId, name: m.venue.name, role: m.role }));

  const [publishedEvents, submittedEvents, rejectedEvents, draftEvents] = eventCountsByStatus;
  const [publishedVenues, submittedVenues, rejectedVenues, draftVenues] = venueCountsByStatus;

  const counts = {
    venues: {
      Draft: draftVenues,
      Submitted: submittedVenues,
      Published: publishedVenues,
      Rejected: rejectedVenues,
    },
    events: {
      Draft: draftEvents,
      Submitted: submittedEvents,
      Published: publishedEvents,
      Rejected: rejectedEvents,
    },
    artwork: {
      Draft: artworkDraftCount,
      Published: artworkPublishedCount,
    },
  };

  const attention: MyDashboardResponse["attention"] = [];

  for (const event of events) {
    const submissionStatus = event.submissions[0]?.status;
    if (submissionStatus === "REJECTED") {
      attention.push({ id: `event-rejected-${event.id}`, kind: "rejected", entityType: "event", entityId: event.id, title: event.title, reason: "Submission was rejected and needs updates.", ctaLabel: "Fix & Resubmit", ctaHref: `/my/events/${event.id}`, venueId: event.venueId ?? undefined, ...withAttentionTimestamps(event.updatedAt) });
    } else if (submissionStatus === "IN_REVIEW") {
      attention.push({ id: `event-submitted-${event.id}`, kind: "pending_review", entityType: "event", entityId: event.id, title: event.title, reason: "Submission is pending review.", ctaLabel: "View submission", ctaHref: `/my/events/${event.id}`, venueId: event.venueId ?? undefined, ...withAttentionTimestamps(event.updatedAt) });
    } else if (!event.isPublished && !event.venueId) {
      attention.push({ id: `event-draft-${event.id}`, kind: "incomplete_draft", entityType: "event", entityId: event.id, title: event.title, reason: "Missing required fields: venue.", ctaLabel: "Complete draft", ctaHref: `/my/events/${event.id}`, venueId: undefined, ...withAttentionTimestamps(event.updatedAt) });
    }
  }

  for (const venue of memberships) {
    if (selectedVenueId && venue.venueId !== selectedVenueId) continue;
    if (venue.venue.submissions[0]?.status === "REJECTED") {
      attention.push({ id: `venue-rejected-${venue.venueId}`, kind: "rejected", entityType: "venue", entityId: venue.venueId, title: venue.venue.name, reason: "Venue submission was rejected and needs updates.", ctaLabel: "Fix & Resubmit", ctaHref: `/my/venues/${venue.venueId}`, venueId: venue.venueId, ...withAttentionTimestamps(venue.venue.updatedAt) });
    }
  }

  for (const artwork of artworks) {
    if (!artwork.isPublished && artwork._count.images === 0) {
      attention.push({ id: `artwork-draft-${artwork.id}`, kind: "incomplete_draft", entityType: "artwork", entityId: artwork.id, title: artwork.title, reason: "Missing required fields: artwork image.", ctaLabel: "Complete draft", ctaHref: `/my/artwork/${artwork.id}`, venueId: undefined, ...withAttentionTimestamps(artwork.updatedAt) });
    }
  }

  for (const invite of pendingInvites) {
    attention.push({ id: `invite-${invite.id}`, kind: "pending_invite", entityType: "team", entityId: invite.id, title: "Pending team invite", reason: "An invite is waiting for a response.", ctaLabel: "Manage team", ctaHref: `/my/team?venueId=${invite.venueId}`, venueId: invite.venueId, ...withAttentionTimestamps(invite.createdAt) });
  }

  attention.sort((a, b) => Date.parse(b.updatedAtISO ?? b.createdAtISO ?? "") - Date.parse(a.updatedAtISO ?? a.createdAtISO ?? ""));

  const recentActivity = [
    ...memberships.map((m) => ({
      id: `venue-${m.venueId}`,
      label: `Updated venue: ${m.venue.name}`,
      href: `/my/venues/${m.venueId}`,
      occurredAtISO: m.venue.updatedAt.toISOString(),
    })),
    ...events.map((e) => ({
      id: `event-${e.id}`,
      label: `Updated event: ${e.title}`,
      href: `/my/events/${e.id}`,
      occurredAtISO: e.updatedAt.toISOString(),
    })),
    ...artworks.map((a) => ({
      id: `artwork-${a.id}`,
      label: `Updated artwork: ${a.title}`,
      href: `/my/artwork/${a.id}`,
      occurredAtISO: a.updatedAt.toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.occurredAtISO) - Date.parse(a.occurredAtISO))
    .slice(0, 8);

  const payload: MyDashboardResponse = {
    context: {
      selectedVenueId,
      venues: venuesForContext,
      hasArtistProfile: Boolean(artist),
    },
    counts,
    attention: attention.slice(0, 12),
    recentActivity,
    quickLists: {
      venues: memberships
        .filter((m) => !selectedVenueId || m.venueId === selectedVenueId)
        .slice(0, 5)
        .map((m) => ({
          id: m.venueId,
          name: m.venue.name,
          role: m.role,
          status: mapSubmissionStatus(m.venue.submissions[0]?.status, m.venue.isPublished),
          updatedAtISO: m.venue.updatedAt.toISOString(),
          completeness: toVenueCompleteness({
            name: m.venue.name,
            city: m.venue.city,
            country: m.venue.country,
            featuredAssetId: m.venue.featuredAssetId,
          }),
        })),
      upcomingEvents: events
        .filter((e) => e.startAt >= new Date())
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          title: e.title,
          venueId: e.venueId,
          venueName: e.venue?.name ?? null,
          status: mapSubmissionStatus(e.submissions[0]?.status, e.isPublished),
          startAtISO: e.startAt.toISOString(),
          updatedAtISO: e.updatedAt.toISOString(),
        })),
      recentArtwork: artworks.slice(0, 6).map((a) => ({
        id: a.id,
        title: a.title,
        status: a.isPublished ? "Published" : "Draft",
        updatedAtISO: a.updatedAt.toISOString(),
        imageUrl: a.featuredAsset?.url ?? null,
      })),
    },
  };

  return MyDashboardResponseSchema.parse(payload);
}
