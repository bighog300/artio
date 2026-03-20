export type PublishOutcome = "published" | "submitted" | "blocked";

export type UnifiedPublishStatus = "DRAFT" | "ONBOARDING" | "IN_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED" | "APPROVED" | "CHANGES_REQUESTED";

export type PublishBlockingIssue = {
  key: string;
  label: string;
  href?: string;
};

export type PublishIntentResponse = {
  outcome: PublishOutcome;
  status: UnifiedPublishStatus;
  message: string;
  publicUrl?: string;
  blockingIssues?: PublishBlockingIssue[];
};

export function getPublisherStatusLabel(status: UnifiedPublishStatus): "Draft" | "Under review" | "Live" | "Needs changes" | "Archived" {
  if (status === "PUBLISHED" || status === "APPROVED") return "Live";
  if (status === "IN_REVIEW") return "Under review";
  if (status === "REJECTED" || status === "CHANGES_REQUESTED") return "Needs changes";
  if (status === "ARCHIVED") return "Archived";
  return "Draft";
}

export function toPublishBlockingIssues(
  issues: Array<{ id: string; label: string; href?: string }>,
): PublishBlockingIssue[] {
  return issues.map((issue) => ({ key: issue.id, label: issue.label, href: issue.href }));
}
