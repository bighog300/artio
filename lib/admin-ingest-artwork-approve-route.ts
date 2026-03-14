import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUniqueArtworkSlugWithDeps, slugifyArtworkTitle } from "@/lib/artwork-slug";
import { ensureUniqueArtistSlugWithDeps, slugifyArtistName } from "@/lib/artist-slug";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { parseBody, zodDetails } from "@/lib/validators";
import { z } from "zod";

type ApproveArtworkDeps = {
  requireAdmin: typeof requireAdmin;
  db: typeof db;
};

const defaultDeps: ApproveArtworkDeps = { requireAdmin, db };

const approvePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  artistName: z.string().trim().min(1).max(200).optional(),
  medium: z.string().trim().max(200).nullable().optional(),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  dimensions: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
}).strict();

export async function handleAdminIngestArtworkApprove(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
  deps: ApproveArtworkDeps = defaultDeps,
) {
  try {
    await deps.requireAdmin();
    const { id } = await params;
    const parsedPatch = approvePatchSchema.safeParse(await parseBody(req));
    if (!parsedPatch.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedPatch.error));
    const patch = parsedPatch.data;

    const candidate = await deps.db.ingestExtractedArtwork.findUnique({
      where: { id },
      include: { sourceEvent: { select: { id: true, venueId: true } } },
    });

    if (!candidate) return apiError(404, "not_found", "Candidate not found");
    if (candidate.status !== "PENDING") return apiError(409, "invalid_state", `Candidate has already been processed (status: ${candidate.status})`);

    const title = patch.title ?? candidate.title;
    const artistName = patch.artistName ?? candidate.artistName;
    const medium = "medium" in patch ? patch.medium : candidate.medium;
    const year = "year" in patch ? patch.year : candidate.year;
    const dimensions = "dimensions" in patch ? patch.dimensions : candidate.dimensions;
    const description = "description" in patch ? patch.description : candidate.description;

    let artistId: string | null = null;
    if (artistName) {
      const artist = await deps.db.artist.findFirst({
        where: { name: { equals: artistName, mode: "insensitive" } },
        select: { id: true },
      });
      artistId = artist?.id ?? null;
    }

    if (!artistId && artistName) {
      const baseSlug = slugifyArtistName(artistName);
      const slug = await ensureUniqueArtistSlugWithDeps(
        { findBySlug: (value) => deps.db.artist.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );
      const stub = await deps.db.artist.create({
        data: {
          name: artistName,
          slug: slug ?? candidate.id,
          isAiDiscovered: true,
          status: "IN_REVIEW",
        },
        select: { id: true },
      });
      artistId = stub.id;
    }

    if (!artistId) {
      return apiError(409, "artist_name_missing", "This artwork candidate has no artist name. Set an artist name before approving.");
    }

    const result = await deps.db.$transaction(async (tx) => {
      const baseSlug = slugifyArtworkTitle(candidate.title);
      const slug = await ensureUniqueArtworkSlugWithDeps(
        { findBySlug: (value) => tx.artwork.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const newArtwork = await tx.artwork.create({
        data: {
          artistId,
          title,
          slug,
          medium: medium ?? undefined,
          year: year ?? undefined,
          dimensions: dimensions ?? undefined,
          description: description ?? undefined,
          isPublished: false,
          status: "IN_REVIEW",
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
        data: { status: "APPROVED", createdArtworkId: newArtwork.id },
      });

      return { artworkId: newArtwork.id };
    });

    const imageImportResult = await importApprovedArtworkImage({
      appDb: deps.db,
      candidateId: candidate.id,
      runId: candidate.id,
      artworkId: result.artworkId,
      title,
      sourceUrl: candidate.sourceUrl,
      candidateImageUrl: candidate.imageUrl,
      requestId: `admin-approve-artwork-${candidate.id}`,
    }).catch((err) => {
      const warning = `image-import failed: ${err instanceof Error ? err.message : String(err)}`;
      console.warn("admin_approve_artwork_image_import_failed", { candidateId: candidate.id, warning });
      return { attached: false, warning, imageUrl: null };
    });

    return NextResponse.json({
      artworkId: result.artworkId,
      artistId,
      eventId: candidate.sourceEventId,
      imageImportWarning: imageImportResult.warning,
      imageImported: imageImportResult.attached,
      imageUrl: imageImportResult.imageUrl,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
