import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { ensureUniqueArtworkSlugWithDeps, slugifyArtworkTitle } from "@/lib/artwork-slug";
import { ensureUniqueArtistSlugWithDeps, slugifyArtistName } from "@/lib/artist-slug";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { parseBody } from "@/lib/validators";
import { z } from "zod";
import { resolveApiImageField } from "@/lib/assets/image-contract";
import { markArtworkApprovalAttempt, markArtworkApprovalFailure, normalizeApprovalError } from "@/lib/ingest/candidate-observability";

type ApproveArtworkDeps = {
  requireAdmin: typeof requireAdmin;
  db: typeof db;
};

const defaultDeps: ApproveArtworkDeps = { requireAdmin, db };

const approveBodySchema = z.object({
  publishImmediately: z.boolean().optional().default(false),
});

const approvePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  artistName: z.string().trim().min(1).max(200).optional(),
  medium: z.string().trim().max(200).nullable().optional(),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  dimensions: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
}).strict();

export async function handleAdminIngestArtworkApprove(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: ApproveArtworkDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireAdmin();
    const { id } = await params;
    const body = await parseBody(req).catch(() => ({}));
    const parsedApproveBody = approveBodySchema.safeParse(body);
    const publishImmediately = parsedApproveBody.success ? parsedApproveBody.data.publishImmediately : false;
    if (publishImmediately && actor.role !== "ADMIN") {
      return apiError(403, "forbidden", "Approve & Publish requires ADMIN role");
    }
    const patchBody = body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
    delete (patchBody as { publishImmediately?: unknown }).publishImmediately;
    const patch = approvePatchSchema.safeParse(patchBody).data ?? {};

    const candidate = await deps.db.ingestExtractedArtwork.findUnique({
      where: { id },
      include: { sourceEvent: { select: { id: true, venueId: true } } },
    });

    if (!candidate) return apiError(404, "not_found", "Candidate not found");
    if (candidate.status !== "PENDING") return apiError(409, "invalid_state", `Candidate has already been processed (status: ${candidate.status})`);

    await markArtworkApprovalAttempt(deps.db, candidate.id);

    const effectiveTitle = patch.title ?? candidate.title;
    const effectiveArtistName = patch.artistName ?? candidate.artistName;
    const effectiveMedium = "medium" in patch ? patch.medium : candidate.medium;
    const effectiveYear = "year" in patch ? patch.year : candidate.year;
    const effectiveDimensions = "dimensions" in patch ? patch.dimensions : candidate.dimensions;
    const effectiveDescription = "description" in patch ? patch.description : candidate.description;

    let artistId: string | null = null;
    if (effectiveArtistName) {
      const artist = await deps.db.artist.findFirst({
        where: { name: { equals: effectiveArtistName, mode: "insensitive" } },
        select: { id: true },
      });
      artistId = artist?.id ?? null;
    }

    if (!artistId && !effectiveArtistName) {
      await markArtworkApprovalFailure(deps.db, candidate.id, "validation_failed");
      return apiError(409, "artist_name_missing", "This artwork candidate has no artist name. Provide one using the edit panel before approving.");
    }

    if (!artistId && effectiveArtistName) {
      const baseSlug = slugifyArtistName(effectiveArtistName);
      const slug = await ensureUniqueArtistSlugWithDeps(
        { findBySlug: (value) => deps.db.artist.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );
      const stub = await deps.db.artist.create({
        data: {
          name: effectiveArtistName,
          slug: slug ?? candidate.id,
          isAiDiscovered: true,
          status: "IN_REVIEW",
        },
        select: { id: true },
      });
      artistId = stub.id;
    }

    if (!artistId) {
      await markArtworkApprovalFailure(deps.db, candidate.id, "validation_failed");
      return apiError(500, "internal_error", "Unable to resolve artist during approval");
    }

    const result = await deps.db.$transaction(async (tx) => {
      const baseSlug = slugifyArtworkTitle(effectiveTitle);
      const slug = await ensureUniqueArtworkSlugWithDeps(
        { findBySlug: (value) => tx.artwork.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const newArtwork = await tx.artwork.create({
        data: {
          artistId,
          title: effectiveTitle,
          slug,
          medium: effectiveMedium ?? undefined,
          year: effectiveYear ?? undefined,
          dimensions: effectiveDimensions ?? undefined,
          description: effectiveDescription ?? undefined,
          isPublished: publishImmediately,
          status: publishImmediately ? "PUBLISHED" : "IN_REVIEW",
        },
        select: { id: true },
      });

      await tx.artworkEvent.create({
        data: { artworkId: newArtwork.id, eventId: candidate.sourceEventId },
      });

      const eventVenueId = candidate.sourceEvent.venueId;
      if (eventVenueId) {
        await tx.artworkVenue.create({
          data: { artworkId: newArtwork.id, venueId: eventVenueId },
        });
      }

      await tx.ingestExtractedArtwork.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdArtworkId: newArtwork.id, lastApprovalError: null },
      });

      return { artworkId: newArtwork.id, published: publishImmediately };
    });

    const imageImportResult = await importApprovedArtworkImage({
      appDb: deps.db,
      candidateId: candidate.id,
      runId: candidate.id,
      artworkId: result.artworkId,
      title: effectiveTitle,
      sourceUrl: candidate.sourceUrl,
      candidateImageUrl: candidate.imageUrl,
      requestId: `admin-approve-artwork-${candidate.id}`,
    }).catch((err) => {
      const warning = "image_import_failed";
      console.warn("admin_approve_artwork_image_import_failed", { candidateId: candidate.id, warning, approvalErrorCode: "image_import_failed" });
      return { attached: false, warning, imageUrl: null };
    });

    return NextResponse.json({
      artworkId: result.artworkId,
      artistId,
      eventId: candidate.sourceEventId,
      imageImportWarning: imageImportResult.warning,
      imageImported: imageImportResult.attached,
      image: resolveApiImageField({ legacyUrl: imageImportResult.imageUrl, requestedVariant: "card" }),
      published: result.published,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { id } = await params;
    const approvalErrorCode = normalizeApprovalError(error, "db_transaction_failed");
    await markArtworkApprovalFailure(deps.db, id, approvalErrorCode);
    console.warn("admin_approve_artwork_failed", { candidateId: id, approvalErrorCode, error });
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
