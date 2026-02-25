import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError, requireUser } from "@/lib/auth";
import { forYouRecommendationsQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { getForYouRecommendations } from "@/lib/recommendations-for-you";
import { getSessionCookiePresence, logAuthDebug } from "@/lib/auth-debug";

export async function handleForYouGet(req: { nextUrl: URL }, deps: {
  requireAuthFn?: typeof requireUser;
  getForYouRecommendationsFn?: typeof getForYouRecommendations;
} = {}) {
  const cookieHeader = (req as { headers?: Headers }).headers?.get("cookie") ?? null;

  try {
    const user = await (deps.requireAuthFn ?? requireUser)();
    logAuthDebug("api.recommendations.for-you", {
      pathname: req.nextUrl.pathname,
      host: req.nextUrl.host,
      hasCookieHeader: Boolean(cookieHeader),
      hasSessionCookieName: getSessionCookiePresence(cookieHeader),
      userExists: true,
      redirectTarget: null,
    });
    const parsed = forYouRecommendationsQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

    const result = await (deps.getForYouRecommendationsFn ?? getForYouRecommendations)(db, {
      userId: user.id,
      days: parsed.data.days,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ windowDays: result.windowDays, items: result.items }, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    logAuthDebug("api.recommendations.for-you.unauthorized", {
      pathname: req.nextUrl.pathname,
      host: req.nextUrl.host,
      hasCookieHeader: Boolean(cookieHeader),
      hasSessionCookieName: getSessionCookiePresence(cookieHeader),
      userExists: false,
      redirectTarget: null,
    });
    if (isAuthError(err)) {
      return apiError(401, "unauthorized", "Login required");
    }

    return apiError(500, "internal_error", "Unexpected server error");
  }
}
