// This route is triggered manually and is intentionally not
// registered in vercel.json.
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { handleBackfillEventImagesCron } from "@/lib/cron-ingest-backfill-event-images";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleBackfillEventImagesCron(req);
}

export async function POST() {
  try {
    await requireAdmin();

    const syntheticReq = new Request(
      "http://localhost/api/cron/ingest/backfill-event-images?limit=50",
      {
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
        },
      },
    );

    return handleBackfillEventImagesCron(syntheticReq);
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Admin role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
