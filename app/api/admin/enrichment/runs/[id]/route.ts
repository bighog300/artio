import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;

    const run = await db.enrichmentRun.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, email: true, name: true } },
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            runId: true,
            entityType: true,
            artistId: true,
            artworkId: true,
            venueId: true,
            eventId: true,
            status: true,
            fieldsChanged: true,
            fieldsBefore: true,
            fieldsAfter: true,
            confidenceBefore: true,
            confidenceAfter: true,
            searchUrl: true,
            reason: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
            artist: { select: { name: true } },
            artwork: { select: { title: true } },
            venue: { select: { name: true } },
            event: { select: { title: true } },
          },
        },
      },
    });

    if (!run) return apiError(404, "not_found", "Run not found");

    return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
