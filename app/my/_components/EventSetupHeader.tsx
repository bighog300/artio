import { Badge } from "@/components/ui/badge";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;

function getStatusMeta(status: SubmissionStatus, isPublished: boolean) {
  if (isPublished || status === "APPROVED") return { label: "Published", subtext: "Visible on ArtPulse.", variant: "default" as const };
  if (status === "SUBMITTED") return { label: "Submitted", subtext: "Under review.", variant: "secondary" as const };
  if (status === "REJECTED") return { label: "Changes requested", subtext: "Fix the items below and resubmit.", variant: "destructive" as const };
  return { label: "Draft", subtext: "Not visible publicly yet.", variant: "outline" as const };
}

export default function EventSetupHeader({ event, submissionStatus }: { event: { title: string | null; isPublished: boolean }; submissionStatus: SubmissionStatus }) {
  const status = getStatusMeta(submissionStatus, event.isPublished);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{event.title?.trim() || "Untitled event"}</h1>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{status.subtext}</p>
    </section>
  );
}
