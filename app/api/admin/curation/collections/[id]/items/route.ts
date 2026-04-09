import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { apiError } from "@/lib/api";
import { curatedCollectionItemsReplaceSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const parsedParams = idParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid collection id", zodDetails(parsedParams.error));

    const items = await db.curatedCollectionItem.findMany({
      where: { collectionId: parsedParams.data.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { artwork: { select: { id: true, title: true, slug: true, artist: { select: { name: true } } } }, sortOrder: true },
    });

    return NextResponse.json({ items: items.map((item) => ({ ...item.artwork, artistName: item.artwork.artist.name, sortOrder: item.sortOrder })) });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_curation_collections_id_items_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const parsedParams = idParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid collection id", zodDetails(parsedParams.error));
    const parsed = curatedCollectionItemsReplaceSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const artworkIds = Array.from(new Set(parsed.data.artworkIds));
    if (artworkIds.length !== parsed.data.artworkIds.length) return apiError(400, "invalid_request", "artworkIds must be unique");

    const existing = artworkIds.length
      ? await db.artwork.findMany({ where: { id: { in: artworkIds }, isPublished: true }, select: { id: true } })
      : [];
    if (existing.length !== artworkIds.length) return apiError(400, "invalid_request", "All artworks must be published");

    const before = await db.curatedCollectionItem.findMany({ where: { collectionId: parsedParams.data.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { artworkId: true } });

    await db.$transaction(async (tx) => {
      await tx.curatedCollectionItem.deleteMany({ where: { collectionId: parsedParams.data.id } });
      if (!artworkIds.length) return;
      await tx.curatedCollectionItem.createMany({ data: artworkIds.map((artworkId, index) => ({ collectionId: parsedParams.data.id, artworkId, sortOrder: index })) });
    });

    await logAdminAction({
      actorEmail: admin.email,
      action: "ADMIN_COLLECTION_ITEMS_REPLACED",
      targetType: "curated_collection",
      targetId: parsedParams.data.id,
      metadata: { beforeArtworkIds: before.map((row) => row.artworkId), afterArtworkIds: artworkIds },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_curation_collections_id_items_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
