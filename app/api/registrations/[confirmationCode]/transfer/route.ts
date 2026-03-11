import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";
import { parseBody } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  newName: z.string().trim().min(2),
  newEmail: z.string().trim().email(),
});

function emailEquals(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ confirmationCode: string }> }) {
  try {
    const { confirmationCode } = await params;

    await enforceRateLimit({
      key: `registration-transfer:${confirmationCode.toLowerCase()}`,
      limit: 3,
      windowMs: RATE_LIMITS.publicWrite.windowMs,
    });

    const parsedBody = bodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload");

    const registration = await db.registration.findFirst({
      where: { confirmationCode, status: "CONFIRMED" },
      select: {
        id: true,
        userId: true,
        guestEmail: true,
        confirmationCode: true,
        event: {
          select: {
            slug: true,
            title: true,
            startAt: true,
            venue: { select: { name: true } },
          },
        },
      },
    });

    if (!registration) return apiError(404, "not_found", "Confirmed registration not found");

    const user = await getSessionUser();
    const requestEmail = req.nextUrl.searchParams.get("email")?.trim() ?? "";
    const isOwner = Boolean(user && registration.userId && user.id === registration.userId);

    if (!isOwner && !emailEquals(requestEmail, registration.guestEmail)) {
      return apiError(403, "forbidden", "Not allowed to transfer this registration");
    }

    const updated = await db.registration.update({
      where: { id: registration.id },
      data: {
        guestName: parsedBody.data.newName,
        guestEmail: parsedBody.data.newEmail.toLowerCase(),
      },
      select: {
        confirmationCode: true,
        event: {
          select: {
            slug: true,
            title: true,
            startAt: true,
            venue: { select: { name: true } },
          },
        },
      },
    });

    await enqueueNotification({
      type: "RSVP_CONFIRMED",
      toEmail: parsedBody.data.newEmail,
      dedupeKey: `registration-transfer-confirmed:${registration.id}:${parsedBody.data.newEmail.toLowerCase()}`,
      payload: {
        type: "RSVP_CONFIRMED",
        eventTitle: updated.event.title,
        venueName: updated.event.venue?.name ?? "Venue TBA",
        eventSlug: updated.event.slug,
        startAt: updated.event.startAt.toISOString(),
        confirmationCode: updated.confirmationCode,
      },
    });

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
