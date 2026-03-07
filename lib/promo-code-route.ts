import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { parseBody, zodDetails } from "@/lib/validators";
import { normalizePromoCode } from "@/lib/promo-codes";

type SessionUser = { id: string };
type DiscountType = "PERCENT" | "FIXED";

type PromoCodeRecord = {
  id: string;
  code: string;
  discountType: DiscountType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
};

type CreatePromoCodeInput = {
  eventId: string;
  code: string;
  discountType: DiscountType;
  value: number;
  maxUses: number | null;
  expiresAt: Date | null;
};

type UpdatePromoCodeInput = {
  isActive?: boolean;
  maxUses?: number | null;
  expiresAt?: Date | null;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  findManagedEventById: (eventId: string, userId: string) => Promise<{ id: string } | null>;
  listPromoCodesByEventId: (eventId: string) => Promise<PromoCodeRecord[]>;
  findPromoCodeByCode: (eventId: string, code: string) => Promise<PromoCodeRecord | null>;
  createPromoCode: (data: CreatePromoCodeInput) => Promise<PromoCodeRecord>;
  findPromoCodeByIdAndEventId: (id: string, eventId: string) => Promise<PromoCodeRecord | null>;
  updatePromoCode: (id: string, data: UpdatePromoCodeInput) => Promise<PromoCodeRecord>;
  deletePromoCode: (id: string) => Promise<void>;
};

const paramsSchema = z.object({ eventId: z.string().uuid() });
const promoParamsSchema = z.object({ eventId: z.string().uuid(), cid: z.string().uuid() });

const createSchema = z.object({
  code: z.string().trim().min(1),
  discountType: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.discountType === "PERCENT" && (value.value < 1 || value.value > 100)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "PERCENT value must be between 1 and 100" });
  }
});

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

async function requireManagedEvent(eventId: string, userId: string, deps: Deps) {
  const event = await deps.findManagedEventById(eventId, userId);
  if (!event) return null;
  return event;
}

export async function handleGetPromoCodes(_req: NextRequest, params: Promise<{ eventId: string }>, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

    const event = await requireManagedEvent(parsedParams.data.eventId, user.id, deps);
    if (!event) return apiError(404, "not_found", "Event not found");

    const promoCodes = await deps.listPromoCodesByEventId(event.id);
    return NextResponse.json({ promoCodes });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handlePostPromoCode(req: NextRequest, params: Promise<{ eventId: string }>, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

    const event = await requireManagedEvent(parsedParams.data.eventId, user.id, deps);
    if (!event) return apiError(404, "not_found", "Event not found");

    const parsedBody = createSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const code = normalizePromoCode(parsedBody.data.code);
    const existing = await deps.findPromoCodeByCode(event.id, code);
    if (existing) return apiError(409, "conflict", "Promo code already exists for this event");

    const promoCode = await deps.createPromoCode({
      eventId: event.id,
      code,
      discountType: parsedBody.data.discountType,
      value: parsedBody.data.value,
      maxUses: parsedBody.data.maxUses ?? null,
      expiresAt: parsedBody.data.expiresAt ? new Date(parsedBody.data.expiresAt) : null,
    });

    return NextResponse.json(promoCode, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handlePatchPromoCode(req: NextRequest, params: Promise<{ eventId: string; cid: string }>, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const parsedParams = promoParamsSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

    const event = await requireManagedEvent(parsedParams.data.eventId, user.id, deps);
    if (!event) return apiError(404, "not_found", "Event not found");

    const promoCode = await deps.findPromoCodeByIdAndEventId(parsedParams.data.cid, event.id);
    if (!promoCode) return apiError(404, "not_found", "Promo code not found");

    const parsedBody = updateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const updated = await deps.updatePromoCode(promoCode.id, {
      isActive: parsedBody.data.isActive,
      maxUses: parsedBody.data.maxUses,
      expiresAt: parsedBody.data.expiresAt === undefined ? undefined : (parsedBody.data.expiresAt ? new Date(parsedBody.data.expiresAt) : null),
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleDeletePromoCode(_req: NextRequest, params: Promise<{ eventId: string; cid: string }>, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const parsedParams = promoParamsSchema.safeParse(await params);
    if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

    const event = await requireManagedEvent(parsedParams.data.eventId, user.id, deps);
    if (!event) return apiError(404, "not_found", "Event not found");

    const promoCode = await deps.findPromoCodeByIdAndEventId(parsedParams.data.cid, event.id);
    if (!promoCode) return apiError(404, "not_found", "Promo code not found");

    if (promoCode.usedCount === 0) {
      await deps.deletePromoCode(promoCode.id);
      return NextResponse.json({ deleted: true, softDeleted: false });
    }

    const updated = await deps.updatePromoCode(promoCode.id, { isActive: false });
    return NextResponse.json({ deleted: true, softDeleted: true, promoCode: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
