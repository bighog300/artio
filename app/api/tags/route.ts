import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL && !process.env.DIRECT_URL) {
      console.error("tags_config_error", {
        route: "/api/tags",
        missingEnvVars: ["DATABASE_URL", "DIRECT_URL"],
      });
      return NextResponse.json(
        {
          error: "server_config_error",
          message: "Server database configuration is missing (DATABASE_URL or DIRECT_URL).",
        },
        { status: 500 },
      );
    }

    await enforceRateLimit({
      key: principalRateLimitKey(req, "tags:list"),
      limit: RATE_LIMITS.expensiveReads.limit,
      windowMs: RATE_LIMITS.expensiveReads.windowMs,
      fallbackToMemory: true,
    });
    const category = req.nextUrl.searchParams.get("category");
    const items = await db.tag.findMany({
      where: category ? { category } : undefined,
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    console.error("tags_unexpected_error", {
      route: "/api/tags",
      method: req.method,
      query: req.nextUrl.searchParams.toString(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Unable to load tags.",
      },
      { status: 500 },
    );
  }
}
