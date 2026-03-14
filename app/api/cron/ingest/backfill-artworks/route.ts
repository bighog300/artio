import { handleBackfillArtworksCron } from "@/lib/cron-ingest-backfill-artworks";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleBackfillArtworksCron(req);
}
