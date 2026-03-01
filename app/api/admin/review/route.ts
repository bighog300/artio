import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireEditor, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

const bodySchema = z.object({
  entityType: z.enum(["EVENT", "VENUE", "ARTIST"]),
  entityId: z.string().uuid(),
  action: z.enum(["approve", "request_changes", "archive"]),
  reviewNotes: z.string().trim().max(2000).optional(),
});

async function notifyCreatorStub(input: { entityType: string; entityId: string; action: string }) {
  console.info("review_notification_stub", input);
}

export async function PATCH(req: NextRequest) {
  try {
    await requireEditor();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload");

    const now = new Date();
    const status = parsed.data.action === "approve" ? "PUBLISHED" : parsed.data.action === "request_changes" ? "CHANGES_REQUESTED" : "ARCHIVED";

    if (parsed.data.entityType === "EVENT") {
      await db.event.update({ where: { id: parsed.data.entityId }, data: { status, reviewedAt: now, reviewNotes: parsed.data.reviewNotes ?? null, isPublished: status === "PUBLISHED" } });
    } else if (parsed.data.entityType === "VENUE") {
      await db.venue.update({ where: { id: parsed.data.entityId }, data: { status, reviewedAt: now, reviewNotes: parsed.data.reviewNotes ?? null, isPublished: status === "PUBLISHED" } });
    } else {
      await db.artist.update({ where: { id: parsed.data.entityId }, data: { status, reviewedAt: now, reviewNotes: parsed.data.reviewNotes ?? null, isPublished: status === "PUBLISHED" } });
    }

    await notifyCreatorStub({ entityType: parsed.data.entityType, entityId: parsed.data.entityId, action: parsed.data.action });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
