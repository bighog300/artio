"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";
import { SubmissionStatusPanel } from "@/components/publishing/submission-status-panel";

type PublishIssue = { field: string; message: string };

type Props = {
  artistSlug: string;
  isPublished: boolean;
  submissionStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  initialIssues: PublishIssue[];
};

export function ArtistPublishPanel(props: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<PublishIssue[]>(props.initialIssues);

  async function onSubmit() {
    if (pending || props.submissionStatus === "IN_REVIEW") return;
    setPending(true);
    setIssues([]);
    try {
      const res = await fetch("/api/my/artist/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      if (res.status === 401) {
        window.location.href = buildLoginRedirectUrl("/my/artist");
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

  const primaryAction = props.submissionStatus === "IN_REVIEW"
    ? { label: "Submitted (pending)", disabled: true }
    : props.isPublished || props.submissionStatus === "APPROVED"
      ? { label: "View public page", href: `/artists/${props.artistSlug}` }
      : { label: "Submit for review", disabled: pending || issues.length > 0, onClick: onSubmit };

  return <SubmissionStatusPanel entityType="artist" status={props.submissionStatus} submittedAtISO={props.submittedAt} reviewedAtISO={props.reviewedAt} rejectionReason={props.decisionReason} primaryAction={primaryAction} publicHref={props.isPublished || props.submissionStatus === "APPROVED" ? `/artists/${props.artistSlug}` : null} readiness={{ ready: issues.length === 0, blocking: issues.map((i) => ({ id: i.field, label: i.message })), warnings: [] }} />;
}
