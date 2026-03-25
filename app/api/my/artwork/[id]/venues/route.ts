import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { requireMyArtworkAccess } from "@/lib/my-artwork-access";
import { idParamSchema, parseBody, zodDetails } from "@/lib/validators";
import { z } from "zod";
export const runtime = "nodejs";

const bodySchema = z.object({ venueIds: z.array(z.string().uuid()) });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
  const parsedBody = bodySchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  try {
    const { user } = await requireMyArtworkAccess(parsedId.data.id);
    const found = await db.venue.findMany({ where: { id: { in: parsedBody.data.venueIds } }, select: { id: true } });
    if (found.length !== parsedBody.data.venueIds.length) return apiError(400, "invalid_request", "One or more venues not found");

    await db.$transaction([
      db.artworkVenue.deleteMany({ where: { artworkId: parsedId.data.id } }),
      db.artworkVenue.createMany({ data: parsedBody.data.venueIds.map((venueId) => ({ artworkId: parsedId.data.id, venueId })) }),
    ]);
    await logAdminAction({ actorEmail: user.email, action: "ARTWORK_RELATIONS_UPDATED", targetType: "artwork", targetId: parsedId.data.id, metadata: { venueCount: parsedBody.data.venueIds.length }, req });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && (error.message === "forbidden" || error.message === "not_found")) return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
