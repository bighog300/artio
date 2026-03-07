import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { parseBody, zodDetails } from "@/lib/validators";
import { calculateDiscountAmount, normalizePromoCode, promoCodeValidationError, PromoCodeRecord } from "@/lib/promo-codes";

type EventRecord = {
  id: string;
  slug: string;
  ticketingMode: "EXTERNAL" | "RSVP" | "PAID" | null;
};

type TierRecord = {
  id: string;
  eventId: string;
  priceAmount: number;
};

type Deps = {
  findPublishedEventBySlug: (slug: string) => Promise<EventRecord | null>;
  findTicketTierById: (tierId: string) => Promise<TierRecord | null>;
  findPromoCodeByEventIdAndCode: (eventId: string, code: string) => Promise<PromoCodeRecord | null>;
  now: () => Date;
};

const schema = z.object({
  promoCode: z.string().trim().min(1),
  tierId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

export async function handlePostPromoValidate(req: NextRequest, slug: string, deps: Deps) {
  const event = await deps.findPublishedEventBySlug(slug);
  if (!event) return apiError(404, "not_found", "Event not found");
  if (event.ticketingMode !== "PAID") return apiError(400, "invalid_request", "Paid checkout is not enabled for this event");

  const parsedBody = schema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  const tier = await deps.findTicketTierById(parsedBody.data.tierId);
  if (!tier || tier.eventId !== event.id) return apiError(404, "not_found", "Ticket tier not found");

  const code = normalizePromoCode(parsedBody.data.promoCode);
  const promoCode = await deps.findPromoCodeByEventIdAndCode(event.id, code);
  if (!promoCode) return apiError(400, "promo_code_invalid", "Promo code is invalid");

  const validationError = promoCodeValidationError(promoCode, deps.now());
  if (validationError === "promo_code_invalid") return apiError(400, "promo_code_invalid", "Promo code is invalid");
  if (validationError === "promo_code_expired") return apiError(400, "promo_code_expired", "Promo code has expired");
  if (validationError === "promo_code_exhausted") return apiError(400, "promo_code_exhausted", "Promo code has reached its usage limit");

  const totalAmount = tier.priceAmount * parsedBody.data.quantity;
  const discountAmount = calculateDiscountAmount(totalAmount, promoCode);
  const finalAmount = totalAmount - discountAmount;

  return NextResponse.json({
    valid: true,
    discountType: promoCode.discountType,
    value: promoCode.value,
    discountAmount,
    finalAmount,
  });
}
