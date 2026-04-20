import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ galleryId: string }> }) {
  try {
    const user = await requireAuth();
    const { galleryId } = await params;
    const body = await req.json().catch(() => ({})) as { publishAt?: string };
    const publishAt = body.publishAt ? new Date(body.publishAt) : null;
    if (!publishAt || Number.isNaN(publishAt.getTime()) || publishAt <= new Date()) {
      return apiError(400, "invalid_request", "publishAt must be a future datetime");
    }

    const gallery = await db.collection.findFirst({ where: { id: galleryId, userId: user.id }, select: { id: true } });
    if (!gallery) return apiError(404, "not_found", "Gallery not found");

    await db.collection.update({ where: { id: galleryId }, data: { status: "DRAFT", isPublic: false, scheduledPublishAt: publishAt } });
    return NextResponse.json({ ok: true, scheduledPublishAt: publishAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to schedule gallery publish");
  }
}
