import { Badge } from "@/components/ui/badge";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;

function getStatusMeta(status: SubmissionStatus, isPublished: boolean) {
  if (isPublished || status === "APPROVED") {
    return { label: "Published", subtext: "Published — visible on ArtPulse.", variant: "default" as const };
  }
  if (status === "SUBMITTED") {
    return { label: "Submitted", subtext: "Submitted — in the Admin review queue.", variant: "secondary" as const };
  }
  if (status === "REJECTED") {
    return { label: "Changes requested", subtext: "Changes requested — fix issues and resubmit.", variant: "destructive" as const };
  }
  return { label: "Draft", subtext: "Draft — not yet submitted for admin approval.", variant: "outline" as const };
}

export default function VenueSetupHeader({
  venue,
  submissionStatus,
}: {
  venue: { name: string; isPublished: boolean };
  submissionStatus: SubmissionStatus;
}) {
  const status = getStatusMeta(submissionStatus, venue.isPublished);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{venue.name}</h1>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{status.subtext}</p>
    </section>
  );
}
