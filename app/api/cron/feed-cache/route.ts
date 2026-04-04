import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { extractCronSecret } from "@/lib/cron-auth";
import { runFeedCacheCron } from "@/lib/cron-feed-cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runFeedCacheCron(extractCronSecret(req.headers), db);
}

export async function POST(req: NextRequest) {
  return runFeedCacheCron(extractCronSecret(req.headers), db);
}
