import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError, requireAuth } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { publishedEventWhere } from "@/lib/publish-status";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    const event = await db.event.findFirst({ where: { id: parsedId.data.id, ...publishedEventWhere() }, select: { id: true } });
    if (!event) return apiError(404, "not_found", "Event not found");

    const existing = await db.engagementEvent.findFirst({
      where: { userId: user.id, action: "HIDE", targetType: "EVENT", targetId: event.id },
      select: { id: true },
    });

    if (!existing) {
      await db.engagementEvent.create({
        data: {
          userId: user.id,
          sessionId: null,
          surface: "FOLLOWING",
          action: "HIDE",
          targetType: "EVENT",
          targetId: event.id,
        },
      });
    }

    return NextResponse.json({ hidden: true });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Login required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const parsedId = idParamSchema.safeParse(await params);
    if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

    await db.engagementEvent.deleteMany({
      where: { userId: user.id, action: "HIDE", targetType: "EVENT", targetId: parsedId.data.id },
    });

    return NextResponse.json({ hidden: false });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Login required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
