import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { geocodeQuerySchema, paramsToObject, zodDetails } from "@/lib/validators";
import { geocodeCandidates, GeocodeError } from "@/lib/geocode";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const parsed = geocodeQuerySchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsed.error));

  const user = await getSessionUser().catch(() => null);

  try {
    await enforceRateLimit({
      key: principalRateLimitKey(req, "geocode", user?.id),
      limit: Number(process.env.RATE_LIMIT_GEOCODE_PER_MINUTE ?? 30),
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }

  const q = parsed.data.q;

  try {
    const results = await geocodeCandidates(q);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof GeocodeError && error.code === "not_configured") {
      return NextResponse.json({ error: "not_configured" }, { status: 501 });
    }
    return apiError(502, "provider_error", "Geocoding provider request failed");
  }
}
