import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { reason?: string };

    const candidate = await db.ingestExtractedArtist.findUnique({ where: { id }, select: { id: true, confidenceReasons: true } });
    if (!candidate) return apiError(404, "not_found", "Candidate not found");

    let mergedReasons: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined = undefined;
    if (body.reason?.trim()) {
      if (Array.isArray(candidate.confidenceReasons)) {
        mergedReasons = [...candidate.confidenceReasons, `reject_reason:${body.reason.trim()}`] as Prisma.InputJsonValue;
      } else if (candidate.confidenceReasons && typeof candidate.confidenceReasons === "object") {
        mergedReasons = { ...(candidate.confidenceReasons as Record<string, unknown>), rejectReason: body.reason.trim() } as Prisma.InputJsonValue;
      } else {
        mergedReasons = { rejectReason: body.reason.trim() } as Prisma.InputJsonValue;
      }
    }

    await db.ingestExtractedArtist.update({
      where: { id },
      data: { status: "REJECTED", ...(mergedReasons !== undefined ? { confidenceReasons: mergedReasons } : {}) },
    });

    return NextResponse.json({ rejected: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
