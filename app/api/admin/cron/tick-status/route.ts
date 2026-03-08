import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin({ redirectOnFail: false });
    const row = await db.perfSnapshot.findFirst({
      where: { name: "cron:tick:last" },
      orderBy: { createdAt: "desc" },
      select: { paramsJson: true },
    });

    const firedAt = typeof row?.paramsJson === "object" && row?.paramsJson && "firedAt" in row.paramsJson
      ? (row.paramsJson as { firedAt?: string }).firedAt ?? null
      : null;

    return NextResponse.json({ lastTickAt: firedAt });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Admin role required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
