import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const now = new Date();

  const [events, galleries] = await Promise.all([
    db.event.updateMany({
      where: { isPublished: false, scheduledPublishAt: { lte: now } },
      data: { isPublished: true, status: "PUBLISHED", publishedAt: now, scheduledPublishAt: null },
    }),
    db.collection.updateMany({
      where: { status: "DRAFT", scheduledPublishAt: { lte: now } },
      data: { status: "PUBLISHED", isPublic: true, publishedAt: now, scheduledPublishAt: null },
    }),
  ]);

  return NextResponse.json({ ok: true, publishedEvents: events.count, publishedGalleries: galleries.count, now: now.toISOString() });
}
