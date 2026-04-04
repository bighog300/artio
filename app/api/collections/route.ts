import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  const collections = await db.collection.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, description: true, isPublic: true, _count: { select: { items: true } } },
  });
  return NextResponse.json({ items: collections });
}

export async function POST(req: NextRequest) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null) as { title?: string; description?: string; isPublic?: boolean } | null;
  const title = body?.title?.trim();
  if (!title || title.length < 2) return apiError(400, "invalid_request", "Title is required");

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "collections:create", user.id),
      limit: RATE_LIMITS.collectionCreate.limit,
      windowMs: RATE_LIMITS.collectionCreate.windowMs,
      fallbackToMemory: true,
    });
    const created = await db.collection.create({
      data: { userId: user.id, title: title.slice(0, 80), description: body?.description?.trim().slice(0, 280), isPublic: body?.isPublic ?? true },
      select: { id: true, title: true, description: true, isPublic: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Failed to create collection");
  }
}
