import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuth();
    const items = await db.collection.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        isPublic: true,
        publishedAt: true,
        scheduledPublishAt: true,
        _count: { select: { items: true, followers: true } },
      },
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to load galleries");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json().catch(() => ({})) as { title?: string; description?: string; coverAssetId?: string | null };
    const title = (body.title ?? "").trim();
    if (title.length < 2) return apiError(400, "invalid_request", "Title is required");

    const created = await db.collection.create({
      data: {
        userId: user.id,
        title: title.slice(0, 120),
        description: body.description?.trim()?.slice(0, 2000) ?? null,
        coverAssetId: body.coverAssetId ?? null,
        status: "DRAFT",
        isPublic: false,
      },
      select: { id: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to create gallery");
  }
}
