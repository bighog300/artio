import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "collection-follows:write", user.id),
      limit: RATE_LIMITS.followsWrite.limit,
      windowMs: RATE_LIMITS.followsWrite.windowMs,
      fallbackToMemory: true,
    });
    const collection = await db.collection.findUnique({ where: { id }, select: { id: true, isPublic: true } });
    if (!collection?.isPublic) return apiError(404, "not_found", "Collection not found");

    await db.collectionFollow.upsert({
      where: { userId_collectionId: { userId: user.id, collectionId: id } },
      update: {},
      create: { userId: user.id, collectionId: id },
    });
    return NextResponse.json({ ok: true, following: true });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Failed to follow collection");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "collection-follows:write", user.id),
      limit: RATE_LIMITS.followsWrite.limit,
      windowMs: RATE_LIMITS.followsWrite.windowMs,
      fallbackToMemory: true,
    });
    await db.collectionFollow.deleteMany({ where: { userId: user.id, collectionId: id } });
    return NextResponse.json({ ok: true, following: false });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Failed to unfollow collection");
  }
}
