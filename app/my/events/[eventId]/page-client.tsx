"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmissionStatusPanel } from "@/components/publishing/submission-status-panel";
import { enqueueToast } from "@/lib/toast";
import { FeaturedEventImagePanel } from "@/app/my/events/_components/FeaturedEventImagePanel";

function toLocalDatetime(date: string) {
  const parsed = new Date(date);
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export function EditEventForm({ event, readyToSubmit, submission }: { event: { id: string; title: string; startAt: Date; endAt: Date | null; slug: string | null; isPublished: boolean; featuredAssetId: string | null; featuredAsset: { url: string | null } | null }; readyToSubmit: boolean; submission: { status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null; submittedAt: string | null; reviewedAt: string | null; rejectionReason: string | null } }) {
  const router = useRouter();
  const [title, setTitle] = useState(event.title);
  const [startAt, setStartAt] = useState(toLocalDatetime(event.startAt.toISOString()));
  const [endAt, setEndAt] = useState(event.endAt ? toLocalDatetime(event.endAt.toISOString()) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitForReview() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/my/events/${event.id}/submit`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body?.error === "NOT_READY") document.getElementById("publish-readiness")?.scrollIntoView({ behavior: "smooth", block: "start" });
      enqueueToast({ title: body?.message || body?.error || "Failed to submit event", variant: "error" });
      setSubmitting(false);
      return;
    }
    enqueueToast({ title: "Submitted for review", variant: "success" });
    router.refresh();
    setSubmitting(false);
  }

  return (
    <>
      <SubmissionStatusPanel
        entityType="event"
        status={submission.status}
        submittedAtISO={submission.submittedAt}
        reviewedAtISO={submission.reviewedAt}
        rejectionReason={submission.rejectionReason}
        primaryAction={submission.status === "SUBMITTED" ? { label: "Submitted (pending)", disabled: true } : (event.isPublished || submission.status === "APPROVED") ? { label: "View public page", href: event.slug ? `/events/${event.slug}` : undefined, disabled: !event.slug } : { label: "Submit for review", disabled: !readyToSubmit || submitting, onClick: onSubmitForReview }}
        publicHref={(event.isPublished || submission.status === "APPROVED") && event.slug ? `/events/${event.slug}` : null}
        readiness={{ ready: readyToSubmit, blocking: [], warnings: [] }}
      />
      <FeaturedEventImagePanel eventId={event.id} featuredAssetId={event.featuredAssetId} featuredImageUrl={event.featuredAsset?.url ?? null} />
      <form onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const res = await fetch(`/api/my/events/${event.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, startAt: new Date(startAt).toISOString(), endAt: endAt ? new Date(endAt).toISOString() : null }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error?.message ?? "Failed to save event");
          setSaving(false);
          return;
        }
        router.refresh();
        setSaving(false);
      }} className="max-w-2xl space-y-3 rounded border p-4">
        <label className="block"><span className="text-sm">Title</span><input className="w-full rounded border p-2" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="text-sm">Start at</span><input className="w-full rounded border p-2" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
        <label className="block"><span className="text-sm">End at</span><input className="w-full rounded border p-2" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button></div>
      </form>
    </>
  );
}
