import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const body = await req.json().catch(() => ({})) as { publishAt?: string };
    const publishAt = body.publishAt ? new Date(body.publishAt) : null;

    if (!publishAt || Number.isNaN(publishAt.getTime()) || publishAt <= new Date()) {
      return apiError(400, "invalid_request", "publishAt must be in the future");
    }

    const event = await db.event.findFirst({
      where: {
        id: eventId,
        OR: [
          { submissions: { some: { submitterUserId: user.id } } },
          { venue: { memberships: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } } },
        ],
      },
      select: { id: true },
    });

    if (!event) return apiError(404, "not_found", "Event not found");

    await db.event.update({ where: { id: event.id }, data: { scheduledPublishAt: publishAt, status: "DRAFT", isPublished: false } });
    return NextResponse.json({ ok: true, scheduledPublishAt: publishAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Failed to schedule event publish");
  }
}
