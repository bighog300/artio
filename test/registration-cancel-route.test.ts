import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleDeleteRegistrationByConfirmationCode } from "@/lib/registration-cancel-route";

type Status = "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED";

function makeRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/registrations/AP-ABC123", {
    method: "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeDeps(options?: {
  sessionUserId?: string | null;
  registration?: {
    id: string;
    userId: string | null;
    guestEmail: string;
    status: Status;
    venueId: string;
  } | null;
  isVenueMember?: boolean;
  promoted?: { id: string; guestEmail: string; confirmationCode: string } | null;
}) {
  const sent: Array<{ type: string; toEmail: string; dedupeKey: string; payload: Record<string, unknown> }> = [];

  const registration = options?.registration === undefined
    ? {
        id: "reg-1",
        userId: "user-1",
        eventId: "event-1",
        tierId: null,
        guestEmail: "owner@example.com",
        confirmationCode: "AP-ABC123",
        status: "CONFIRMED" as const,
        event: {
          title: "Spring Open",
          slug: "spring-open",
          venueId: "venue-1",
        },
      }
    : options.registration === null
      ? null
      : {
          id: options.registration.id,
          userId: options.registration.userId,
          eventId: "event-1",
          tierId: null,
          guestEmail: options.registration.guestEmail,
          confirmationCode: "AP-ABC123",
          status: options.registration.status,
          event: {
            title: "Spring Open",
            slug: "spring-open",
            venueId: options.registration.venueId,
          },
        };

  return {
    sent,
    deps: {
      getSessionUser: async () => (options?.sessionUserId ? { id: options.sessionUserId } : null),
      findRegistrationByConfirmationCode: async () => registration,
      hasVenueMembership: async () => options?.isVenueMember ?? false,
      prisma: {
        $transaction: async <T>(fn: (tx: {
          event: {
            findUnique: () => Promise<{ capacity: number | null } | null>;
          };
          registration: {
            findUnique: () => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: Status } | null>;
            update: (args: { where: { id: string }; data: { status: "CANCELLED"; cancelledAt: Date } | { status: "CONFIRMED" } }) => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: Status }>;
            count: () => Promise<number>;
            findFirst: () => Promise<{ id: string; eventId: string; tierId: string | null; guestEmail: string; confirmationCode: string; status: Status } | null>;
          };
        }) => Promise<T>) => fn({
          event: {
            findUnique: async () => ({ capacity: 10 }),
          },
          registration: {
            findUnique: async () => {
              if (!registration) return null;
              return {
                id: registration.id,
                eventId: registration.eventId,
                tierId: registration.tierId,
                guestEmail: registration.guestEmail,
                confirmationCode: registration.confirmationCode,
                status: registration.status,
              };
            },
            update: async (args) => {
              if (args.data.status === "CANCELLED") {
                return {
                  id: registration?.id ?? "reg-1",
                  eventId: "event-1",
                  tierId: null,
                  guestEmail: registration?.guestEmail ?? "owner@example.com",
                  confirmationCode: "AP-ABC123",
                  status: "CANCELLED",
                };
              }
              return {
                id: options?.promoted?.id ?? "reg-2",
                eventId: "event-1",
                tierId: null,
                guestEmail: options?.promoted?.guestEmail ?? "waitlisted@example.com",
                confirmationCode: options?.promoted?.confirmationCode ?? "AP-WAIT123",
                status: "CONFIRMED",
              };
            },
            count: async () => (options?.promoted ? 9 : 10),
            findFirst: async () => {
              if (!options?.promoted) return null;
              return {
                id: options.promoted.id,
                eventId: "event-1",
                tierId: null,
                guestEmail: options.promoted.guestEmail,
                confirmationCode: options.promoted.confirmationCode,
                status: "WAITLISTED",
              };
            },
          },
        }),
      },
      enqueueNotificationOutbox: async (payload: { type: "REGISTRATION_CANCELLED" | "REGISTRATION_CONFIRMED"; toEmail: string; dedupeKey: string; payload: Record<string, unknown> }) => {
        sent.push(payload);
        return null;
      },
    },
  };
}

test("self-cancel by userId returns 200", async () => {
  const { deps } = makeDeps({ sessionUserId: "user-1" });
  const res = await handleDeleteRegistrationByConfirmationCode(makeRequest(), "AP-ABC123", deps);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "CANCELLED" });
});

test("guest can cancel with matching email", async () => {
  const { deps } = makeDeps({
    sessionUserId: null,
    registration: { id: "reg-1", userId: null, guestEmail: "guest@example.com", status: "CONFIRMED", venueId: "venue-1" },
  });

  const res = await handleDeleteRegistrationByConfirmationCode(makeRequest({ email: "Guest@Example.com" }), "AP-ABC123", deps);
  assert.equal(res.status, 200);
});

test("organiser can cancel by venue membership", async () => {
  const { deps } = makeDeps({
    sessionUserId: "organizer-1",
    registration: { id: "reg-1", userId: "attendee-1", guestEmail: "owner@example.com", status: "CONFIRMED", venueId: "venue-2" },
    isVenueMember: true,
  });

  const res = await handleDeleteRegistrationByConfirmationCode(makeRequest(), "AP-ABC123", deps);
  assert.equal(res.status, 200);
});

test("waitlist promotion on cancellation", async () => {
  const { deps, sent } = makeDeps({
    sessionUserId: "user-1",
    promoted: { id: "reg-2", guestEmail: "waitlisted@example.com", confirmationCode: "AP-WAIT123" },
  });

  const res = await handleDeleteRegistrationByConfirmationCode(makeRequest(), "AP-ABC123", deps);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.type, "REGISTRATION_CONFIRMED");
});

test("cancellation email enqueued", async () => {
  const { deps, sent } = makeDeps({ sessionUserId: "user-1" });

  await handleDeleteRegistrationByConfirmationCode(makeRequest({ reason: "Cannot attend" }), "AP-ABC123", deps);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.type, "REGISTRATION_CANCELLED");
  assert.equal(sent[0]?.toEmail, "owner@example.com");
});

test("promoted attendee confirmation email enqueued", async () => {
  const { deps, sent } = makeDeps({
    sessionUserId: "user-1",
    promoted: { id: "reg-2", guestEmail: "promoted@example.com", confirmationCode: "AP-PROMO" },
  });

  await handleDeleteRegistrationByConfirmationCode(makeRequest(), "AP-ABC123", deps);

  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.type, "REGISTRATION_CONFIRMED");
  assert.equal(sent[1]?.toEmail, "promoted@example.com");
});

test("returns 400 when already cancelled", async () => {
  const { deps } = makeDeps({
    sessionUserId: "user-1",
    registration: { id: "reg-1", userId: "user-1", guestEmail: "owner@example.com", status: "CANCELLED", venueId: "venue-1" },
  });

  const res = await handleDeleteRegistrationByConfirmationCode(makeRequest(), "AP-ABC123", deps);
  assert.equal(res.status, 400);
});

test("returns 404 for unknown confirmation code", async () => {
  const { deps } = makeDeps({ registration: null });

  const res = await handleDeleteRegistrationByConfirmationCode(makeRequest({ email: "a@example.com" }), "MISSING", deps);
  assert.equal(res.status, 404);
});
