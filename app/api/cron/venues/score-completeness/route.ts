import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { runCronScoreVenueCompleteness } from "@/lib/cron-score-venue-completeness";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runCronScoreVenueCompleteness(extractCronSecret(req.headers), { db });
}

export async function POST(req: NextRequest) {
  return runCronScoreVenueCompleteness(extractCronSecret(req.headers), { db });
}
