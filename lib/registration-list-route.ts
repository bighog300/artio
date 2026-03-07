import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { parseBody } from "@/lib/validators";
import { cancelRegistrationTransaction } from "@/lib/registration-cancel-transaction";
import { enqueueNotification } from "@/lib/notifications";

type SessionUser = { id: string };

type RegistrationRow = {
  id: string;
  confirmationCode: string;
  guestName: string;
  guestEmail: string;
  tierId: string | null;
  tierName: string | null;
  status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED";
  quantity: number;
  createdAt: Date;
};

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  hasEventVenueMembership: (eventId: string, userId: string) => Promise<boolean>;
  findEventById: (eventId: string) => Promise<{ id: string; title: string; slug: string | null } | null>;
  listRegistrations: (args: { eventId: string; skip: number; take: number }) => Promise<RegistrationRow[]>;
  countRegistrations: (eventId: string) => Promise<number>;
  summarizeRegistrations: (eventId: string) => Promise<{ confirmed: number; waitlisted: number; cancelled: number }>;
  prisma: {
    $transaction: <T>(fn: (tx: {
      event: {
        findUnique: (args: {
          where: { id: string };
          select: { capacity: true };
        }) => Promise<{ capacity: number | null } | null>;
      };
      registration: {
        findUnique: (args: {
          where: { id: string };
          select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
        }) => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" } | null>;
        update: (args: {
          where: { id: string };
          data: { status: "CANCELLED"; cancelledAt: Date } | { status: "CONFIRMED" };
          select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
        }) => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" }>;
        count: (args: {
          where: {
            eventId: string;
            status: { in: Array<"PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED"> };
          };
        }) => Promise<number>;
        findFirst: (args: {
          where: {
            eventId: string;
            status: "WAITLISTED";
            tierId?: string;
          };
          orderBy: { createdAt: "asc" };
          select: { id: true; eventId: true; tierId: true; guestEmail: true; confirmationCode: true; status: true };
        }) => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" } | null>;
      };
    }) => Promise<T>) => Promise<T>;
  };
  enqueueNotification: typeof enqueueNotification;
};

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function quoteCsv(value: string | number | null) {
  if (value == null) return "";
  const str = String(value);
  if (!/[",\n]/.test(str)) return str;
  return `"${str.replaceAll('"', '""')}"`;
}

function toCsv(rows: RegistrationRow[]) {
  const header = ["id", "confirmationCode", "guestName", "guestEmail", "tierId", "tierName", "status", "quantity", "createdAt"].join(",");
  const dataLines = rows.map((row) => [
    quoteCsv(row.id),
    quoteCsv(row.confirmationCode),
    quoteCsv(row.guestName),
    quoteCsv(row.guestEmail),
    quoteCsv(row.tierId),
    quoteCsv(row.tierName),
    quoteCsv(row.status),
    quoteCsv(row.quantity),
    quoteCsv(row.createdAt.toISOString()),
  ].join(","));

  return [header, ...dataLines].join("\n");
}

async function requireVenueMember(deps: Deps, eventId: string) {
  const user = await deps.requireAuth();
  const isMember = await deps.hasEventVenueMembership(eventId, user.id);
  if (!isMember) throw new Error("forbidden");
  return user;
}

export async function handleGetMyEventRegistrations(req: NextRequest, eventId: string, deps: Deps) {
  try {
    await requireVenueMember(deps, eventId);

    const parsedQuery = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsedQuery.success) return apiError(400, "invalid_request", "Invalid pagination params");

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total, summary] = await Promise.all([
      deps.listRegistrations({ eventId, skip, take: limit }),
      deps.countRegistrations(eventId),
      deps.summarizeRegistrations(eventId),
    ]);

    return NextResponse.json({
      page,
      limit,
      total,
      items,
      summary: {
        total,
        confirmed: summary.confirmed,
        waitlisted: summary.waitlisted,
        cancelled: summary.cancelled,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Venue membership required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleGetMyEventRegistrationsCsv(_: NextRequest, eventId: string, deps: Deps) {
  try {
    await requireVenueMember(deps, eventId);
    const rows = await deps.listRegistrations({ eventId, skip: 0, take: 10000 });
    return new NextResponse(toCsv(rows), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=event-${eventId}-registrations.csv`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Venue membership required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handlePostMyEventRegistrationCancel(req: NextRequest, eventId: string, registrationId: string, deps: Deps) {
  try {
    await requireVenueMember(deps, eventId);

    const parsedBody = cancelBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload");

    const event = await deps.findEventById(eventId);
    if (!event) return apiError(404, "not_found", "Event not found");

    const { cancelled } = await deps.prisma.$transaction((tx) => cancelRegistrationTransaction(tx, { registrationId }));
    if (cancelled.eventId !== eventId) return apiError(404, "not_found", "Registration not found");

    await deps.enqueueNotification({
      type: "RSVP_CANCELLED",
      toEmail: cancelled.guestEmail,
      dedupeKey: `rsvp-cancelled-${cancelled.id}`,
      payload: {
        type: "RSVP_CANCELLED",
        eventTitle: event.title,
        confirmationCode: cancelled.confirmationCode,
        reason: parsedBody.data.reason,
        eventSlug: event.slug,
      },
    });

    return NextResponse.json({ ok: true, registrationId: cancelled.id, status: cancelled.status }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Venue membership required");
    if (error instanceof Error && error.message === "registration_not_found") return apiError(404, "not_found", "Registration not found");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
