import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { resolveApiImageField } from "@/lib/assets/image-contract";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const parsed = idParamSchema.safeParse(await params);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error));

    const candidateId = parsed.data.id;

    const candidate = await db.ingestExtractedEvent.findUnique({
      where: { id: candidateId },
      select: { id: true, createdEventId: true },
    });
    if (!candidate) return apiError(404, "not_found", "Candidate not found");

    const eventId = candidate.createdEventId;
    if (!eventId) {
      return NextResponse.json({
        linked: false,
        linkedArtists: [],
        artistCandidates: [],
        artworkCandidates: [],
        imageStatus: {
          attached: false,
          url: null,
          image: resolveApiImageField({ legacyUrl: null, requestedVariant: "card" }),
        },
      });
    }

    const [linkedArtists, artistCandidates, artworkCandidates, eventImages] = await Promise.all([
      db.eventArtist.findMany({
        where: { eventId },
        select: { artist: { select: { id: true, name: true, slug: true } } },
      }),
      db.ingestExtractedArtistEvent.findMany({
        where: { eventId },
        select: {
          artistCandidate: {
            select: { id: true, name: true, status: true },
          },
        },
      }),
      db.ingestExtractedArtwork.findMany({
        where: { sourceEventId: eventId },
        select: { id: true, title: true, status: true, imageUrl: true },
      }),
      db.eventImage.findMany({
        where: { eventId },
        select: { id: true, url: true },
        take: 1,
      }),
    ]);

    return NextResponse.json({
      linked: true,
      eventId,
      linkedArtists: linkedArtists.map((r) => r.artist),
      artistCandidates: artistCandidates.map((r) => r.artistCandidate),
      artworkCandidates: artworkCandidates.map((candidate) => ({
        ...candidate,
        image: resolveApiImageField({ legacyUrl: candidate.imageUrl, requestedVariant: "card" }),
      })),
      imageStatus: {
        attached: eventImages.length > 0,
        url: eventImages[0]?.url ?? null,
        image: resolveApiImageField({ legacyUrl: eventImages[0]?.url ?? null, requestedVariant: "card" }),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
