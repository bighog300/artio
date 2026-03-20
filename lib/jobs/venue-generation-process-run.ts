import { type ContentStatus, type Prisma } from "@prisma/client";
import tzLookup from "tz-lookup";
import { db } from "@/lib/db";
import { type JobResult } from "@/lib/jobs/registry";
import { forwardGeocodeVenueAddressToLatLng } from "@/lib/geocode/forward";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { detectEventsPageUrl } from "@/lib/ingest/extraction-pipeline";
import { computeVenuePublishBlockers } from "@/lib/publish-readiness";
import { ensureUniqueVenueSlugWithDeps, slugifyVenueName } from "@/lib/venue-slug";
import { type AutoSelectDeps } from "@/lib/venue-generation/auto-select-venue-cover";
import { geocodeVenue, incrementBreakdown, normalizeSocialsAndEmail, runHomepageExtraction, toJsonOpeningHours } from "@/lib/venue-generation/generation-pipeline";

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function runVenueGenerationProcessRunJob(args: {
  runId: string;
  autoPublishOverride?: boolean;
  concurrency?: number;
  db?: typeof db;
  geocodeFn?: typeof forwardGeocodeVenueAddressToLatLng;
  fetchHtmlFn?: typeof fetchHtmlWithGuards;
  autoSelectDeps?: Partial<AutoSelectDeps>;
}): Promise<JobResult> {
  const appDb = args.db ?? db;
  const geocodeFn = args.geocodeFn ?? forwardGeocodeVenueAddressToLatLng;
  const fetchHtmlFn = args.fetchHtmlFn ?? fetchHtmlWithGuards;
  const concurrency = Math.max(1, args.concurrency ?? 5);
  const settings = await appDb.siteSettings.findUnique({
    where: { id: "default" },
    select: { venueAutoPublish: true },
  });
  const autoPublish = args.autoPublishOverride !== undefined
    ? args.autoPublishOverride
    : (settings?.venueAutoPublish ?? (process.env.VENUE_AUTO_PUBLISH === "1"));

  const run = await appDb.venueGenerationRun.findUnique({ where: { id: args.runId }, select: { id: true } });
  if (!run) {
    return { message: "run not found", metadata: { runId: args.runId, error: "run_not_found" } };
  }

  try {
    await appDb.venueGenerationRun.update({ where: { id: args.runId }, data: { status: "RUNNING" } });

    const items = await appDb.venueGenerationRunItem.findMany({
      where: { runId: args.runId, status: "pending_processing" },
      orderBy: { createdAt: "asc" },
    });

    let totalCreated = 0;
    let totalFailed = 0;
    let geocodeAttempted = 0;
    let geocodeSucceeded = 0;
    let geocodeFailed = 0;
    const geocodeFailureBreakdown: Record<string, number> = {};
    let autoPublishedCount = 0;

    for (const batch of chunk(items, concurrency)) {
      await Promise.all(
        batch.map(async (item) => {
          await appDb.venueGenerationRunItem.update({ where: { id: item.id }, data: { status: "processing" } });
          try {
            const venueData = {
              name: item.name,
              addressLine1: item.addressLine1,
              addressLine2: item.addressLine2,
              city: item.city,
              region: item.region,
              postcode: item.postcode,
              country: item.country,
              contactEmail: item.contactEmail,
              contactPhone: item.contactPhone,
              websiteUrl: item.websiteUrl,
              instagramUrl: item.instagramUrl,
              facebookUrl: item.facebookUrl,
              openingHours: item.openingHours,
              venueType: "OTHER" as const,
            };
            const normalizedSocials = normalizeSocialsAndEmail(venueData);
            const geocodeResult = await geocodeVenue(venueData, geocodeFn);

            if (geocodeResult.status !== "not_attempted") geocodeAttempted += 1;
            if (geocodeResult.status === "succeeded") geocodeSucceeded += 1;
            if (geocodeResult.status === "failed") {
              geocodeFailed += 1;
              if (geocodeResult.geocodeErrorCode) incrementBreakdown(geocodeFailureBreakdown, geocodeResult.geocodeErrorCode);
              totalFailed += 1;
              await appDb.venueGenerationRunItem.update({
                where: { id: item.id },
                data: {
                  status: "failed",
                  reason: "geocode_failed",
                  geocodeStatus: geocodeResult.status,
                  geocodeErrorCode: geocodeResult.geocodeErrorCode,
                },
              });
              return;
            }

            let timezone: string | null = null;
            let timezoneWarning: string | undefined;
            if (geocodeResult.geocoded) {
              try {
                timezone = tzLookup(geocodeResult.geocoded.lat, geocodeResult.geocoded.lng);
              } catch {
                timezoneWarning = "timezone_lookup_failed";
              }
            }

            const slug = await ensureUniqueVenueSlugWithDeps({
              findBySlug: (candidate) => appDb.venue.findUnique({ where: { slug: candidate }, select: { id: true } }),
            }, slugifyVenueName(item.name));
            if (!slug) throw new Error("slug_generation_failed");

            const created = await appDb.venue.create({
              data: {
                name: item.name,
                slug,
                addressLine1: item.addressLine1,
                addressLine2: item.addressLine2,
                city: item.city,
                region: item.region,
                postcode: item.postcode,
                country: item.country,
                contactEmail: normalizedSocials.contactEmail,
                contactPhone: item.contactPhone,
                websiteUrl: item.websiteUrl,
                instagramUrl: normalizedSocials.instagramUrl,
                facebookUrl: normalizedSocials.facebookUrl,
                openingHours: toJsonOpeningHours(item.openingHours),
                lat: geocodeResult.geocoded?.lat,
                lng: geocodeResult.geocoded?.lng,
                timezone,
                isPublished: false,
                // ONBOARDING venues are intentionally excluded from unpublished ingest cron
                // and only become eligible after explicit admin publish via onboard route.
                status: "ONBOARDING" as ContentStatus,
                aiGenerated: true,
                aiGeneratedAt: new Date(),
                claimStatus: "UNCLAIMED",
              } as Prisma.VenueCreateInput,
            });

            let homepageResult: Awaited<ReturnType<typeof runHomepageExtraction>>;
            try {
              homepageResult = await runHomepageExtraction({
                venueId: created.id,
                runItemId: item.id,
                websiteUrl: item.websiteUrl,
                fetchHtmlFn,
                db: appDb,
                autoPublish,
                autoSelectDeps: args.autoSelectDeps,
              });
            } catch {
              homepageResult = {
                homepageImageStatus: "fetch_failed",
                homepageImageCandidateCount: 0,
                details: null,
                autoSelectedCandidateId: null,
                autoPublished: false,
              };
            }

            if (homepageResult.details) {
              const detailPatch: Prisma.VenueUpdateInput = {};
              if (!normalizedSocials.instagramUrl && homepageResult.details.instagramUrl) detailPatch.instagramUrl = homepageResult.details.instagramUrl;
              if (!normalizedSocials.facebookUrl && homepageResult.details.facebookUrl) detailPatch.facebookUrl = homepageResult.details.facebookUrl;
              if (!normalizedSocials.contactEmail && homepageResult.details.contactEmail) detailPatch.contactEmail = homepageResult.details.contactEmail;
              if (homepageResult.details.description) detailPatch.description = homepageResult.details.description;
              if (homepageResult.details.openingHours && !item.openingHours) detailPatch.openingHours = toJsonOpeningHours(homepageResult.details.openingHours);
              if (Object.keys(detailPatch).length > 0) {
                await appDb.venue.update({ where: { id: created.id }, data: detailPatch });
              }
            }

            // ── Events page detection ───────────────────────────────────────────────
            let eventsPageStatus = "no_url";
            if (item.websiteUrl) {
              eventsPageStatus = "fetch_failed";
              try {
                const fetched = await fetchHtmlFn(item.websiteUrl, { maxBytes: 1_000_000 });
                const detected = detectEventsPageUrl(fetched.html, fetched.finalUrl);
                if (detected) {
                  await appDb.venue.update({
                    where: { id: created.id },
                    data: { eventsPageUrl: detected },
                  });
                  eventsPageStatus = "detected";
                } else {
                  eventsPageStatus = "not_found";
                }
              } catch {
                eventsPageStatus = "fetch_failed";
              }
            }

            if (autoPublish && homepageResult.autoSelectedCandidateId) {
              const refreshed = await appDb.venue.findFirst({
                where: { id: created.id },
                select: { id: true, name: true, city: true, country: true, lat: true, lng: true, featuredAssetId: true, status: true },
              }) as { country: string | null; lat: number | null; lng: number | null; name: string | null; city: string | null; featuredAssetId: string | null } | null;
              if (refreshed) {
                const blockers = computeVenuePublishBlockers(refreshed);
                if (blockers.length === 0 && refreshed.featuredAssetId) {
                  await appDb.venue.update({ where: { id: created.id }, data: { status: "PUBLISHED", isPublished: true } });
                  autoPublishedCount += 1;
                }
              }
            }

            totalCreated += 1;
            await appDb.venueGenerationRunItem.update({
              where: { id: item.id },
              data: {
                status: "created",
                venueId: created.id,
                geocodeStatus: geocodeResult.status,
                geocodeErrorCode: geocodeResult.geocodeErrorCode,
                timezoneWarning,
                homepageImageStatus: homepageResult.homepageImageStatus,
                homepageImageCandidateCount: homepageResult.homepageImageCandidateCount,
                eventsPageStatus,
              },
            });
          } catch (error) {
            totalFailed += 1;
            await appDb.venueGenerationRunItem.update({
              where: { id: item.id },
              data: { status: "failed", reason: error instanceof Error ? error.message : "processing_failed" },
            });
          }
        }),
      );
    }

    const totalSkipped = await appDb.venueGenerationRunItem.count({ where: { runId: args.runId, status: "skipped" } });

    await appDb.venueGenerationRun.update({
      where: { id: args.runId },
      data: {
        status: "SUCCEEDED",
        totalCreated,
        totalFailed,
        totalSkipped,
        geocodeAttempted,
        geocodeSucceeded,
        geocodeFailed,
        geocodeFailureBreakdown,
        autoPublishedCount,
      },
    });

    return {
      message: "venue generation run processed",
      metadata: { totalCreated, totalSkipped, totalFailed, geocodeSucceeded, geocodeFailed },
    };
  } catch (error) {
    await appDb.venueGenerationRun.update({ where: { id: args.runId }, data: { status: "FAILED" } }).catch(() => undefined);
    throw error;
  }
}
