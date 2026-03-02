"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";
import type { ContentStatus } from "@prisma/client";

type SubmissionStatus = ContentStatus | null;

type SubmitVenueForReviewParams = {
  venueId: string;
  fetchImpl?: typeof fetch;
};

type SubmitVenueForReviewResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function submitVenueForReviewRequest({ venueId, fetchImpl = fetch }: SubmitVenueForReviewParams): Promise<SubmitVenueForReviewResult> {
  const response = await fetchImpl(`/api/my/venues/${venueId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (response.ok) return { ok: true };
  const body = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, body };
}

export function deriveVenueSubmitButtonUiState({
  isReady,
  initialStatus,
  isSubmitting,
  locallySubmitted,
  ctaLabel = "Submit Venue for Review",
}: {
  isReady: boolean;
  initialStatus?: SubmissionStatus;
  isSubmitting: boolean;
  locallySubmitted: boolean;
  ctaLabel?: string;
}) {
  const normalizedStatus = typeof initialStatus === "string" ? initialStatus.toUpperCase() : null;
  const isSubmittedPending = locallySubmitted || normalizedStatus === "IN_REVIEW";
  if (isSubmittedPending) {
    return {
      label: "Submitted (pending)",
      disabled: true,
      helperText: "Your venue is awaiting review.",
    };
  }

  if (isSubmitting) {
    return {
      label: "Submitting…",
      disabled: true,
      helperText: "Submitting your venue for review.",
    };
  }

  if (!isReady) {
    return {
      label: ctaLabel,
      disabled: true,
      helperText: "Complete required fields to submit.",
    };
  }

  return {
    label: ctaLabel,
    disabled: false,
    helperText: "Ready to submit for approval.",
  };
}

export default function VenueSubmitButton({
  venueId,
  isReady,
  blocking = [],
  initialStatus = null,
  ctaLabel,
}: {
  venueId: string;
  isReady: boolean;
  blocking?: { id: string; label: string }[];
  initialStatus?: SubmissionStatus;
  ctaLabel?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);

  const uiState = deriveVenueSubmitButtonUiState({
    isReady,
    initialStatus,
    isSubmitting,
    locallySubmitted,
    ctaLabel,
  });

  async function onSubmit() {
    if (uiState.disabled) return;
    setIsSubmitting(true);
    try {
      const result = await submitVenueForReviewRequest({ venueId });
      if (!result.ok) {
        if (result.status === 401) {
          window.location.href = buildLoginRedirectUrl(`/my/venues/${venueId}`);
          return;
        }
        const message = typeof result.body.message === "string"
          ? result.body.message
          : typeof result.body.error === "string"
            ? result.body.error
            : "Unable to submit venue for review.";
        enqueueToast({ title: message, variant: "error" });
        return;
      }

      setLocallySubmitted(true);
      enqueueToast({ title: "Venue submitted for review.", variant: "success" });
      router.refresh();
    } catch {
      enqueueToast({ title: "Unable to submit venue for review.", variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button type="button" onClick={onSubmit} disabled={uiState.disabled}>
        {uiState.label}
      </Button>
      <p className="text-xs text-muted-foreground">{uiState.helperText}</p>
      {!isReady && blocking.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {blocking.map((field) => (
            <li key={field.id}>{field.label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
