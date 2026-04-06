import { NextRequest } from "next/server";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";
import { scheduleGallerySync } from "@/lib/ingestion/scheduler";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authFailure = validateCronRequest(extractCronSecret(req.headers), { route: "/api/cron/ingest/gallery", method: req.method });
  if (authFailure) return authFailure;

  const result = await scheduleGallerySync();
  return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
