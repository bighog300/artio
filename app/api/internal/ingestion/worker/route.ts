import { NextRequest } from "next/server";
import { runIngestionWorkerLoop } from "@/lib/ingestion/workers/worker";
import { extractCronSecret, validateCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cronAuth = validateCronRequest(extractCronSecret(req.headers), { route: "/api/internal/ingestion/worker", method: req.method });
  if (cronAuth) return cronAuth;

  const configured = process.env.INGEST_WORKER_SECRET;
  if (configured && req.headers.get("x-ingest-worker-secret") !== configured) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;

  const result = await runIngestionWorkerLoop(Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 25);
  return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}


export async function GET(req: NextRequest) {
  return POST(req);
}
