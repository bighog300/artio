import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { listIngestRegions } from "@/lib/ingest/regions-list";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const createSchema = z.object({
  country: z.string().trim().min(2).max(120),
  region: z.string().trim().min(1).max(120),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();
    const page = Number.parseInt(
      req.nextUrl.searchParams.get("page") ?? "1",
      10,
    );
    const payload = await listIngestRegions({ db, page });

    return NextResponse.json(
      payload,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_regions_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest) {
  noStore();
  try {
    const admin = await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success)
      return apiError(
        400,
        "invalid_request",
        "Invalid payload",
        parsed.error.flatten(),
      );

    const row = await db.ingestRegion.create({
      data: {
        country: parsed.data.country,
        region: parsed.data.region,
        status: "PENDING",
        triggeredById: admin.id,
      },
      select: { id: true },
    });

    return NextResponse.json(
      { regionId: row.id },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error))
      return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden")
      return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_regions_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
