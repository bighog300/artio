import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createReminderSchema = z.object({
  preset: z.enum(["2H", "24H"]),
});

function computeRemindAt(startAt: Date, preset: "2H" | "24H") {
  const hours = preset === "2H" ? 2 : 24;
  return new Date(startAt.getTime() - hours * 60 * 60 * 1000);
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id: eventId } = await context.params;
    const reminder = await db.eventReminder.findUnique({
      where: { userId_eventId: { userId: user.id, eventId } },
      select: { id: true, preset: true, remindAt: true },
    });
    return NextResponse.json({ item: reminder });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const parsed = createReminderSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid reminder payload", zodDetails(parsed.error));

    const { id: eventId } = await context.params;
    const event = await db.event.findFirst({ where: { id: eventId, isPublished: true, deletedAt: null }, select: { id: true, startAt: true } });
    if (!event) return apiError(404, "not_found", "Event not found");

    const reminder = await db.eventReminder.upsert({
      where: { userId_eventId: { userId: user.id, eventId } },
      update: {
        preset: parsed.data.preset,
        remindAt: computeRemindAt(event.startAt, parsed.data.preset),
        deliveredAt: null,
      },
      create: {
        userId: user.id,
        eventId,
        preset: parsed.data.preset,
        remindAt: computeRemindAt(event.startAt, parsed.data.preset),
      },
      select: { id: true, preset: true, remindAt: true },
    });

    return NextResponse.json({ item: reminder });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id: eventId } = await context.params;

    await db.eventReminder.deleteMany({ where: { userId: user.id, eventId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
