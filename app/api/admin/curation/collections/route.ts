import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { apiError } from "@/lib/api";
import { curatedCollectionCreateSchema, paramsToObject, parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const query = String(paramsToObject(req.nextUrl.searchParams).query ?? "").trim();
    const collections = await db.curatedCollection.findMany({
      where: query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }] } : undefined,
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, description: true, isPublished: true, publishStartsAt: true, publishEndsAt: true, homeRank: true, showOnHome: true, showOnArtwork: true, updatedAt: true, _count: { select: { items: true } } },
      take: 100,
    });
    return NextResponse.json({ collections: collections.map((row) => ({ ...row, itemCount: row._count.items })) });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const parsed = curatedCollectionCreateSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const created = await db.curatedCollection.create({
      data: { slug: parsed.data.slug, title: parsed.data.title, description: parsed.data.description ?? null, isPublished: parsed.data.isPublished ?? false, showOnHome: true, showOnArtwork: true },
      select: { id: true, slug: true, title: true, description: true, isPublished: true, publishStartsAt: true, publishEndsAt: true, homeRank: true, showOnHome: true, showOnArtwork: true, createdAt: true, updatedAt: true },
    });

    await logAdminAction({ actorEmail: admin.email, action: "ADMIN_COLLECTION_CREATED", targetType: "curated_collection", targetId: created.id, metadata: { slug: created.slug, title: created.title }, req });
    return NextResponse.json({ collection: created }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
