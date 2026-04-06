import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ noticeId: string }> },
) {
  try {
    const user = await requireAuth();
    const { noticeId } = await context.params;

    const record = await db.accessRequest.findUnique({
      where: { id: noticeId },
      select: { userId: true },
    });

    if (!record || record.userId !== user.id) {
      return apiError(404, "not_found", "Notice not found");
    }

    await db.accessRequest.update({
      where: { id: noticeId },
      data: { dismissedAt: new Date() },
    });

    return NextResponse.json({ dismissed: true });
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
