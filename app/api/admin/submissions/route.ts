import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireEditor, isAuthError } from "@/lib/auth";
import { decodeSubmissionsCursor, encodeSubmissionsCursor } from "@/lib/admin-submissions-cursor";

export const runtime = "nodejs";

const allowedStatuses = ["IN_REVIEW", "APPROVED", "REJECTED"] as const;
type SubmissionStatusFilter = (typeof allowedStatuses)[number];

export async function GET(req: NextRequest) {
  try {
    await requireEditor();
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || "50")));
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const rawStatus = req.nextUrl.searchParams.get("status") || "IN_REVIEW";
    const status: SubmissionStatusFilter = allowedStatuses.includes(rawStatus as SubmissionStatusFilter) ? (rawStatus as SubmissionStatusFilter) : "IN_REVIEW";

    const parsedCursor = cursor ? decodeSubmissionsCursor(cursor) : null;
    const legacyCursorRow = cursor && !parsedCursor
      ? await db.submission.findUnique({ where: { id: cursor }, select: { id: true, submittedAt: true } })
      : null;

    const effectiveCursor = parsedCursor
      ?? (legacyCursorRow?.submittedAt ? { id: legacyCursorRow.id, submittedAtISO: legacyCursorRow.submittedAt.toISOString() } : null);

    const items = await db.submission.findMany({
      where: {
        status,
        submittedAt: { not: null },
        ...(effectiveCursor ? {
          OR: [
            { submittedAt: { lt: new Date(effectiveCursor.submittedAtISO) } },
            { submittedAt: new Date(effectiveCursor.submittedAtISO), id: { lt: effectiveCursor.id } },
          ],
        } : {}),
      },
      take: limit,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        type: true,
        status: true,
        note: true,
        decisionReason: true,
        submittedAt: true,
        decidedAt: true,
        venue: { select: { id: true, name: true } },
        targetEvent: { select: { id: true, title: true, slug: true } },
        targetVenue: { select: { id: true, name: true, slug: true } },
        submitter: { select: { id: true, email: true, name: true } },
      },
    });

    const last = items[items.length - 1];
    const nextCursor = last?.submittedAt
      ? encodeSubmissionsCursor({ submittedAtISO: last.submittedAt.toISOString(), id: last.id })
      : null;

    return NextResponse.json({ items, nextCursor });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Editor role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
