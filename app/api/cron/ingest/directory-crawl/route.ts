import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runCronIngestDirectoryCrawl } from "@/lib/cron-ingest-directory-crawl";
import { getRequestId } from "@/lib/request-id";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runCronIngestDirectoryCrawl(extractCronSecret(req.headers), db, {
    requestId: getRequestId(req.headers),
  });
}

export async function POST(req: NextRequest) {
  return runCronIngestDirectoryCrawl(extractCronSecret(req.headers), db, {
    requestId: getRequestId(req.headers),
  });
}
