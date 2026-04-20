import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ galleryId: string }> }) {
  try {
    const user = await requireAuth();
    const { galleryId } = await params;
    const body = await req.json().catch(() => ({})) as {
      items?: Array<{ entityId: string; caption?: string | null; commentary?: string | null; sortOrder?: number }>;
    };

    if (!Array.isArray(body.items)) return apiError(400, "invalid_request", "items array is required");
    const gallery = await db.collection.findFirst({ where: { id: galleryId, userId: user.id }, select: { id: true } });
    if (!gallery) return apiError(404, "not_found", "Gallery not found");

    await db.$transaction([
      db.collectionItem.deleteMany({ where: { collectionId: galleryId, entityType: "ARTWORK" } }),
      db.collectionItem.createMany({
        data: body.items.map((item, index) => ({
          collectionId: galleryId,
          entityType: "ARTWORK",
          entityId: item.entityId,
          caption: item.caption?.trim()?.slice(0, 240) ?? null,
          commentary: item.commentary?.trim()?.slice(0, 1000) ?? null,
          sortOrder: item.sortOrder ?? index,
        })),
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to update gallery items");
  }
}
