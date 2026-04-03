import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse, requestClientIp } from "@/lib/rate-limit";
import { isTrackableEntityType } from "@/lib/artwork-analytics";
import { parseBody } from "@/lib/validators";

type SessionUser = { id: string };

type Deps = {
  getSessionUser: () => Promise<SessionUser | null>;
  getAnalyticsSalt?: () => Promise<string | null | undefined>;
  createEvent: (input: {
    entityType: "ARTWORK" | "ARTIST" | "VENUE" | "EVENT";
    entityId: string;
    day: Date;
    viewerHash: string | null;
    userId: string | null;
  }) => Promise<void>;
  incrementDaily: (input: { entityType: "ARTWORK" | "ARTIST" | "VENUE" | "EVENT"; entityId: string; day: Date }) => Promise<void>;
};

function toUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function buildViewerHash(req: NextRequest, salt: string | null | undefined) {
  const resolvedSalt = salt ?? process.env.ANALYTICS_SALT;
  const saltToUse = typeof resolvedSalt === "string" ? resolvedSalt : null;
  if (!saltToUse) return null;
  const ip = requestClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  return crypto.createHash("sha256").update(`${saltToUse}|${ip}|${userAgent}`).digest("hex");
}

export async function handleTrackPageView(req: NextRequest, deps: Deps) {
  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "analytics:view"),
      limit: RATE_LIMITS.analyticsViewWrite.limit,
      windowMs: RATE_LIMITS.analyticsViewWrite.windowMs,
    });

    const body = await parseBody(req);
    const entityType = typeof body.entityType === "string" ? body.entityType.toUpperCase() : "";
    const entityId = typeof body.entityId === "string" ? body.entityId : "";

    if (!isTrackableEntityType(entityType) || !isUuid(entityId)) {
      return apiError(400, "invalid_request", "Invalid analytics payload");
    }

    const day = toUtcDay();
    const user = await deps.getSessionUser();
    const analyticsSalt = deps.getAnalyticsSalt ? await deps.getAnalyticsSalt() : undefined;
    await deps.createEvent({ entityType, entityId, day, viewerHash: await buildViewerHash(req, analyticsSalt), userId: user?.id ?? null });
    await deps.incrementDaily({ entityType, entityId, day });

    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    console.error("analytics_view_error", { error });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
