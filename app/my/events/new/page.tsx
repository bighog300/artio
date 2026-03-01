import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { CreateEventForm } from "@/app/my/events/_components/CreateEventForm";

export default async function NewEventPage({ searchParams }: { searchParams?: Promise<{ venueId?: string | string[] | undefined }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/events/new");

  const memberships = await db.venueMembership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } },
    select: { venueId: true },
  });

  const params = await searchParams;
  const venueIdFromQuery = typeof params?.venueId === "string" ? params.venueId : undefined;
  const membershipVenueIds = new Set(memberships.map((membership) => membership.venueId));
  const preselectedVenueId = venueIdFromQuery && membershipVenueIds.has(venueIdFromQuery)
    ? venueIdFromQuery
    : memberships.length === 1
      ? memberships[0]!.venueId
      : undefined;

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">New Event</h1>
      <CreateEventForm defaultVenueId={preselectedVenueId} />
    </main>
  );
}
