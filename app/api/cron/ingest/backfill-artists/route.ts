import { handleBackfillArtistsCron } from "@/lib/cron-ingest-backfill-artists";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleBackfillArtistsCron(req);
}
