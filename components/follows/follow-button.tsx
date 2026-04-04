"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEngagement } from "@/lib/engagement-client";
import { track } from "@/lib/analytics/client";
import { enqueueToast } from "@/lib/toast";
import { recordFeedback } from "@/lib/personalization/feedback";
import { recordOutcome, type PersonalizationSource } from "@/lib/personalization/measurement";

type FollowButtonProps = {
  targetType: "ARTIST" | "VENUE" | "USER";
  targetId: string;
  initialIsFollowing: boolean;
  initialFollowersCount: number;
  isAuthenticated: boolean;
  analyticsSlug?: string;
  onToggled?: (nextState: "followed" | "unfollowed") => void;
  personalizationSourceHint?: PersonalizationSource;
};

type ToggleDeps = {
  fetcher: (nextIsFollowing: boolean) => Promise<boolean>;
  onOptimistic: (nextIsFollowing: boolean) => void;
  onRevert: (nextIsFollowing: boolean) => void;
  onSuccess: (nextIsFollowing: boolean) => void;
  onError: () => void;
};

export async function runOptimisticFollowToggle(nextIsFollowing: boolean, deps: ToggleDeps) {
  deps.onOptimistic(nextIsFollowing);
  try {
    const ok = await deps.fetcher(nextIsFollowing);
    if (!ok) {
      deps.onRevert(nextIsFollowing);
      deps.onError();
      return;
    }
    deps.onSuccess(nextIsFollowing);
  } catch {
    deps.onRevert(nextIsFollowing);
    deps.onError();
  }
}

export function FollowButton({
  targetType,
  targetId,
  initialIsFollowing,
  initialFollowersCount,
  isAuthenticated,
  analyticsSlug,
  onToggled,
  personalizationSourceHint,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followersCount, setFollowersCount] = useState(initialFollowersCount);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessHint, setShowSuccessHint] = useState(false);

  useEffect(() => {
    if (!showSuccessHint) return;
    const timeout = setTimeout(() => setShowSuccessHint(false), 2000);
    return () => clearTimeout(timeout);
  }, [showSuccessHint]);

  async function onToggle() {
    if (!isAuthenticated || isSaving) return;

    const nextIsFollowing = !isFollowing;
    setIsSaving(true);

    await runOptimisticFollowToggle(nextIsFollowing, {
      onOptimistic: (next) => {
        setIsFollowing(next);
        setFollowersCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
      },
      fetcher: async (next) => {
        const response = await fetch("/api/follows", {
          method: next ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType, targetId }),
        });
        return response.ok;
      },
      onRevert: (next) => {
        setIsFollowing(!next);
        setFollowersCount((prev) => Math.max(0, prev + (next ? -1 : 1)));
      },
      onSuccess: (next) => {
        if (targetType !== "USER") {
          trackEngagement({
            surface: "FOLLOWING",
            action: "FOLLOW",
            targetType,
            targetId,
          });
        }
        const itemType = targetType === "ARTIST" ? "artist" : targetType === "VENUE" ? "venue" : undefined;
        track("entity_follow_toggled", {
          type: itemType,
          slug: analyticsSlug,
          nextState: next ? "followed" : "unfollowed",
        });
        if (next && itemType) {
          recordFeedback({
            type: "follow",
            source: "following",
            item: { type: itemType, idOrSlug: analyticsSlug ?? targetId },
          });
          recordOutcome({ action: "follow", itemType, itemKey: `${itemType}:${analyticsSlug ?? targetId}`.toLowerCase(), sourceHint: personalizationSourceHint });
        }
        enqueueToast({ title: next ? "Following updated" : "Unfollowed" });
        onToggled?.(next ? "followed" : "unfollowed");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("artio:follow_toggled", { detail: { nextState: next ? "followed" : "unfollowed" } }));
        }
        setShowSuccessHint(true);
      },
      onError: () => enqueueToast({ title: "Could not update follow", variant: "error" }),
    });

    setTimeout(() => setIsSaving(false), 600);
  }

  if (!isAuthenticated) {
    return (
      <Link className="inline-flex rounded border border-border px-3 py-1 text-sm ui-trans ui-press hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="/login">
        Sign in to follow · {followersCount}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isSaving}
      className="group inline-flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm ui-trans ui-press hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      aria-pressed={isFollowing}
      aria-busy={isSaving}
      aria-label={`${isFollowing ? "Unfollow" : "Follow"} ${targetType.toLowerCase()} with ${followersCount} followers`}
    >
      <span className={`ui-trans ${isFollowing ? "opacity-100" : "opacity-80"}`}>{isFollowing ? "Following" : "Follow"}</span>
      <span aria-hidden="true">·</span>
      <span>{followersCount}</span>
      {isSaving ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" /> : null}
      <span className="sr-only" aria-live="polite">{isSaving ? "Updating follow" : showSuccessHint ? "Follow updated" : ""}</span>
    </button>
  );
}
