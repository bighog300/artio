import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireEditor, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireEditor();
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || "50")));
    const items = await db.betaFeedback.findMany({
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, email: true, pagePath: true, message: true, createdAt: true },
    });
    return NextResponse.json(items, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Editor role required");
    console.error("admin_beta_feedback_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
