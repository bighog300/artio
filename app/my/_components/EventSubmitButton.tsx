"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";
import { submitEventForReviewRequest } from "@/app/my/_components/MyEventSubmitButton";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;

function deriveEventSubmitButtonUiState({
  isReady,
  initialStatus,
  isSubmitting,
  locallySubmitted,
}: {
  isReady: boolean;
  initialStatus?: SubmissionStatus;
  isSubmitting: boolean;
  locallySubmitted: boolean;
}) {
  if (locallySubmitted || initialStatus === "SUBMITTED") return { label: "Submitted (pending)", disabled: true, helperText: "Your event is awaiting review." };
  if (isSubmitting) return { label: "Submitting…", disabled: true, helperText: "Submitting your event for review." };
  if (!isReady) return { label: "Submit Event for Review", disabled: true, helperText: "Complete required fields to submit." };
  return { label: "Submit Event for Review", disabled: false, helperText: "Ready to submit for approval." };
}

export default function EventSubmitButton({ eventId, isReady, blocking = [], initialStatus = null }: { eventId: string; isReady: boolean; blocking?: { id: string; label: string }[]; initialStatus?: SubmissionStatus }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);

  const ui = deriveEventSubmitButtonUiState({ isReady, initialStatus, isSubmitting, locallySubmitted });

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
