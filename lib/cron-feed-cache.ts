import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { validateCronRequest } from "@/lib/cron-auth";
import { getForYouRecommendations } from "@/lib/recommendations-for-you";

export async function runFeedCacheCron(secret: string | null, db: PrismaClient) {
  const authError = validateCronRequest(secret, { route: "/api/cron/feed-cache", method: "CRON" });
  if (authError) return authError;

  const users = await db.user.findMany({ select: { id: true }, take: 200, orderBy: { updatedAt: "desc" } });
  let rebuilt = 0;
  for (const user of users) {
    await getForYouRecommendations(db, { userId: user.id, days: 30, limit: 60 });
    rebuilt += 1;
  }

  return NextResponse.json({ ok: true, rebuilt });
}
