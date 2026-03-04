import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { handleAttendEvent, handleGetAttendance, handleUnattendEvent } from "@/lib/event-attendance-route";
import { publishedEventWhere } from "@/lib/publish-status";

export const runtime = "nodejs";

const deps = {
  requireAuth,
  getSessionUser,
  ensureEventExists: async (eventId: string) => {
    const event = await db.event.findFirst({ where: { id: eventId, ...publishedEventWhere() }, select: { id: true } });
    return Boolean(event);
  },
  attendEvent: async ({ userId, eventId }: { userId: string; eventId: string }) => {
    await db.attendance.upsert({
      where: { userId_eventId: { userId, eventId } },
      update: {},
      create: { userId, eventId },
    });
  },
  unattendEvent: async ({ userId, eventId }: { userId: string; eventId: string }) => {
    await db.attendance.deleteMany({ where: { userId, eventId } });
  },
  countAttendance: async (eventId: string) => db.attendance.count({ where: { eventId } }),
  isGoing: async ({ userId, eventId }: { userId: string; eventId: string }) => {
    const attendance = await db.attendance.findUnique({ where: { userId_eventId: { userId, eventId } }, select: { id: true } });
    return Boolean(attendance);
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleGetAttendance(req, params, deps);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAttendEvent(req, params, deps);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleUnattendEvent(req, params, deps);
}
