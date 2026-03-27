import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { runCronScoreArtistCompleteness } from "@/lib/cron-score-artist-completeness";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runCronScoreArtistCompleteness(extractCronSecret(req.headers), { db });
}

export async function POST(req: NextRequest) {
  return runCronScoreArtistCompleteness(extractCronSecret(req.headers), { db });
}
