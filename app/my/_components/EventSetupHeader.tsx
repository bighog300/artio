import { Badge } from "@/components/ui/badge";
import type { ContentStatus } from "@prisma/client";
import { getPublisherStatusLabel } from "@/lib/publish-intent";

type SubmissionStatus = ContentStatus | null;

export default function EventSetupHeader({
  event,
  submissionStatus,
  reviewNotes,
}: {
  event: { title: string | null; isPublished: boolean; deletedAt?: Date | null };
  submissionStatus: SubmissionStatus;
  reviewNotes?: string | null;
}) {
  const normalizedStatus = event.deletedAt ? "ARCHIVED" : event.isPublished ? "PUBLISHED" : (submissionStatus ?? "DRAFT");
  const label = getPublisherStatusLabel(normalizedStatus);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{event.title?.trim() || "Untitled event"}</h1>
        <Badge variant={label === "Live" ? "default" : label === "Under review" ? "secondary" : label === "Needs changes" ? "destructive" : "outline"}>{label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{label === "Live" ? "This listing is visible publicly." : label === "Under review" ? "Your listing is in moderation." : label === "Needs changes" ? "Please fix required items, then publish again." : label === "Archived" ? "This listing is archived." : "This listing is not public yet."}</p>
      {(normalizedStatus === "CHANGES_REQUESTED" || normalizedStatus === "REJECTED") && reviewNotes ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Reviewer feedback</p>
          <p className="mt-1">{reviewNotes}</p>
        </div>
      ) : null}
    </section>
  );
}
