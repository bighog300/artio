import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeVenuePublishBlockers } from "@/lib/publish-blockers";

export type VenueGenerationRunsDb = Pick<typeof db, "venueGenerationRun" | "venue">;

export async function getVenueGenerationRuns(deps: {
  appDb?: VenueGenerationRunsDb;
  requireAdminFn?: typeof requireAdmin;
} = {}) {
  const appDb = deps.appDb ?? db;
  const requireAdminFn = deps.requireAdminFn ?? requireAdmin;

  await requireAdminFn();
  const runs = await appDb.venueGenerationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      country: true,
      region: true,
      status: true,
      totalReturned: true,
      totalCreated: true,
      totalSkipped: true,
      totalFailed: true,
      geocodeAttempted: true,
      geocodeSucceeded: true,
      geocodeFailed: true,
      geocodeFailureBreakdown: true,
      autoPublishedCount: true,
      triggeredById: true,
      createdAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          name: true,
          city: true,
          postcode: true,
          country: true,
          status: true,
          reason: true,
          venueId: true,
          instagramUrl: true,
          facebookUrl: true,
          contactEmail: true,
          socialWarning: true,
          homepageImageStatus: true,
          homepageImageCandidateCount: true,
          geocodeStatus: true,
          geocodeErrorCode: true,
          timezoneWarning: true,
          createdAt: true,
        },
      },
    },
  });

  const createdVenueIds = [
    ...new Set(
      runs
        .flatMap((run) => run.items)
        .filter((item) => item.status === "created" && item.venueId)
        .map((item) => item.venueId as string),
    ),
  ];

  const venues = createdVenueIds.length > 0
    ? await appDb.venue.findMany({
        where: { id: { in: createdVenueIds } },
        select: { id: true, name: true, city: true, country: true, lat: true, lng: true, status: true },
      })
    : [];

  const venueMap = new Map(venues.map((venue) => [venue.id, venue]));

  const staleThreshold = Date.now() - 30 * 60 * 1000;

  return runs.map((run) => ({
    ...run,
    isStale: ["RUNNING", "PENDING"].includes(run.status) && new Date(run.createdAt).getTime() < staleThreshold,
    items: run.items.map((item) => {
      const venue = item.venueId ? venueMap.get(item.venueId) : null;
      const blockers = item.status === "created" && item.venueId
        ? computeVenuePublishBlockers(venue ?? { name: null, city: null, country: null, lat: null, lng: null }).map((blocker) => blocker.message)
        : [];
      const publishable = item.status === "created" && item.venueId
        ? blockers.length === 0 && venue?.status !== "PUBLISHED"
        : false;

      return {
        ...item,
        publishable,
        blockers,
        venueStatus: venue?.status ?? null,
      };
    }),
  }));
}
