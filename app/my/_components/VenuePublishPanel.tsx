"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";
import { SubmissionStatusPanel } from "@/components/publishing/submission-status-panel";
import VenueSubmitButton from "@/app/my/_components/VenueSubmitButton";

type PublishIssue = { field: string; message: string };
type ReadinessItem = { id: string; label: string };

type Props = {
  venueId: string;
  venueSlug: string;
  isOwner: boolean;
  isPublished: boolean;
  submissionStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  initialIssues: PublishIssue[];
  readiness: {
    ready: boolean;
    blocking: ReadinessItem[];
  };
};

export default function VenuePublishPanel(props: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<PublishIssue[]>(props.initialIssues);

  async function onSubmit() {
    if (!props.isOwner || pending || props.submissionStatus === "SUBMITTED") return;
    setPending(true);
    setIssues([]);
    try {
      const res = await fetch(`/api/my/venues/${props.venueId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      if (res.status === 401) {
        window.location.href = buildLoginRedirectUrl(`/my/venues/${props.venueId}`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error === "NOT_READY" && Array.isArray(body?.blocking)) setIssues(body.blocking.map((item: { id: string; label: string }) => ({ field: item.id, message: item.label })));
        enqueueToast({ title: body?.message || body?.error || "Unable to submit for review", variant: "error" });
        if (body?.error === "NOT_READY") document.getElementById("publish-readiness")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      enqueueToast({ title: "Submitted for review", variant: "success" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const primaryAction = props.submissionStatus === "SUBMITTED"
    ? { label: "Submitted (pending)", disabled: true }
    : props.isPublished || props.submissionStatus === "APPROVED"
      ? { label: "View public page", href: `/venues/${props.venueSlug}` }
      : { label: "Submit for review", disabled: !props.isOwner || pending || issues.length > 0, onClick: onSubmit };

  return (
    <div className="space-y-3">
      <SubmissionStatusPanel
        entityType="venue"
        status={props.submissionStatus}
        submittedAtISO={props.submittedAt}
        reviewedAtISO={props.reviewedAt}
        rejectionReason={props.decisionReason}
        primaryAction={primaryAction}
        publicHref={props.isPublished || props.submissionStatus === "APPROVED" ? `/venues/${props.venueSlug}` : null}
        readiness={{ ready: issues.length === 0, blocking: issues.map((i) => ({ id: i.field, label: i.message })), warnings: [] }}
      />
      <VenueSubmitButton
        venueId={props.venueId}
        isReady={props.readiness.ready}
        blocking={props.readiness.blocking}
        initialStatus={props.submissionStatus}
      />
    </div>
  );
}
