import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { db } from "@/lib/db";
import { AttendeesClient } from "@/app/my/events/[eventId]/attendees/attendees-client";

export default async function EventAttendeesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await getSessionUser();
  if (!user) return redirectToLogin("/my/events");

  const { eventId } = await params;

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      venue: { memberships: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } },
    },
    select: { id: true, title: true },
  });

  if (!event) notFound();

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Attendees · {event.title}</h1>
        <a
          href={`/api/my/events/${event.id}/registrations/export`}
          download
          className="inline-flex items-center rounded border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Download CSV
        </a>
      </div>
      <AttendeesClient eventId={event.id} />
    </main>
  );
}
