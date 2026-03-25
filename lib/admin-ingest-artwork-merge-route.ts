import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { parseBody, zodDetails } from "@/lib/validators";
import { resolveApiImageField } from "@/lib/assets/image-contract";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ existingArtworkId: z.string().uuid() });

type AdminActor = { id: string; email: string; role: "USER" | "EDITOR" | "ADMIN" };

type AdminIngestArtworkMergeDeps = {
  requireAdminUser: () => Promise<AdminActor>;
  appDb: typeof db;
};

const defaultDeps: AdminIngestArtworkMergeDeps = {
  requireAdminUser: async () => {
    throw new Error("not_implemented");
  },
  appDb: db,
};

function buildArtworkEnrichment(existingArtwork: {
  medium: string | null;
  year: number | null;
  dimensions: string | null;
  description: string | null;
}, candidate: {
  medium: string | null;
  year: number | null;
  dimensions: string | null;
  description: string | null;
}) {
  const update: Prisma.ArtworkUpdateInput = {};
  if (!existingArtwork.medium && candidate.medium) update.medium = candidate.medium;
  if (!existingArtwork.year && candidate.year) update.year = candidate.year;
  if (!existingArtwork.dimensions && candidate.dimensions) update.dimensions = candidate.dimensions;
  if (!existingArtwork.description && candidate.description) update.description = candidate.description;
  return update;
}

export async function handleAdminIngestArtworkMerge(req: NextRequest, params: { id?: string }, deps: Partial<AdminIngestArtworkMergeDeps> = {}) {
  const resolved = { ...defaultDeps, ...deps };

  try {
    const actor = await resolved.requireAdminUser();

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

    const parsedBody = bodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const [candidate, existingArtwork] = await Promise.all([
      resolved.appDb.ingestExtractedArtwork.findUnique({
        where: { id: parsedParams.data.id },
        select: {
          id: true,
          status: true,
          sourceEventId: true,
          title: true,
          sourceUrl: true,
          imageUrl: true,
          medium: true,
          year: true,
          dimensions: true,
          description: true,
          sourceEvent: { select: { venueId: true } },
        },
      }),
      resolved.appDb.artwork.findUnique({
        where: { id: parsedBody.data.existingArtworkId },
        select: { id: true, medium: true, year: true, dimensions: true, description: true },
      }),
    ]);

    if (!candidate) return apiError(404, "not_found", "Candidate not found");
    if (candidate.status !== "PENDING") return apiError(409, "invalid_state", "Already processed");
    if (!existingArtwork) return apiError(404, "not_found", "Existing artwork not found");

    const result = await resolved.appDb.$transaction(async (tx) => {
      const enrichment = buildArtworkEnrichment(existingArtwork, candidate);
      if (Object.keys(enrichment).length > 0) {
        await tx.artwork.update({ where: { id: existingArtwork.id }, data: enrichment });
      }

      await tx.ingestExtractedArtwork.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdArtworkId: existingArtwork.id },
      });

      await tx.artworkEvent.createMany({
        data: [{ artworkId: existingArtwork.id, eventId: candidate.sourceEventId }],
        skipDuplicates: true,
      });

      const venueId = candidate.sourceEvent.venueId;
      if (venueId) {
        await tx.artworkVenue.createMany({
          data: [{ artworkId: existingArtwork.id, venueId }],
          skipDuplicates: true,
        });
      }

      await tx.adminAuditLog.create({
        data: {
          actorEmail: actor.email,
          action: "admin.ingest.artwork.merged",
          targetType: "ingest_extracted_artwork",
          targetId: candidate.id,
          metadata: {
            candidateId: candidate.id,
            sourceEventId: candidate.sourceEventId,
            existingArtworkId: existingArtwork.id,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return { artworkId: existingArtwork.id, merged: true as const };
    });

    const imageImportResult = await importApprovedArtworkImage({
      appDb: resolved.appDb,
      candidateId: candidate.id,
      runId: candidate.id,
      artworkId: result.artworkId,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      candidateImageUrl: candidate.imageUrl,
      requestId: `admin-merge-artwork-${candidate.id}`,
    }).catch((err) => {
      const warning = `image-import failed: ${err instanceof Error ? err.message : String(err)}`;
      console.warn("admin_merge_artwork_image_import_failed", { candidateId: candidate.id, warning });
      return { attached: false, warning, imageUrl: null };
    });

    return NextResponse.json({
      ...result,
      imageImported: imageImportResult.attached,
      image: resolveApiImageField({ legacyUrl: imageImportResult.imageUrl, requestedVariant: "card" }),
      imageImportWarning: imageImportResult.warning,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
