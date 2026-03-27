import type { Prisma, PrismaClient } from "@prisma/client";
import type { VenueSnapshot } from "@/lib/ingest/openai-extract";
import { parseOpeningHours, validateEmail, validateSocialUrl } from "@/lib/ingest/enrichment-validators";
import { logError } from "@/lib/logging";

function toNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isStringImprovement(current: string | null | undefined, incoming: string | null): incoming is string {
  if (!incoming) return false;
  const currentValue = toNonEmptyString(current);
  if (!currentValue) return true;
  return incoming.length > currentValue.length;
}


function computeConfidence(field: string, value: string | null): number {
  if (!value) return 0.5;

  if (field === "description") {
    return value.length > 100 ? 0.9 : 0.6;
  }

  if (field === "openingHours") {
    return value.length > 30 ? 0.85 : 0.65;
  }

  if (field === "contactEmail") {
    return value.includes("@") ? 0.9 : 0.5;
  }

  return value.length > 24 ? 0.8 : 0.7;
}

export async function enrichVenueFromSnapshot(args: {
  db: PrismaClient;
  venueId: string;
  runId: string;
  sourceDomain: string | null;
  snapshot: VenueSnapshot;
}): Promise<{ enriched: boolean; changedFields: string[] }> {
  const venue = await args.db.venue.findUnique({
    where: { id: args.venueId },
    select: {
      id: true,
      description: true,
      openingHours: true,
      contactEmail: true,
      instagramUrl: true,
      facebookUrl: true,
      featuredAssetId: true,
    },
  });

  if (!venue) {
    return { enriched: false, changedFields: [] };
  }

  const changedFields: string[] = [];
  const before: Prisma.JsonObject = {};
  const after: Prisma.JsonObject = {};
  const fieldConfidence: Record<string, number> = {};
  const sourceDomain = args.sourceDomain
    ? (() => {
        try {
          return new URL(args.sourceDomain).hostname;
        } catch {
          return null;
        }
      })()
    : null;
  const venueUpdateData: Prisma.VenueUpdateInput = {
    lastEnrichedAt: new Date(),
    enrichmentSource: "ingest_snapshot",
  };

  const description = toNonEmptyString(args.snapshot.venueDescription);
  if (isStringImprovement(venue.description, description)) {
    changedFields.push("description");
    before.description = venue.description;
    after.description = description;
    venueUpdateData.description = description;
    fieldConfidence.description = computeConfidence("description", description);
  }

  const openingHours = parseOpeningHours(toNonEmptyString(args.snapshot.venueOpeningHours));
  const currentOpeningHoursRaw = (() => {
    if (!venue.openingHours || typeof venue.openingHours !== "object" || Array.isArray(venue.openingHours)) return null;
    const maybeRaw = (venue.openingHours as Record<string, unknown>).raw;
    return typeof maybeRaw === "string" ? maybeRaw : null;
  })();
  if (isStringImprovement(currentOpeningHoursRaw, openingHours?.raw ?? null)) {
    changedFields.push("openingHours");
    before.openingHours = venue.openingHours as Prisma.JsonValue;
    const nextOpeningHours = openingHours!;
    after.openingHours = nextOpeningHours as Prisma.JsonObject;
    venueUpdateData.openingHours = nextOpeningHours as Prisma.JsonObject;
    fieldConfidence.openingHours = computeConfidence("openingHours", nextOpeningHours.raw);
  }

  const contactEmail = validateEmail(toNonEmptyString(args.snapshot.venueContactEmail));
  if (isStringImprovement(venue.contactEmail, contactEmail)) {
    changedFields.push("contactEmail");
    before.contactEmail = venue.contactEmail;
    after.contactEmail = contactEmail;
    venueUpdateData.contactEmail = contactEmail;
    fieldConfidence.contactEmail = computeConfidence("contactEmail", contactEmail);
  }

  const instagramUrl = validateSocialUrl(toNonEmptyString(args.snapshot.venueInstagramUrl), "instagram.com");
  if (isStringImprovement(venue.instagramUrl, instagramUrl)) {
    changedFields.push("instagramUrl");
    before.instagramUrl = venue.instagramUrl;
    after.instagramUrl = instagramUrl;
    venueUpdateData.instagramUrl = instagramUrl;
    fieldConfidence.instagramUrl = computeConfidence("instagramUrl", instagramUrl);
  }

  const facebookUrl = validateSocialUrl(toNonEmptyString(args.snapshot.venueFacebookUrl), "facebook.com");
  if (isStringImprovement(venue.facebookUrl, facebookUrl)) {
    changedFields.push("facebookUrl");
    before.facebookUrl = venue.facebookUrl;
    after.facebookUrl = facebookUrl;
    venueUpdateData.facebookUrl = facebookUrl;
    fieldConfidence.facebookUrl = computeConfidence("facebookUrl", facebookUrl);
  }

  if (changedFields.length === 0) {
    return { enriched: false, changedFields: [] };
  }

  await args.db.$transaction(async (tx) => {
    await tx.venue.update({
      where: { id: args.venueId },
      data: venueUpdateData,
    });

    await tx.venueEnrichmentLog.create({
      data: {
        venueId: args.venueId,
        runId: args.runId,
        sourceDomain,
        changedFields,
        fieldConfidence: fieldConfidence as Prisma.InputJsonValue,
        before,
        after,
      },
    });
  });

  if (!venue.featuredAssetId) {
    try {
      const candidate = await args.db.venueHomepageImageCandidate.findFirst({
        where: { venueId: args.venueId, status: "approved" },
        orderBy: { sortOrder: "asc" },
        select: { venueImageId: true },
      });

      if (candidate?.venueImageId) {
        const venueImage = await args.db.venueImage.findUnique({
          where: { id: candidate.venueImageId },
          select: { assetId: true },
        });

        if (venueImage?.assetId) {
          await args.db.venue.update({
            where: { id: args.venueId },
            data: { featuredAssetId: venueImage.assetId },
          });
        }
      }
    } catch (error) {
      logError({ message: "venue_enrichment_featured_asset_sync_failed", error });
    }
  }

  return { enriched: true, changedFields };
}
