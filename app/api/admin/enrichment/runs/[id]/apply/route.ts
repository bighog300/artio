import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { importApprovedArtistImage } from "@/lib/ingest/import-approved-artist-image";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { importApprovedEventImage } from "@/lib/ingest/import-approved-event-image";

export const runtime = "nodejs";

export const enrichmentApplyRouteDeps = {
  requireAdmin,
  db,
  importApprovedArtistImage,
  importApprovedArtworkImage,
  importApprovedEventImage,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitizeArtistPatch(patch: Record<string, unknown>) {
  const next: {
    bio?: string;
    websiteUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
    mediums?: string[];
    featuredAssetId?: string;
    completenessUpdatedAt?: null;
  } = {};
  if (typeof patch.bio === "string") next.bio = patch.bio;
  if (typeof patch.websiteUrl === "string") next.websiteUrl = patch.websiteUrl;
  if (typeof patch.instagramUrl === "string") next.instagramUrl = patch.instagramUrl;
  if (typeof patch.twitterUrl === "string") next.twitterUrl = patch.twitterUrl;
  if (Array.isArray(patch.mediums)) next.mediums = patch.mediums.filter((m): m is string => typeof m === "string");
  if (typeof patch.featuredAssetId === "string" && patch.featuredAssetId !== "PENDING_IMAGE") next.featuredAssetId = patch.featuredAssetId;
  next.completenessUpdatedAt = null;
  return next;
}

function sanitizeArtworkPatch(patch: Record<string, unknown>) {
  const next: { description?: string; completenessUpdatedAt?: null } = {};
  if (typeof patch.description === "string") next.description = patch.description;
  if (Object.prototype.hasOwnProperty.call(patch, "completenessUpdatedAt")) next.completenessUpdatedAt = null;
  return next;
}

function sanitizeVenuePatch(patch: Record<string, unknown>) {
  const next: {
    description?: string;
    featuredAssetId?: string;
    completenessUpdatedAt?: null;
  } = {};
  if (typeof patch.description === "string") next.description = patch.description;
  if (typeof patch.featuredAssetId === "string" && patch.featuredAssetId !== "PENDING_IMAGE") next.featuredAssetId = patch.featuredAssetId;
  next.completenessUpdatedAt = null;
  return next;
}

function sanitizeEventPatch(patch: Record<string, unknown>) {
  const next: { featuredAssetId?: string } = {};
  if (typeof patch.featuredAssetId === "string" && patch.featuredAssetId !== "PENDING_IMAGE") next.featuredAssetId = patch.featuredAssetId;
  return next;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await enrichmentApplyRouteDeps.requireAdmin();
    const { id } = await params;

    const run = await enrichmentApplyRouteDeps.db.enrichmentRun.findUnique({
      where: { id },
      include: {
        items: {
          where: { status: "STAGED" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            artist: { select: { id: true, name: true, websiteUrl: true, instagramUrl: true } },
            artwork: { select: { id: true, title: true, ingestCandidate: { select: { id: true, sourceUrl: true, imageUrl: true } } } },
            event: {
              select: {
                id: true,
                title: true,
                venueId: true,
                ingestExtractedCandidate: { select: { id: true, runId: true, sourceUrl: true, imageUrl: true } },
                venue: { select: { websiteUrl: true } },
              },
            },
          },
        },
      },
    });

    if (!run) return apiError(404, "not_found", "Run not found");
    if (run.status !== "STAGED") return apiError(400, "invalid_request", "Run is not staged");

    let successItems = 0;
    let failedItems = 0;

    for (const item of run.items) {
      try {
        const fieldsAfter = asRecord(item.fieldsAfter);

        if (item.entityType === "ARTIST" && item.artistId) {
          if (fieldsAfter.featuredAssetId === "PENDING_IMAGE") {
            const artist = item.artist;
            if (!artist) throw new Error("artist_not_found");
            const imageResult = await enrichmentApplyRouteDeps.importApprovedArtistImage({
              appDb: enrichmentApplyRouteDeps.db,
              artistId: item.artistId,
              name: artist.name,
              websiteUrl: artist.websiteUrl,
              instagramUrl: artist.instagramUrl,
              sourceUrl: item.searchUrl,
              requestId: `enrichment-apply-${item.id}`,
            });
            if (!imageResult.attached) throw new Error(imageResult.warning ?? "image_import_failed");
          } else {
            const patch = sanitizeArtistPatch(fieldsAfter);
            if (Object.keys(patch).length > 0) {
              await enrichmentApplyRouteDeps.db.artist.update({ where: { id: item.artistId }, data: patch });
            }
          }
        }

        if (item.entityType === "ARTWORK" && item.artworkId) {
          if (fieldsAfter.featuredAssetId === "PENDING_IMAGE") {
            const artwork = item.artwork;
            if (!artwork) throw new Error("artwork_not_found");
            const imageResult = await enrichmentApplyRouteDeps.importApprovedArtworkImage({
              appDb: enrichmentApplyRouteDeps.db,
              artworkId: item.artworkId,
              candidateId: artwork.ingestCandidate?.id ?? artwork.id,
              runId: artwork.ingestCandidate?.id ?? artwork.id,
              title: artwork.title,
              sourceUrl: artwork.ingestCandidate?.sourceUrl ?? item.searchUrl,
              candidateImageUrl: artwork.ingestCandidate?.imageUrl ?? null,
              requestId: `enrichment-apply-${item.id}`,
            });
            if (!imageResult.attached) throw new Error(imageResult.warning ?? "image_import_failed");
          } else {
            const patch = sanitizeArtworkPatch(fieldsAfter);
            if (Object.keys(patch).length > 0) {
              await enrichmentApplyRouteDeps.db.artwork.update({ where: { id: item.artworkId }, data: patch });
            }
          }
        }

        if (item.entityType === "VENUE" && item.venueId) {
          const patch = sanitizeVenuePatch(fieldsAfter);
          if (Object.keys(patch).length > 0) {
            await enrichmentApplyRouteDeps.db.venue.update({ where: { id: item.venueId }, data: patch });
          }
        }

        if (item.entityType === "EVENT" && item.eventId) {
          if (fieldsAfter.featuredAssetId === "PENDING_IMAGE") {
            const event = item.event;
            if (!event) throw new Error("event_not_found");
            const imageResult = await enrichmentApplyRouteDeps.importApprovedEventImage({
              appDb: enrichmentApplyRouteDeps.db,
              candidateId: event.ingestExtractedCandidate?.id ?? event.id,
              runId: event.ingestExtractedCandidate?.runId ?? event.id,
              eventId: event.id,
              venueId: event.venueId ?? "",
              title: event.title,
              sourceUrl: event.ingestExtractedCandidate?.sourceUrl ?? item.searchUrl,
              venueWebsiteUrl: event.venue?.websiteUrl ?? null,
              candidateImageUrl: event.ingestExtractedCandidate?.imageUrl ?? null,
              requestId: `enrichment-apply-${item.id}`,
            });
            if (!imageResult.attached) throw new Error(imageResult.warning ?? "image_import_failed");
          } else {
            const patch = sanitizeEventPatch(fieldsAfter);
            if (Object.keys(patch).length > 0) {
              await enrichmentApplyRouteDeps.db.event.update({ where: { id: item.eventId }, data: patch });
            }
          }
        }

        await enrichmentApplyRouteDeps.db.enrichmentRunItem.update({
          where: { id: item.id },
          data: { status: "SUCCESS", errorMessage: null },
        });
        successItems += 1;
      } catch (error) {
        failedItems += 1;
        await enrichmentApplyRouteDeps.db.enrichmentRunItem.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "unknown_error",
          },
        });
      }
    }

    const completed = await enrichmentApplyRouteDeps.db.enrichmentRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        successItems,
        failedItems,
        finishedAt: new Date(),
      },
      include: {
        requestedBy: { select: { id: true, email: true, name: true } },
        items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });

    return NextResponse.json({ run: completed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
