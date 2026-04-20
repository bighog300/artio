import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ galleryId: string }> }) {
  try {
    const user = await requireAuth();
    const { galleryId } = await params;

    const gallery = await db.collection.findFirst({ where: { id: galleryId, userId: user.id }, select: { id: true, _count: { select: { items: true } } } });
    if (!gallery) return apiError(404, "not_found", "Gallery not found");
    if (gallery._count.items < 1) return apiError(400, "invalid_request", "Add at least one artwork before publishing");

    const updated = await db.collection.update({ where: { id: galleryId }, data: { status: "PUBLISHED", isPublic: true, publishedAt: new Date(), scheduledPublishAt: null } });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to publish gallery");
  }
}
