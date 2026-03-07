import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishedEventWhere } from "@/lib/publish-status";
import { handlePostPromoValidate } from "@/lib/promo-validate-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handlePostPromoValidate(req, slug, {
    findPublishedEventBySlug: (eventSlug) => db.event.findFirst({
      where: { slug: eventSlug, deletedAt: null, ...publishedEventWhere() },
      select: { id: true, slug: true, ticketingMode: true },
    }),
    findTicketTierById: (tierId) => db.ticketTier.findUnique({
      where: { id: tierId },
      select: { id: true, eventId: true, priceAmount: true },
    }),
    findPromoCodeByEventIdAndCode: (eventId, code) => db.promoCode.findFirst({
      where: { eventId, code: { equals: code, mode: "insensitive" } },
      select: { id: true, discountType: true, value: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true },
    }),
    now: () => new Date(),
  });
}
