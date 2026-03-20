import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { isAuthError } from "@/lib/auth";
import { handleBackfillArtworksCron } from "@/lib/cron-ingest-backfill-artworks";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleBackfillArtworksCron(req);
}

export async function POST() {
  try {
    await requireAdmin();

    const syntheticReq = new Request(
      "http://localhost/api/cron/ingest/backfill-artworks?limit=50",
      {
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
        },
      }
    );

    return handleBackfillArtworksCron(syntheticReq);
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
