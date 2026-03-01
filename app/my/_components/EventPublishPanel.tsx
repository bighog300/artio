import Link from "next/link";
import type { ContentStatus } from "@prisma/client";
import EventSubmitButton from "@/app/my/_components/EventSubmitButton";
import DirectPublishButton from "@/app/my/_components/DirectPublishButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Checks = {
  readyToSubmit: boolean;
  missing: string[];
};

export default function EventPublishPanel({
  event,
  checks,
  canPublishDirectly = false,
}: {
  event: { id: string; slug: string | null; status: ContentStatus };
  checks: Checks;
  canPublishDirectly?: boolean;
}) {
  const showPublished = event.status === "PUBLISHED";
  const showAwaitingReview = event.status === "IN_REVIEW";

  return (
    <Card id="publish-panel" className="lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle className="text-lg">Publish event</CardTitle>
        <CardDescription>{canPublishDirectly ? "Trusted users can publish or unpublish directly from this panel." : "Complete required items before submitting for review."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showPublished ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-emerald-700">Published</p>
            {event.slug ? <Link className="underline" href={`/events/${event.slug}`}>View public page</Link> : null}
          </div>
        ) : showAwaitingReview ? (
          <p className="text-sm font-medium text-muted-foreground">Awaiting review</p>
        ) : null}

        {canPublishDirectly ? (
          <DirectPublishButton
            endpoint={showPublished ? `/api/my/events/${event.id}/unpublish` : `/api/my/events/${event.id}/publish`}
            entityPath={`/my/events/${event.id}`}
            nextPublished={!showPublished}
            disabled={!showPublished && !checks.readyToSubmit}
          />
        ) : (
          <EventSubmitButton
            ctaLabel="Submit Event for Review"
            eventId={event.id}
            isReady={checks.readyToSubmit}
            blocking={checks.missing.map((item) => ({ id: item, label: item }))}
            initialStatus={event.status}
          />
        )}
      </CardContent>
    </Card>
  );
}
