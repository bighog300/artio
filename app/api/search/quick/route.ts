import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const quickSearchSchema = z.object({
  q: z.string().trim().min(2).max(80),
});

const EMPTY_RESPONSE = { events: [], venues: [], artists: [] };

export async function GET(req: NextRequest) {
  const parsed = quickSearchSchema.safeParse({ q: req.nextUrl.searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json(EMPTY_RESPONSE);

  try {
    const query = parsed.data.q;
    await enforceRateLimit({
      key: principalRateLimitKey(req, "search:quick"),
      limit: RATE_LIMITS.expensiveReads.limit,
      windowMs: RATE_LIMITS.expensiveReads.windowMs,
      fallbackToMemory: true,
    });

    const [events, venues, artists] = await Promise.all([
      db.event.findMany({
        where: { isPublished: true, title: { contains: query, mode: "insensitive" } },
        select: { id: true, title: true, slug: true, startAt: true },
        orderBy: { startAt: "asc" },
        take: 5,
      }),
      db.venue.findMany({
        where: { isPublished: true, name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
        take: 5,
      }),
      db.artist.findMany({
        where: { isPublished: true, name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({ events, venues, artists });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
