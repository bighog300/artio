"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import type { ArtistCompletenessResult } from "@/lib/publish-readiness";

export function ProfileCompletenessSidebar({
  completeness,
  artistId,
  isPublished,
  status,
  publicUrl,
}: {
  completeness: ArtistCompletenessResult;
  artistId: string;
  isPublished: boolean;
  status: string;
  publicUrl: string;
}) {
  const [showRecommended, setShowRecommended] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const missingRecommended = completeness.recommended.filter((i) => !i.done).length;

  async function handleGoLive() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/my/artist/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        enqueueToast({
          title: body?.error?.message ?? "Submission failed",
          variant: "error",
        });
        return;
      }
      setSubmitted(true);
      enqueueToast({ title: "Profile submitted for review", variant: "success" });
    } catch {
      enqueueToast({ title: "Network error — please try again", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sticky top-4 space-y-4 rounded-xl border bg-card p-4">
      {/* Score bar */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">Profile completeness</span>
          <span className="text-sm font-semibold">{completeness.score}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              completeness.score === 100
                ? "bg-emerald-500"
                : completeness.score >= 60
                  ? "bg-amber-500"
                  : "bg-rose-500"
            }`}
            style={{ width: `${completeness.score}%` }}
          />
        </div>
      </div>

      {/* Required checklist */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Required
        </p>
        <ul className="space-y-2">
          {completeness.required.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 ${item.done ? "text-emerald-600" : "text-orange-500"}`}>
                {item.done ? "✓" : "○"}
              </span>
              {item.done ? (
                <span className="text-muted-foreground line-through">{item.label}</span>
              ) : item.href ? (
                <a href={item.href} className="underline hover:text-foreground">
                  {item.label}
                </a>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Recommended checklist (collapsible) */}
      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowRecommended((s) => !s)}
        >
          {showRecommended ? "Hide" : "Show"} recommended
          {missingRecommended > 0 ? ` (${missingRecommended} missing)` : " ✓"}
        </button>
        {showRecommended && (
          <ul className="mt-2 space-y-2">
            {completeness.recommended.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 shrink-0 ${item.done ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {item.done ? "✓" : "○"}
                </span>
                {item.done ? (
                  <span className="text-muted-foreground line-through">{item.label}</span>
                ) : item.href ? (
                  <a href={item.href} className="underline hover:text-foreground">
                    {item.label}
                  </a>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Status / CTA section */}
      {isPublished ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-800">✓ Profile is live</p>
          <Link
            href={publicUrl}
            target="_blank"
            className="mt-1 block text-xs text-emerald-700 underline"
          >
            View public profile →
          </Link>
        </div>
      ) : status === "IN_REVIEW" || submitted ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">⏳ Under review</p>
          <p className="mt-1 text-xs text-amber-700">
            We&apos;ll notify you when a decision is made.
          </p>
        </div>
      ) : completeness.canGoLive ? (
        <Button
          className="w-full"
          onClick={() => void handleGoLive()}
          disabled={submitting}
        >
          {submitting ? "Submitting…" : "Go live →"}
        </Button>
      ) : (
        <Button className="w-full" variant="outline" disabled>
          Complete required items to go live
        </Button>
      )}
    </div>
  );
}
