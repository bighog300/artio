import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;

  const { id: venueId } = await ctx.params;
  const body = await req.json().catch(() => null) as { eventId?: string; startsAt?: string; endsAt?: string; priority?: number; tier?: number; maxDailySlots?: number } | null;
  if (!body?.eventId || !body.startsAt || !body.endsAt) return apiError(400, "invalid_request", "eventId, startsAt and endsAt are required");

  const membership = await db.venueMembership.findFirst({ where: { venueId, userId: user.id }, select: { id: true } });
  if (!membership) return apiError(403, "forbidden", "Only venue team members can promote events");

  const subscription = await db.venueSubscription.findUnique({ where: { venueId }, select: { status: true } });
  if (!subscription || subscription.status !== "ACTIVE") return apiError(402, "payment_required", "Venue Pro subscription required");

  const event = await db.event.findFirst({ where: { id: body.eventId, venueId }, select: { id: true } });
  if (!event) return apiError(404, "not_found", "Event not found for this venue");

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  const tier = Math.max(1, Math.min(3, body.tier ?? 1));
  const maxDailySlots = Math.max(1, Math.min(200, body.maxDailySlots ?? (tier === 3 ? 20 : tier === 2 ? 60 : 120)));
  const dailyStart = new Date(startsAt);
  dailyStart.setUTCHours(0, 0, 0, 0);
  const dailyEnd = new Date(dailyStart);
  dailyEnd.setUTCDate(dailyEnd.getUTCDate() + 1);
  const activeInTierToday = await db.eventPromotion.count({
    where: {
      venueId,
      tier,
      startsAt: { lt: dailyEnd },
      endsAt: { gte: dailyStart },
    },
  });
  const tierDailyCap = tier === 3 ? 2 : tier === 2 ? 5 : 12;
  if (activeInTierToday >= tierDailyCap) return apiError(409, "promotion_slots_full", "No promotion slots remaining for this tier today");

  const promotion = await db.eventPromotion.create({
    data: {
      eventId: body.eventId,
      venueId,
      startsAt,
      endsAt,
      priority: Math.max(1, Math.min(5, body.priority ?? 1)),
      tier,
      maxDailySlots,
    },
  });

  return NextResponse.json({ promotion }, { status: 201 });
}
