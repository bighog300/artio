import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  noStore();
  try {
    await requireAdmin();
    const { id } = await params;

    const region = await db.ingestRegion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!region) return apiError(404, "not_found", "Region not found");

    await db.ingestRegion.update({
      where: { id },
      data: {
        status: "PENDING",
        nextRunAt: new Date(),
        venueGenDone: false,
        discoveryDone: false,
        errorMessage: null,
      },
    });

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
