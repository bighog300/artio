import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const query = req.nextUrl.searchParams.get("query")?.trim() ?? "";
    const publishedOnly = req.nextUrl.searchParams.get("published") === "true";
    const artworks = await db.artwork.findMany({
      where: {
        ...(publishedOnly ? { isPublished: true } : {}),
        ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { artist: { name: { contains: query, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, artist: { select: { name: true } }, isPublished: true },
      take: 100,
    });
    return NextResponse.json({ artworks });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_artwork_search_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
