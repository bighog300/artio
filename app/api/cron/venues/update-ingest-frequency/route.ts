import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { runCronEngagementIngestFrequency } from "@/lib/cron-engagement-ingest-frequency";
import { db } from "@/lib/db";
import { getRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runCronEngagementIngestFrequency(
    extractCronSecret(req.headers),
    { db },
    { requestId: getRequestId(req.headers), method: req.method },
  );
}

export async function POST(req: NextRequest) {
  return runCronEngagementIngestFrequency(
    extractCronSecret(req.headers),
    { db },
    { requestId: getRequestId(req.headers), method: req.method },
  );
}
