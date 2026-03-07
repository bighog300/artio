import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { apiError } from "@/lib/api";

type EventRecord = {
  id: string;
  capacity: number | null;
  rsvpClosesAt: Date | null;
};

type TicketTierRecord = {
  id: string;
  name: string;
  capacity: number | null;
  priceAmount: number;
  currency: string;
  sortOrder: number;
};

type RegistrationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "WAITLISTED";

type AggregateResult = { _sum: { quantity: number | null } };

type Deps = {
  findPublishedEventBySlug: (slug: string) => Promise<EventRecord | null>;
  prisma: {
    registration: {
      aggregate: (args: {
        where: {
          eventId: string;
          tierId?: string;
          status: { in: RegistrationStatus[] };
        };
        _sum: { quantity: true };
      }) => Promise<AggregateResult>;
    };
    ticketTier: {
      findMany: (args: {
        where: { eventId: string; isActive: boolean };
        select: { id: true; name: true; capacity: true; priceAmount: true; currency: true; sortOrder: true };
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }];
      }) => Promise<TicketTierRecord[]>;
    };
  };
  now: () => Date;
  unstableCache?: typeof unstable_cache;
};

const ACTIVE_REGISTRATION_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING"];

function toAvailability(capacity: number | null, registered: number) {
  if (capacity == null) return null;
  return Math.max(capacity - registered, 0);
}

export async function handleGetRegistrationAvailability(_req: NextRequest, slug: string, deps: Deps) {
  const cache = deps.unstableCache ?? unstable_cache;

  const getPayload = cache(
    async () => {
      const event = await deps.findPublishedEventBySlug(slug);
      if (!event) return null;

      const [eventRegisteredAggregate, tiers] = await Promise.all([
        deps.prisma.registration.aggregate({
          where: { eventId: event.id, status: { in: ACTIVE_REGISTRATION_STATUSES } },
          _sum: { quantity: true },
        }),
        deps.prisma.ticketTier.findMany({
          where: { eventId: event.id, isActive: true },
          select: { id: true, name: true, capacity: true, priceAmount: true, currency: true, sortOrder: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
      ]);

      const registered = eventRegisteredAggregate._sum.quantity ?? 0;
      const available = toAvailability(event.capacity, registered);

      const tiersWithAvailability = await Promise.all(
        tiers.map(async (tier) => {
          const tierRegisteredAggregate = await deps.prisma.registration.aggregate({
            where: { eventId: event.id, tierId: tier.id, status: { in: ACTIVE_REGISTRATION_STATUSES } },
            _sum: { quantity: true },
          });

          const tierRegistered = tierRegisteredAggregate._sum.quantity ?? 0;
          return {
            id: tier.id,
            name: tier.name,
            capacity: tier.capacity,
            registered: tierRegistered,
            available: toAvailability(tier.capacity, tierRegistered),
            priceAmount: tier.priceAmount,
            currency: tier.currency,
            sortOrder: tier.sortOrder,
          };
        }),
      );

      return {
        capacity: event.capacity,
        registered,
        available,
        isSoldOut: available === 0,
        isRsvpClosed: event.rsvpClosesAt != null && event.rsvpClosesAt.getTime() <= deps.now().getTime(),
        tiers: tiersWithAvailability,
      };
    },
    ["event-registration-availability-v1", slug],
    { revalidate: 5 },
  );

  const payload = await getPayload();
  if (!payload) return apiError(404, "not_found", "Event not found");

  return NextResponse.json(payload, { status: 200 });
}
