import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runCronIngestRegions } from "@/lib/cron-ingest-regions";
import { getRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runCronIngestRegions(extractCronSecret(req.headers), db, {
    requestId: getRequestId(req.headers),
  });
}

export async function POST(req: NextRequest) {
  return runCronIngestRegions(extractCronSecret(req.headers), db, {
    requestId: getRequestId(req.headers),
  });
}
