import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseBody, zodDetails } from "@/lib/validators";
import { createPerfSnapshot, explainRequestSchema } from "@/lib/perf/service";
import { getRequestId } from "@/lib/request-id";
import { captureException } from "@/lib/telemetry";
import { guardAdmin } from "@/lib/auth-guard";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req.headers);

  try {
    const user = await guardAdmin(requestId);
    if (user instanceof NextResponse) return user;

    await enforceRateLimit({
      key: principalRateLimitKey(req, "admin:perf:explain", user.id),
      limit: RATE_LIMITS.adminPerfExplain.limit,
      windowMs: RATE_LIMITS.adminPerfExplain.windowMs,
      fallbackToMemory: true,
    });

    if (process.env.PERF_EXPLAIN_ENABLED !== "true" || (process.env.NODE_ENV === "production" && process.env.PERF_EXPLAIN_ALLOW_PROD !== "true")) {
      return apiError(403, "feature_disabled", "Perf explain is disabled", undefined, requestId);
    }

    const parsedBody = explainRequestSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error), requestId);

    const result = await createPerfSnapshot(parsedBody.data);
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    captureException(error, { route: "/api/admin/perf/explain", requestId });
    console.error("admin_perf_explain_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error", undefined, requestId);
  }
}
