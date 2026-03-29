import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth, type SessionUser } from "@/lib/auth";
import { logError } from "@/lib/logging";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

type SaveEventDeps = {
  requireAuth: typeof requireAuth;
  ensureEventExists: (eventId: string) => Promise<boolean>;
  saveEvent: (input: { userId: string; eventId: string }) => Promise<void>;
  unsaveEvent: (input: { userId: string; eventId: string }) => Promise<void>;
};

async function parseEventId(params: Promise<{ id: string }>) {
  const parsed = idParamSchema.safeParse(await params);
  if (!parsed.success) return { ok: false as const, response: apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error)) };
  return { ok: true as const, eventId: parsed.data.id };
}

async function requireUser(deps: SaveEventDeps): Promise<SessionUser | NextResponse> {
  try {
    return await deps.requireAuth();
  } catch {
    return apiError(401, "unauthorized", "Login required");
  }
}

async function checkEventExists(deps: SaveEventDeps, eventId: string) {
  const exists = await deps.ensureEventExists(eventId);
  if (!exists) return apiError(400, "invalid_request", "Invalid event id");
  return null;
}

export async function handleSaveEvent(req: NextRequest, params: Promise<{ id: string }>, deps: SaveEventDeps) {
  const user = await requireUser(deps);
  if (user instanceof NextResponse) return user;

  const parsed = await parseEventId(params);
  if (!parsed.ok) return parsed.response;

  const notFoundResponse = await checkEventExists(deps, parsed.eventId);
  if (notFoundResponse) return notFoundResponse;

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "favorites:write", user.id),
      limit: RATE_LIMITS.favoritesWrite.limit,
      windowMs: RATE_LIMITS.favoritesWrite.windowMs,
      fallbackToMemory: true,
    });
    await deps.saveEvent({ userId: user.id, eventId: parsed.eventId });
    return NextResponse.json({ ok: true, saved: true });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    logError({
      message: "event_save_failed",
      eventId: parsed.eventId,
      userId: user.id,
      action: "save",
      errorDetail: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "internal_error", "Could not save event");
  }
}

export async function handleUnsaveEvent(req: NextRequest, params: Promise<{ id: string }>, deps: SaveEventDeps) {
  const user = await requireUser(deps);
  if (user instanceof NextResponse) return user;

  const parsed = await parseEventId(params);
  if (!parsed.ok) return parsed.response;

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "favorites:write", user.id),
      limit: RATE_LIMITS.favoritesWrite.limit,
      windowMs: RATE_LIMITS.favoritesWrite.windowMs,
      fallbackToMemory: true,
    });
    await deps.unsaveEvent({ userId: user.id, eventId: parsed.eventId });
    return NextResponse.json({ ok: true, saved: false });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    logError({
      message: "event_save_failed",
      eventId: parsed.eventId,
      userId: user.id,
      action: "unsave",
      errorDetail: error instanceof Error ? error.message : String(error),
    });
    return apiError(500, "internal_error", "Could not remove saved event");
  }
}

export type { SaveEventDeps };
