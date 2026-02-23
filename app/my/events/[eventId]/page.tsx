import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { EditEventForm } from "@/app/my/events/[eventId]/page-client";
import { evaluateEventReadiness } from "@/lib/publish-readiness";
import { PublishReadinessChecklist } from "@/components/publishing/publish-readiness-checklist";

export default async function MyEventEditPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/events");

  const { eventId } = await params;

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      OR: [
        { submissions: { some: { submitterUserId: user.id, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] } } },
        { venue: { memberships: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } } },
      ],
    },
    select: { id: true, title: true, slug: true, startAt: true, endAt: true, venueId: true, ticketUrl: true, isPublished: true, featuredAssetId: true, featuredAsset: { select: { url: true } }, submissions: { where: { type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, submittedAt: true, decidedAt: true, decisionReason: true } } },
  });

  if (!event) notFound();
  const readiness = evaluateEventReadiness(event, event.venueId ? { id: event.venueId } : null);

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Edit event</h1>
      <PublishReadinessChecklist title="Event submit readiness" ready={readiness.ready} blocking={readiness.blocking} warnings={readiness.warnings} />
      <EditEventForm event={event} readyToSubmit={readiness.ready} submission={{ status: event.submissions[0]?.status ?? null, submittedAt: event.submissions[0]?.submittedAt?.toISOString() ?? null, reviewedAt: event.submissions[0]?.decidedAt?.toISOString() ?? null, rejectionReason: event.submissions[0]?.decisionReason ?? null }} />
    </main>
  );
}
