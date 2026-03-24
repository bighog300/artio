import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

    const items = await db.asset.findMany({
      where: { ownerUserId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        variants: {
          select: { variantName: true, url: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return NextResponse.json({
      items: page.map((item) => {
        const thumb = resolveAssetDisplay({ asset: item, requestedVariant: "thumb" });
        return {
          ...item,
          thumb,
          thumbUrl: thumb.url,
        };
      }),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
