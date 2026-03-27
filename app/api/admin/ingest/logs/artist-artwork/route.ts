import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type PipelineItem = {
  type: "artist" | "artwork";
  id: string;
  displayName: string;
  status: string;
  updatedAt: Date;
  lastApprovalAttemptAt: Date | null;
  lastApprovalError: string | null;
  imageImportStatus: string | null;
  imageImportWarning: string | null;
  relatedEvents: Array<{ id: string; title: string }>;
};

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const days = Math.min(parseInt(searchParams.get("days") ?? "7", 10), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const statusFilter: Array<"PENDING" | "APPROVED" | "REJECTED"> = ["PENDING", "APPROVED", "REJECTED"];
    const relevanceWhere = {
      OR: [
        { lastApprovalError: { not: null } },
        { imageImportStatus: { not: null } },
        { imageImportWarning: { not: null } },
        { updatedAt: { gte: since } },
      ],
    };

    const [artists, artworks] = await Promise.all([
      db.ingestExtractedArtist.findMany({
        where: {
          status: { in: statusFilter },
          ...relevanceWhere,
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          lastApprovalAttemptAt: true,
          lastApprovalError: true,
          imageImportStatus: true,
          imageImportWarning: true,
        },
      }),
      db.ingestExtractedArtwork.findMany({
        where: {
          status: { in: statusFilter },
          ...relevanceWhere,
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          lastApprovalAttemptAt: true,
          lastApprovalError: true,
          imageImportStatus: true,
          imageImportWarning: true,
          sourceEventId: true,
        },
      }),
    ]);
    const [artistEvents, artworkEvents] = await Promise.all([
      db.ingestExtractedArtistEvent.findMany({
        where: { artistCandidateId: { in: artists.map((artist) => artist.id) } },
        orderBy: { createdAt: "desc" },
        select: {
          artistCandidateId: true,
          event: { select: { id: true, title: true } },
        },
        take: 200,
      }),
      db.event.findMany({
        where: { id: { in: artworks.map((artwork) => artwork.sourceEventId) } },
        select: { id: true, title: true },
      }),
    ]);

    const artistEventsByCandidateId = new Map<string, Array<{ id: string; title: string }>>();
    for (const link of artistEvents) {
      const current = artistEventsByCandidateId.get(link.artistCandidateId) ?? [];
      if (current.length < 2) current.push(link.event);
      artistEventsByCandidateId.set(link.artistCandidateId, current);
    }

    const artworkEventById = new Map(artworkEvents.map((event) => [event.id, event]));

    const items: PipelineItem[] = [
      ...artists.map((artist) => ({
        type: "artist" as const,
        id: artist.id,
        displayName: artist.name,
        status: artist.status,
        updatedAt: artist.updatedAt,
        lastApprovalAttemptAt: artist.lastApprovalAttemptAt,
        lastApprovalError: artist.lastApprovalError,
        imageImportStatus: artist.imageImportStatus,
        imageImportWarning: artist.imageImportWarning,
        relatedEvents: artistEventsByCandidateId.get(artist.id) ?? [],
      })),
      ...artworks.map((artwork) => ({
        type: "artwork" as const,
        id: artwork.id,
        displayName: artwork.title,
        status: artwork.status,
        updatedAt: artwork.updatedAt,
        lastApprovalAttemptAt: artwork.lastApprovalAttemptAt,
        lastApprovalError: artwork.lastApprovalError,
        imageImportStatus: artwork.imageImportStatus,
        imageImportWarning: artwork.imageImportWarning,
        relatedEvents: artworkEventById.get(artwork.sourceEventId) ? [artworkEventById.get(artwork.sourceEventId)!] : [],
      })),
    ]
      .sort((a, b) => +b.updatedAt - +a.updatedAt)
      .slice(0, 100);

    return NextResponse.json(
      {
        items: items.map((item) => ({
          ...item,
          updatedAt: item.updatedAt.toISOString(),
          lastApprovalAttemptAt: item.lastApprovalAttemptAt?.toISOString() ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
