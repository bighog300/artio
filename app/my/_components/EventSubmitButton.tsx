"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";
import { submitEventForReviewRequest } from "@/app/my/_components/MyEventSubmitButton";
import type { ContentStatus } from "@prisma/client";

type SubmissionStatus = ContentStatus | null;

function deriveEventSubmitButtonUiState({
  isReady,
  initialStatus,
  isSubmitting,
  locallySubmitted,
  ctaLabel = "Submit Event for Review",
  pendingHelperText = "Your event is awaiting review.",
  submittingHelperText = "Submitting your event for review.",
  readyHelperText = "Ready to submit for approval.",
}: {
  isReady: boolean;
  initialStatus?: SubmissionStatus;
  isSubmitting: boolean;
  locallySubmitted: boolean;
  ctaLabel?: string;
  pendingHelperText?: string;
  submittingHelperText?: string;
  readyHelperText?: string;
}) {
  if (locallySubmitted || initialStatus === "IN_REVIEW") return { label: "Submitted (pending)", disabled: true, helperText: pendingHelperText };
  if (isSubmitting) return { label: "Submitting…", disabled: true, helperText: submittingHelperText };
  if (!isReady) return { label: ctaLabel, disabled: true, helperText: "Complete required fields to submit." };
  return { label: ctaLabel, disabled: false, helperText: readyHelperText };
}

export default function EventSubmitButton({ eventId, isReady, blocking = [], initialStatus = null, ctaLabel, pendingHelperText, submittingHelperText, readyHelperText }: { eventId: string; isReady: boolean; blocking?: { id: string; label: string }[]; initialStatus?: SubmissionStatus; ctaLabel?: string; pendingHelperText?: string; submittingHelperText?: string; readyHelperText?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);

  const ui = deriveEventSubmitButtonUiState({ isReady, initialStatus, isSubmitting, locallySubmitted, ctaLabel, pendingHelperText, submittingHelperText, readyHelperText });

  async function onSubmit() {
    if (ui.disabled) return;
    setIsSubmitting(true);
    try {
      const result = await submitEventForReviewRequest({ eventId });
      if (!result.ok) {
        if (result.status === 401) {
          window.location.href = buildLoginRedirectUrl(`/my/events/${eventId}`);
          return;
        }
        const message = typeof result.body.message === "string" ? result.body.message : "Unable to submit event for review.";
        enqueueToast({ title: message, variant: "error" });
        return;
      }
      setLocallySubmitted(true);
      enqueueToast({ title: "Event submitted for review.", variant: "success" });
      router.refresh();
    } catch {
      enqueueToast({ title: "Unable to submit event for review.", variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" onClick={onSubmit} disabled={ui.disabled} className="w-full">{ui.label}</Button>
      <p className="text-xs text-muted-foreground">{ui.helperText}</p>
      {!isReady && blocking.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {blocking.map((field) => <li key={field.id}>{field.label}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
