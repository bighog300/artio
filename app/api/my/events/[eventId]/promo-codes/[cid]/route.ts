import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleDeletePromoCode, handlePatchPromoCode } from "@/lib/promo-code-route";

export const runtime = "nodejs";

const deps = {
  requireAuth,
  findManagedEventById: (eventId: string, userId: string) => db.event.findFirst({
    where: {
      id: eventId,
      venue: { memberships: { some: { userId } } },
    },
    select: { id: true },
  }),
  listPromoCodesByEventId: (eventId: string) => db.promoCode.findMany({
    where: { eventId },
    select: { id: true, code: true, discountType: true, value: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true },
  }),
  findPromoCodeByCode: (eventId: string, code: string) => db.promoCode.findFirst({
    where: { eventId, code: { equals: code, mode: "insensitive" } },
    select: { id: true, code: true, discountType: true, value: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true },
  }),
  createPromoCode: (data: { eventId: string; code: string; discountType: "PERCENT" | "FIXED"; value: number; maxUses: number | null; expiresAt: Date | null }) =>
    db.promoCode.create({
      data,
      select: { id: true, code: true, discountType: true, value: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true },
    }),
  findPromoCodeByIdAndEventId: (id: string, eventId: string) => db.promoCode.findFirst({
    where: { id, eventId },
    select: { id: true, code: true, discountType: true, value: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true },
  }),
  updatePromoCode: (id: string, data: { isActive?: boolean; maxUses?: number | null; expiresAt?: Date | null }) =>
    db.promoCode.update({
      where: { id },
      data,
      select: { id: true, code: true, discountType: true, value: true, maxUses: true, usedCount: true, expiresAt: true, isActive: true },
    }),
  deletePromoCode: async (id: string) => {
    await db.promoCode.delete({ where: { id } });
  },
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string; cid: string }> }) {
  return handlePatchPromoCode(req, params, deps);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string; cid: string }> }) {
  return handleDeletePromoCode(req, params, deps);
}
