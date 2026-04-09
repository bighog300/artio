import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { listSnapshotsSchema } from "@/lib/perf/service";
import { paramsToObject, zodDetails } from "@/lib/validators";
import { guardAdmin } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminGuard = await guardAdmin();
  if (adminGuard instanceof NextResponse) return adminGuard;

  try {
    const parsed = listSnapshotsSchema.safeParse(paramsToObject(req.nextUrl.searchParams));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

    const items = await db.perfSnapshot.findMany({
      where: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
      },
      take: parsed.data.limit + 1,
      ...(parsed.data.cursor ? { skip: 1, cursor: { id: parsed.data.cursor } } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, name: true, createdAt: true, paramsJson: true },
    });

    const hasMore = items.length > parsed.data.limit;
    const pageItems = hasMore ? items.slice(0, parsed.data.limit) : items;

    return NextResponse.json({
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null,
    });
  } catch {
    console.error("admin_perf_snapshots_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
