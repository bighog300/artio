import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { resolveVenueIdFromRouteParam } from "@/app/my/venues/[id]/route-param";
import CheckinClient from "./checkin-client";

export default async function VenueEventCheckinPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;
  const user = await getSessionUser();
  if (!user) redirectToLogin(`/my/venues/${id}/checkin/${eventId}`);

  const routeVenue = await resolveVenueIdFromRouteParam(id, db);
  if (!routeVenue) notFound();
  if (routeVenue.redirected) {
    redirect(`/my/venues/${routeVenue.venueId}/checkin/${eventId}`);
  }

  const venueId = routeVenue.venueId;

  const membership = await db.venueMembership.findUnique({
    where: { userId_venueId: { userId: user.id, venueId } },
    select: { id: true },
  });

  if (!membership) notFound();

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      venueId,
      isPublished: true,
    },
    select: {
      id: true,
      title: true,
      startAt: true,
    },
  });

  if (!event) notFound();

  const checkedInAggregate = await db.registration.aggregate({
    where: {
      eventId: event.id,
      status: "CONFIRMED",
      checkedInAt: { not: null },
    },
    _sum: {
      quantity: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4 sm:p-6">
      <CheckinClient
        eventId={event.id}
        eventTitle={event.title}
        eventStartAtIso={event.startAt.toISOString()}
        initialCheckedIn={checkedInAggregate._sum.quantity ?? 0}
      />
    </main>
  );
}
