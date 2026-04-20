import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ galleryId: string }> }) {
  try {
    const user = await requireAuth();
    const { galleryId } = await params;

    const gallery = await db.collection.findFirst({
      where: { id: galleryId, userId: user.id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        isPublic: true,
        coverAssetId: true,
        publishedAt: true,
        scheduledPublishAt: true,
        items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, entityId: true, caption: true, commentary: true, sortOrder: true } },
      },
    });

    if (!gallery) return apiError(404, "not_found", "Gallery not found");
    return NextResponse.json(gallery);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to load gallery");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ galleryId: string }> }) {
  try {
    const user = await requireAuth();
    const { galleryId } = await params;
    const body = await req.json().catch(() => ({})) as { title?: string; description?: string | null; coverAssetId?: string | null };

    const existing = await db.collection.findFirst({ where: { id: galleryId, userId: user.id }, select: { id: true } });
    if (!existing) return apiError(404, "not_found", "Gallery not found");

    const updated = await db.collection.update({
      where: { id: galleryId },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim().slice(0, 120) } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "description") ? { description: body.description?.trim()?.slice(0, 2000) ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "coverAssetId") ? { coverAssetId: body.coverAssetId ?? null } : {}),
      },
      select: { id: true, status: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to update gallery");
  }
}
