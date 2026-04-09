import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin({ redirectOnFail: false });
    const { id } = await params;
    const body = await req.json() as { decision?: string };
    const decision = body.decision === "APPROVED" ? "APPROVED" : "REJECTED";

    const pendingSubmissions = await db.submission.findMany({
      where: { targetEventId: id, status: "IN_REVIEW" },
      select: { id: true },
    });

    await db.submission.updateMany({
      where: {
        targetEventId: id,
        status: "IN_REVIEW",
      },
      data: {
        status: decision,
        decidedAt: new Date(),
      },
    });

    if (decision === "APPROVED" && pendingSubmissions.length) {
      const event = await db.event.findUnique({ where: { id }, select: { title: true, slug: true } });
      if (event?.slug) {
        const registrations = await db.registration.findMany({
          where: { eventId: id, status: "CONFIRMED" },
          select: { guestEmail: true },
        });
        await Promise.all(
          pendingSubmissions.flatMap((submission) => registrations.map((registration) => enqueueNotification({
            type: "EVENT_CHANGE_NOTIFY",
            toEmail: registration.guestEmail,
            dedupeKey: `event-change-${id}-${submission.id}-${registration.guestEmail.toLowerCase()}`,
            payload: {
              type: "EVENT_CHANGE_NOTIFY",
              eventTitle: event.title,
              eventSlug: event.slug,
            },
          }))),
        );
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "unauthorized" || error.message === "forbidden")) {
      return apiError(403, "forbidden", "Admin role required");
    }
    console.error("admin_events_id_resolve_submission_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
