import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runCronIngestDiscovery } from "@/lib/cron-ingest-discovery";
import { getRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runCronIngestDiscovery(
    extractCronSecret(req.headers),
    db,
    { requestId: getRequestId(req.headers) },
  );
}

export async function POST(req: NextRequest) {
  return runCronIngestDiscovery(
    extractCronSecret(req.headers),
    db,
    { requestId: getRequestId(req.headers) },
  );
}
