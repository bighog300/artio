import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const { id } = await params;
    const association = await db.artistEventAssociation.findUnique({
      where: { id },
      select: { id: true, artistId: true, eventId: true, role: true },
    });
    if (!association) return apiError(404, "not_found", "Association not found");

    await db.$transaction([
      db.artistEventAssociation.update({
        where: { id },
        data: { status: "APPROVED" },
      }),
      db.eventArtist.upsert({
        where: {
          eventId_artistId: {
            eventId: association.eventId,
            artistId: association.artistId,
          },
        },
        create: {
          eventId: association.eventId,
          artistId: association.artistId,
          role: association.role ?? null,
        },
        update: {},
      }),
    ]);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    console.error("admin_artist_event_associations_id_approve_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
