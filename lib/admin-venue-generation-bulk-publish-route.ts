import { apiError } from "@/lib/api";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { computeVenuePublishBlockers } from "@/lib/publish-readiness";
import { idParamSchema, zodDetails } from "@/lib/validators";

type BulkPublishDeps = {
  appDb: Pick<typeof db, "venueGenerationRun" | "venueGenerationRunItem" | "venue">;
  logAction: typeof logAdminAction;
};

const defaultDeps: BulkPublishDeps = {
  appDb: db,
  logAction: logAdminAction,
};

export async function handleAdminVenueGenerationBulkPublish(
  req: Request,
  params: { runId?: string },
  actorEmail: string,
  deps: Partial<BulkPublishDeps> = {},
) {
  const resolved = { ...defaultDeps, ...deps };

  const parsedRunId = idParamSchema.safeParse({ id: params.runId });
  if (!parsedRunId.success) {
    return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedRunId.error));
  }

  const run = await resolved.appDb.venueGenerationRun.findUnique({
    where: { id: parsedRunId.data.id },
    select: { id: true },
  });
  if (!run) return apiError(404, "not_found", "Run not found");

  const runItems = await resolved.appDb.venueGenerationRunItem.findMany({
    where: { runId: parsedRunId.data.id, status: "created", venueId: { not: null } },
    select: { venueId: true },
  });

  const venueIds = Array.from(new Set(runItems.map((item) => item.venueId).filter((venueId): venueId is string => Boolean(venueId))));
  let published = 0;
  let skipped = 0;
  const blockedVenueIds: string[] = [];

  for (const venueId of venueIds) {
    const venue = await resolved.appDb.venue.findUnique({
      where: { id: venueId },
      select: { id: true, country: true, lat: true, lng: true, name: true, city: true },
    });

    if (!venue) {
      skipped += 1;
      blockedVenueIds.push(venueId);
      continue;
    }

    const blockers = computeVenuePublishBlockers(venue);
    if (blockers.length > 0) {
      skipped += 1;
      blockedVenueIds.push(venueId);
      continue;
    }

    // Intentionally status-agnostic: both DRAFT and ONBOARDING venues can be bulk-published
    // once core blockers are cleared.
    await resolved.appDb.venue.update({
      where: { id: venueId },
      data: { status: "PUBLISHED", isPublished: true },
    });

    await resolved.logAction({
      actorEmail,
      action: "admin.venue.bulk_publish",
      targetType: "venue",
      targetId: venueId,
      req,
      metadata: { runId: parsedRunId.data.id },
    });

    published += 1;
  }

  return Response.json({ ok: true, published, skipped, blockedVenueIds });
}
