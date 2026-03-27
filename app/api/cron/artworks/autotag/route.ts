import { NextRequest } from "next/server";
import { extractCronSecret } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runCronAutotagArtworks } from "@/lib/cron-autotag-artworks";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return runCronAutotagArtworks(extractCronSecret(req.headers), { db });
}

export async function POST(req: NextRequest) {
  return runCronAutotagArtworks(extractCronSecret(req.headers), { db });
}
