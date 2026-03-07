export type PromoDiscountType = "PERCENT" | "FIXED";

export type PromoCodeRecord = {
  id: string;
  discountType: PromoDiscountType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
};

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

export function calculateDiscountAmount(totalAmount: number, promoCode: Pick<PromoCodeRecord, "discountType" | "value">) {
  if (promoCode.discountType === "PERCENT") {
    return Math.round((totalAmount * promoCode.value) / 100);
  }

  return Math.min(promoCode.value, totalAmount);
}

export function promoCodeValidationError(promoCode: PromoCodeRecord, now: Date) {
  if (!promoCode.isActive) return "promo_code_invalid";
  if (promoCode.expiresAt && promoCode.expiresAt.getTime() <= now.getTime()) return "promo_code_expired";
  if (promoCode.maxUses != null && promoCode.usedCount >= promoCode.maxUses) return "promo_code_exhausted";
  return null;
}
