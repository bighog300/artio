import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDbUserForSession } from "@/lib/ensure-db-user-for-session";
import { handleGetMyDashboard } from "@/lib/my-dashboard-route";

async function findPublisherApprovalNotice(userId: string) {
  try {
    return await db.notification.findFirst({
      where: {
        userId,
        dedupeKey: { startsWith: "publisher-access-approved:" },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    const missingDedupeKey = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";
    if (!missingDedupeKey) throw error;
    return db.notification.findFirst({
      where: {
        userId,
        title: "Publisher access approved",
        href: "/my",
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
  }
}



async function listEventsPipelineByUserId(userId: string) {
  const now = new Date();
  const eventSelect = Prisma.validator<Prisma.EventSelect>()({
    id: true,
    title: true,
    startAt: true,
    isPublished: true,
    updatedAt: true,
    venue: { select: { name: true } },
    submissions: {
      where: { type: "EVENT" },
      select: { status: true },
      orderBy: { updatedAt: "desc" },
      take: 1,
    },
  });

  const where = {
    venue: {
      is: {
        memberships: {
          some: {
            userId,
            role: { in: ["OWNER", "EDITOR"] },
          },
        },
      },
    },
  } satisfies Prisma.EventWhereInput;

  const upcoming = await db.event.findMany({
    where: { ...where, startAt: { gte: now } },
    select: eventSelect,
    orderBy: [{ startAt: "asc" }, { updatedAt: "desc" }],
    take: 5,
  });

  const remaining = 5 - upcoming.length;
  const fallback = remaining > 0
    ? await db.event.findMany({
      where: {
        ...where,
        id: { notIn: upcoming.map((event) => event.id) },
      },
      select: eventSelect,
      orderBy: { updatedAt: "desc" },
      take: remaining,
    })
    : [];

  return [...upcoming, ...fallback].map((event) => {
    const latestSubmission = event.submissions[0]?.status;
    return {
      id: event.id,
      title: event.title,
      startAtISO: event.startAt ? event.startAt.toISOString() : null,
      venueName: event.venue?.name ?? null,
      statusLabel: event.isPublished ? "Published" : latestSubmission === "SUBMITTED" ? "Submitted" : "Draft",
    };
  });
}

async function listVenuesQuickPickByUserId(userId: string) {
  return db.venue.findMany({
    where: {
      memberships: {
        some: {
          userId,
          role: { in: ["OWNER", "EDITOR"] },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 3,
  });
}

export const runtime = "nodejs";

export async function GET() {
  let authUser: { id: string; role: "USER" | "EDITOR" | "ADMIN" } | null = null;
  const requireAuth = async () => {
    if (authUser) return authUser;
    const session = await getSessionUser();
    if (!session) throw new Error("unauthorized");
    const dbUser = await ensureDbUserForSession(session);
    authUser = { id: dbUser?.id ?? session.id, role: session.role };
    return authUser;
  };

  const user = await requireAuth();
  const publisherApprovalNotice = await findPublisherApprovalNotice(user.id);

  return handleGetMyDashboard({
    requireAuth,
    findOwnedArtistByUserId: async (userId) => db.artist.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        websiteUrl: true,
        featuredAssetId: true,
        avatarImageUrl: true,
        featuredAsset: { select: { url: true } },
      },
    }),
    listManagedVenuesByUserId: async (userId) => db.venueMembership.findMany({
      where: { userId, role: { in: ["OWNER", "EDITOR"] } },
      select: { venueId: true },
    }).then((rows) => rows.map((row) => ({ id: row.venueId }))),
    listManagedVenueDetailsByUserId: async (userId) => db.venue.findMany({
      where: {
        memberships: {
          some: {
            userId,
            role: { in: ["OWNER", "EDITOR"] },
          },
        },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        city: true,
        country: true,
        isPublished: true,
        featuredAssetId: true,
        featuredAsset: { select: { url: true } },
        submissions: {
          where: { type: "VENUE" },
          select: { status: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ isPublished: "asc" }, { updatedAt: "desc" }],
    }),
    listArtworksByArtistId: async (artistId) => db.artwork.findMany({
      where: { artistId },
      select: {
        id: true,
        title: true,
        slug: true,
        isPublished: true,
        featuredAssetId: true,
        updatedAt: true,
        featuredAsset: { select: { url: true } },
        images: {
          select: { asset: { select: { url: true } } },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
        _count: { select: { images: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    listEventsByContext: async ({ artistId, managedVenueIds }) => db.event.findMany({
      where: {
        OR: [
          managedVenueIds.length > 0 ? { venueId: { in: managedVenueIds } } : undefined,
          { eventArtists: { some: { artistId } } },
        ].filter(Boolean) as never,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        startAt: true,
        updatedAt: true,
        isPublished: true,
        venueId: true,
        venue: { select: { name: true } },
      },
      orderBy: [{ startAt: "asc" }, { updatedAt: "desc" }],
      take: 200,
    }),
    listArtworkViewDailyRows: async (artworkIds, start) => db.pageViewDaily.findMany({
      where: {
        entityType: "ARTWORK",
        entityId: { in: artworkIds },
        day: { gte: start },
      },
      select: { entityId: true, day: true, views: true },
    }),
    getPublisherApprovalNotice: async () => publisherApprovalNotice,
    listEventsPipelineByUserId,
    listVenuesQuickPickByUserId,
  });
}
