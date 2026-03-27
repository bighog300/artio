import type { PrismaClient } from "@prisma/client";

export type GoalConversionStats = {
  goalId: string;
  venuesWithApprovedEvents: number;
  totalApprovedEvents: number;
};

export async function getGoalConversionStats(
  db: PrismaClient,
  goalId: string,
): Promise<GoalConversionStats> {
  const seededCandidates = await db.ingestDiscoveryCandidate.findMany({
    where: {
      seededVenueId: { not: null },
      job: { goalId },
    },
    select: { seededVenueId: true },
  });

  const venueIds = [
    ...new Set(
      seededCandidates
        .map((candidate) => candidate.seededVenueId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (venueIds.length === 0) {
    return {
      goalId,
      venuesWithApprovedEvents: 0,
      totalApprovedEvents: 0,
    };
  }

  const [venuesWithApprovedEvents, totalApprovedEvents] = await Promise.all([
    db.venue.count({
      where: {
        id: { in: venueIds },
        ingestRuns: {
          some: {
            extractedEvents: {
              some: { status: "APPROVED" },
            },
          },
        },
      },
    }),
    db.ingestExtractedEvent.count({
      where: {
        status: "APPROVED",
        run: { venueId: { in: venueIds } },
      },
    }),
  ]);

  return { goalId, venuesWithApprovedEvents, totalApprovedEvents };
}

export type RegionConversionStats = {
  region: string;
  country: string;
  venuesWithApprovedEvents: number;
  totalApprovedEvents: number;
};

export async function getRegionConversionStats(
  db: PrismaClient,
  args: { region: string; country: string },
): Promise<RegionConversionStats> {
  const whereVenue = {
    deletedAt: null,
    OR: [
      { region: { equals: args.region, mode: "insensitive" as const } },
      { city: { equals: args.region, mode: "insensitive" as const } },
    ],
  };

  const venues = await db.venue.findMany({
    where: whereVenue,
    select: { id: true },
  });

  const venueIds = venues.map((venue) => venue.id);

  if (venueIds.length === 0) {
    return {
      region: args.region,
      country: args.country,
      venuesWithApprovedEvents: 0,
      totalApprovedEvents: 0,
    };
  }

  const [venuesWithApprovedEvents, totalApprovedEvents] = await Promise.all([
    db.venue.count({
      where: {
        id: { in: venueIds },
        ingestRuns: {
          some: {
            extractedEvents: {
              some: { status: "APPROVED" },
            },
          },
        },
      },
    }),
    db.ingestExtractedEvent.count({
      where: {
        status: "APPROVED",
        run: { venueId: { in: venueIds } },
      },
    }),
  ]);

  return {
    region: args.region,
    country: args.country,
    venuesWithApprovedEvents,
    totalApprovedEvents,
  };
}
