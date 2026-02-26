import Link from "next/link";
import EventSubmitButton from "@/app/my/_components/EventSubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;

type Checks = {
  basics: boolean;
  schedule: boolean;
  location: boolean;
  images: boolean;
  readyToSubmit: boolean;
  locationRequired: boolean;
  imagesRequired: boolean;
};

export default function EventPublishPanel({
  event,
  checks,
  submissionStatus,
}: {
  event: { id: string; slug: string | null; isPublished: boolean };
  checks: Checks;
  submissionStatus: SubmissionStatus;
}) {
  const showAwaitingReview = submissionStatus === "SUBMITTED";
  const showPublished = event.isPublished || submissionStatus === "APPROVED";

  return (
    <Card id="publish-panel" className="lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle className="text-lg">Publish event</CardTitle>
        <CardDescription>Complete required items before submitting for review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between"><span>Basics</span><span>{checks.basics ? "✓" : "✕"}</span></li>
          <li className="flex items-center justify-between"><span>Schedule</span><span>{checks.schedule ? "✓" : "✕"}</span></li>
          <li className="flex items-center justify-between"><span>Location</span><span>{checks.location ? "✓" : checks.locationRequired ? "✕" : "○"}</span></li>
          <li className="flex items-center justify-between"><span>Images</span><span>{checks.images ? "✓" : checks.imagesRequired ? "✕" : "○"}</span></li>
        </ul>

        {showPublished ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-emerald-700">Published</p>
            {event.slug ? <Link className="underline" href={`/events/${event.slug}`}>View public page</Link> : null}
          </div>
        ) : showAwaitingReview ? (
          <p className="text-sm font-medium text-muted-foreground">Awaiting review</p>
        ) : (
          <EventSubmitButton
            eventId={event.id}
            isReady={checks.readyToSubmit}
            blocking={[
              !checks.basics ? { id: "basics", label: "Add event title and venue" } : null,
              !checks.schedule ? { id: "schedule", label: "Add a valid event schedule" } : null,
              checks.locationRequired && !checks.location ? { id: "location", label: "Add location coordinates" } : null,
              checks.imagesRequired && !checks.images ? { id: "images", label: "Add an event image" } : null,
            ].filter((item): item is { id: string; label: string } => Boolean(item))}
            initialStatus={submissionStatus}
          />
        )}
      </CardContent>
    </Card>
  );
}
