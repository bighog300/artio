import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { runCronScoreArtworkCompleteness } from "@/lib/cron-score-artwork-completeness";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runCronScoreArtworkCompleteness(extractCronSecret(req.headers), { db });
}

export async function POST(req: NextRequest) {
  return runCronScoreArtworkCompleteness(extractCronSecret(req.headers), { db });
}
