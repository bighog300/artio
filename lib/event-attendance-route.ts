import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getSessionUser, requireAuth, type SessionUser } from "@/lib/auth";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

type AttendanceDeps = {
  requireAuth: typeof requireAuth;
  getSessionUser: typeof getSessionUser;
  ensureEventExists: (eventId: string) => Promise<boolean>;
  attendEvent: (input: { userId: string; eventId: string }) => Promise<void>;
  unattendEvent: (input: { userId: string; eventId: string }) => Promise<void>;
  countAttendance: (eventId: string) => Promise<number>;
  isGoing: (input: { userId: string; eventId: string }) => Promise<boolean>;
};

async function parseEventId(params: Promise<{ id: string }>) {
  const parsed = idParamSchema.safeParse(await params);
  if (!parsed.success) return { ok: false as const, response: apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error)) };
  return { ok: true as const, eventId: parsed.data.id };
}

async function requireUser(deps: AttendanceDeps): Promise<SessionUser | NextResponse> {
  try {
    return await deps.requireAuth();
  } catch {
    return apiError(401, "unauthorized", "Login required");
  }
}

async function checkEventExists(deps: AttendanceDeps, eventId: string) {
  const exists = await deps.ensureEventExists(eventId);
  if (!exists) return apiError(400, "invalid_request", "Invalid event id");
  return null;
}

export async function handleAttendEvent(req: NextRequest, params: Promise<{ id: string }>, deps: AttendanceDeps) {
  const user = await requireUser(deps);
  if (user instanceof NextResponse) return user;

  const parsed = await parseEventId(params);
  if (!parsed.ok) return parsed.response;

  const notFoundResponse = await checkEventExists(deps, parsed.eventId);
  if (notFoundResponse) return notFoundResponse;

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "attendance:write", user.id),
      limit: RATE_LIMITS.favoritesWrite.limit,
      windowMs: RATE_LIMITS.favoritesWrite.windowMs,
    });
    await deps.attendEvent({ userId: user.id, eventId: parsed.eventId });
    return NextResponse.json({ ok: true, isGoing: true });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Could not update attendance");
  }
}

export async function handleUnattendEvent(req: NextRequest, params: Promise<{ id: string }>, deps: AttendanceDeps) {
  const user = await requireUser(deps);
  if (user instanceof NextResponse) return user;

  const parsed = await parseEventId(params);
  if (!parsed.ok) return parsed.response;

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "attendance:write", user.id),
      limit: RATE_LIMITS.favoritesWrite.limit,
      windowMs: RATE_LIMITS.favoritesWrite.windowMs,
    });
    await deps.unattendEvent({ userId: user.id, eventId: parsed.eventId });
    return NextResponse.json({ ok: true, isGoing: false });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Could not update attendance");
  }
}

export async function handleGetAttendance(_req: NextRequest, params: Promise<{ id: string }>, deps: AttendanceDeps) {
  const parsed = await parseEventId(params);
  if (!parsed.ok) return parsed.response;

  const notFoundResponse = await checkEventExists(deps, parsed.eventId);
  if (notFoundResponse) return notFoundResponse;

  const user = await deps.getSessionUser();
  const count = await deps.countAttendance(parsed.eventId);
  const isGoing = user ? await deps.isGoing({ userId: user.id, eventId: parsed.eventId }) : false;

  return NextResponse.json({ count, isGoing });
}

export type { AttendanceDeps };
