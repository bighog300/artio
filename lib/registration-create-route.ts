import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, rateLimitErrorResponse, requestClientIp } from "@/lib/rate-limit";
import { parseBody, zodDetails } from "@/lib/validators";
import { z } from "zod";

type SessionUser = { id: string };

type EventRecord = {
  id: string;
  ticketingMode: "EXTERNAL" | "RSVP" | "PAID" | null;
  capacity: number | null;
  rsvpClosesAt: Date | null;
};

type TicketTierRecord = { id: string; eventId: string; capacity: number | null };

type RegistrationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "WAITLISTED";
type RegistrationRecord = { id: string; confirmationCode: string; status: RegistrationStatus };

type Deps = {
  getSessionUser: () => Promise<SessionUser | null>;
  findPublishedEventBySlug: (slug: string) => Promise<EventRecord | null>;
  prisma: {
    $transaction: <T>(fn: (tx: {
      registration: {
        aggregate: (args: {
          where: {
            eventId: string;
            tierId?: string;
            status: { in: RegistrationStatus[] };
          };
          _sum: { quantity: true };
        }) => Promise<{ _sum: { quantity: number | null } }>;
        create: (args: {
          data: {
            eventId: string;
            tierId: string | null;
            userId: string | null;
            guestName: string;
            guestEmail: string;
            quantity: number;
            status: RegistrationStatus;
            confirmationCode: string;
          };
          select: { id: true; confirmationCode: true; status: true };
        }) => Promise<RegistrationRecord>;
      };
      ticketTier: {
        findFirst: (args: {
          where: { id: string; eventId: string };
          select: { id: true; eventId: true; capacity: true };
        }) => Promise<TicketTierRecord | null>;
      };
    }) => Promise<T>) => Promise<T>;
  };
  enforceRateLimit: typeof enforceRateLimit;
  now: () => Date;
  generateConfirmationCode: () => string;
};

const bodySchema = z.object({
  guestName: z.string().trim().min(1),
  guestEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  tierId: z.string().uuid().optional(),
  quantity: z.number().int().positive().default(1),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function handlePostRegistrationCreate(req: NextRequest, slug: string, deps: Deps) {
  try {
    await deps.enforceRateLimit({
      key: `event-register:ip:${requestClientIp(req)}`,
      limit: RATE_LIMITS.eventRegisterWrite.limit,
      windowMs: RATE_LIMITS.eventRegisterWrite.windowMs,
    });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    return apiError(500, "internal_error", "Unexpected server error");
  }

  const event = await deps.findPublishedEventBySlug(slug);
  if (!event) return apiError(404, "not_found", "Event not found");
  if (event.ticketingMode !== "RSVP") return apiError(400, "invalid_request", "Native registration is not enabled for this event");
  if (event.rsvpClosesAt && event.rsvpClosesAt.getTime() <= deps.now().getTime()) {
    return apiError(400, "invalid_request", "RSVP is closed for this event");
  }

  const parsedBody = bodySchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  try {
    const user = await deps.getSessionUser();

    const created = await deps.prisma.$transaction(async (tx) => {
      let capacity = event.capacity;
      if (parsedBody.data.tierId) {
        const tier = await tx.ticketTier.findFirst({
          where: { id: parsedBody.data.tierId, eventId: event.id },
          select: { id: true, eventId: true, capacity: true },
        });
        if (!tier) throw new Error("tier_not_found");
        capacity = tier.capacity;
      }

      const used = await tx.registration.aggregate({
        where: {
          eventId: event.id,
          ...(parsedBody.data.tierId ? { tierId: parsedBody.data.tierId } : {}),
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        _sum: { quantity: true },
      });

      const reserved = used._sum.quantity ?? 0;
      const status = capacity != null && reserved + parsedBody.data.quantity > capacity
        ? "WAITLISTED"
        : "PENDING";

      return tx.registration.create({
        data: {
          eventId: event.id,
          tierId: parsedBody.data.tierId ?? null,
          userId: user?.id ?? null,
          guestName: parsedBody.data.guestName,
          guestEmail: parsedBody.data.guestEmail,
          quantity: parsedBody.data.quantity,
          status,
          confirmationCode: deps.generateConfirmationCode(),
        },
        select: { id: true, confirmationCode: true, status: true },
      });
    });

    return NextResponse.json(
      { registrationId: created.id, confirmationCode: created.confirmationCode, status: created.status },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "tier_not_found") return apiError(400, "invalid_request", "Invalid tierId for event");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
