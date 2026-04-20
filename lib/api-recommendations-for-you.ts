import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { isAuthError, requireUser } from "@/lib/auth";
import { forYouRecommendationsQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { getForYouFeed } from "@/domains/feed/getForYouFeed";
import { getSessionCookiePresence, logAuthDebug } from "@/lib/auth-debug";

export async function handleForYouGet(req: { nextUrl: URL }, deps: {
  requireAuthFn?: typeof requireUser;
  getForYouRecommendationsFn?: typeof getForYouFeed;
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

    const result = await (deps.getForYouRecommendationsFn ?? getForYouFeed)(db, {
      userId: user.id,
      days: parsed.data.days,
      limit: parsed.data.limit,
    });

    return NextResponse.json({ windowDays: result.windowDays, items: result.items, galleryItems: result.galleryItems ?? [] }, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    if (isAuthError(err)) {
      logAuthDebug("api.recommendations.for-you.unauthorized", {
        pathname: req.nextUrl.pathname,
        host: req.nextUrl.host,
        hasCookieHeader: Boolean(cookieHeader),
        hasSessionCookieName: getSessionCookiePresence(cookieHeader),
        userExists: false,
        redirectTarget: null,
      });
      return apiError(401, "unauthorized", "Login required");
    }

    const headers = (req as { headers?: Headers }).headers;
    const requestId = headers?.get("x-request-id") ?? headers?.get("x-vercel-id") ?? null;
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("api.recommendations.for_you.internal_error", {
      requestId,
      pathname: req.nextUrl.pathname,
      host: req.nextUrl.host,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });

    return apiError(500, "internal_error", "Unexpected server error");
  }
}
