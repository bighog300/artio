import Link from "next/link";
import VenueSubmitButton from "@/app/my/_components/VenueSubmitButton";
import DirectPublishButton from "@/app/my/_components/DirectPublishButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadinessChecklist } from "@/components/publishing/ReadinessChecklist";
import type { ContentStatus } from "@prisma/client";

type SubmissionStatus = ContentStatus | null;

type Checks = {
  basicInfo: boolean;
  location: boolean;
  images: boolean;
  contact: boolean;
  publishReady: boolean;
  missingRequired: string[];
};

function blockingItemFromMissing(label: string) {
  if (label.includes("basic info")) return { id: "name_description", label };
  if (label.includes("location")) return { id: "location", label };
  if (label.includes("image")) return { id: "images", label };
  return { id: label, label };
}

export default function VenuePublishPanel({
  venue,
  checks,
  submissionStatus,
  isOwner,
  canPublishDirectly = false,
}: {
  venue: { id: string; slug: string; isPublished: boolean };
  checks: Checks;
  submissionStatus: SubmissionStatus;
  isOwner: boolean;
  canPublishDirectly?: boolean;
}) {
  const showAwaitingReview = submissionStatus === "IN_REVIEW";
  const showPublished = venue.isPublished || submissionStatus === "APPROVED";

  return (
    <Card id="publish-panel" className="lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle className="text-lg">Publish venue</CardTitle>
        <CardDescription>{canPublishDirectly ? "Trusted users can publish or unpublish directly from this panel." : "Complete required items before submitting for review."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReadinessChecklist
          items={[
            { label: "Basic info", complete: checks.basicInfo },
            { label: "Location", complete: checks.location },
            { label: "Images", complete: checks.images },
            { label: "Contact / details", complete: checks.contact },
          ]}
        />

        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          <p className="font-medium">{canPublishDirectly ? "Direct publish control" : "What happens next"}</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {canPublishDirectly ? (
              <>
                <li>Publish immediately when checks are complete.</li>
                <li>Unpublish without archiving if you need to make changes.</li>
              </>
            ) : (
              <>
                <li>Submitting sends your venue to the moderation queue for review.</li>
                <li>We review core listing details like description, location, links, and images.</li>
                <li>Most reviews are completed quickly, but timing can vary with queue volume.</li>
                <li>You can continue editing while your submission is under review.</li>
              </>
            )}
          </ul>
        </div>

        <div className="space-y-2">
          {showPublished ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-emerald-700">Published</p>
              <Link className="underline" href={`/venues/${venue.slug}`}>View public page</Link>
            </div>
          ) : showAwaitingReview ? (
            <p className="text-sm font-medium text-muted-foreground">Awaiting review (Admin queue)</p>
          ) : checks.publishReady ? (
            <p className="text-sm font-medium text-emerald-700">{canPublishDirectly ? "Ready to publish directly" : "Ready to submit for admin approval"}</p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium">What&apos;s missing</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {checks.missingRequired.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {canPublishDirectly ? (
            <DirectPublishButton
              endpoint={showPublished ? `/api/my/venues/${venue.id}/unpublish` : `/api/my/venues/${venue.id}/publish`}
              entityPath={`/my/venues/${venue.id}`}
              nextPublished={!showPublished}
              disabled={!showPublished && (!checks.publishReady || !isOwner)}
            />
          ) : (
            <VenueSubmitButton
              venueId={venue.id}
              isReady={checks.publishReady && isOwner}
              ctaLabel="Submit for review"
              blocking={checks.missingRequired.map(blockingItemFromMissing)}
              initialStatus={submissionStatus}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
