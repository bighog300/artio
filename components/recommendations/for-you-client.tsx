"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCard } from "@/components/events/event-card";
import { ItemActionsMenu } from "@/components/personalization/item-actions-menu";
import { WhyThis } from "@/components/personalization/why-this";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import { LoadingCard } from "@/components/ui/loading-card";
import { track } from "@/lib/analytics/client";
import { buildExplanation } from "@/lib/personalization/explanations";
import { RANKING_VERSION, rankItems } from "@/lib/personalization/ranking";
import { getPreferenceSnapshot } from "@/lib/personalization/preferences";
import { recordFeedback } from "@/lib/personalization/feedback";
import { recordExposureBatch, recordOutcome } from "@/lib/personalization/measurement";
import { getOnboardingSignals, type OnboardingSignals } from "@/lib/onboarding/signals";

type ForYouResponse = {
  windowDays: number;
  items: Array<{
    score: number;
    reasons: string[];
    event: {
      id: string;
      title: string;
      slug: string;
      startAt: string;
      venue: { name: string; slug: string; city: string | null } | null;
    };
  }>;
};

const emptySignals: OnboardingSignals = {
  followsCount: 0,
  followedArtistSlugs: [],
  followedVenueSlugs: [],
  followedArtistNames: [],
  followedVenueNames: [],
  savedEventsCount: 0,
  savedSearchesCount: 0,
  hasLocation: false,
};

const debugEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PERSONALIZATION_DEBUG === "true";

type ForYouSessionStatus = "authenticated" | "unauthenticated" | "loading";

export async function fetchForYouRecommendations({
  status,
  hasUser,
  signal,
  fetchImpl = fetch,
}: {
  status: ForYouSessionStatus;
  hasUser: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ kind: "skipped" | "unauthorized" | "error" } | { kind: "success"; data: ForYouResponse }> {
  if (status !== "authenticated" || !hasUser) return { kind: "skipped" };

  const response = await fetchImpl("/api/recommendations/for-you?days=7&limit=20", { cache: "no-store", signal });
  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "error" };
  const data = (await response.json()) as ForYouResponse;
  return { kind: "success", data };
}

export function shouldAttemptForYouFetch({
  attempted,
  lockedOut,
  status,
  hasUser,
}: {
  attempted: boolean;
  lockedOut: boolean;
  status: ForYouSessionStatus;
  hasUser: boolean;
}): boolean {
  return !lockedOut && !attempted && status === "authenticated" && hasUser;
}

export function ForYouClient() {
  const session = useSession();
  const status = session?.status ?? "unauthenticated";
  const hasUser = Boolean(session?.data?.user);
  const [data, setData] = useState<ForYouResponse>({ windowDays: 7, items: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthFallback, setShowAuthFallback] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [signals, setSignals] = useState<OnboardingSignals>(emptySignals);
  const attemptedRef = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    const result = await fetchForYouRecommendations({ status, hasUser, signal });
    if (signal?.aborted) return;
    if (result.kind === "skipped") {
      setShowAuthFallback(true);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (result.kind === "unauthorized") {
      setShowAuthFallback(true);
      setLockedOut(true);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (result.kind === "error") {
      setShowAuthFallback(false);
      setError("Unable to load recommendations right now.");
      setIsLoading(false);
      return;
    }
    if (result.kind === "success") {
      setData(result.data);
      setShowAuthFallback(false);
      setError(null);
      setIsLoading(false);
    }
  }, [hasUser, status]);

  useEffect(() => {
    if (status === "loading") {
      setIsLoading(true);
      return;
    }

    if (status === "unauthenticated" || !hasUser || lockedOut) {
      setShowAuthFallback(true);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!shouldAttemptForYouFetch({ attempted: attemptedRef.current, lockedOut, status, hasUser })) return;

    attemptedRef.current = true;
    const controller = new AbortController();
    void load(controller.signal);

    return () => {
      controller.abort();
    };
  }, [hasUser, load, lockedOut, status]);

  useEffect(() => {
    let cancelled = false;
    void getOnboardingSignals().then((next) => {
      if (!cancelled) setSignals(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const rankedItems = useMemo(() => {
    const visible = data.items.filter((item) => !hiddenIds.includes(item.event.id));
    const seed = data.items.length + new Date().getDate();
    const ranked = rankItems(
      visible.map((item) => ({
        ...item,
        id: item.event.id,
        slug: item.event.slug,
        title: item.event.title,
        venueSlug: item.event.venue?.slug,
        hasLocation: Boolean(item.event.venue?.city),
        sourceCategory: item.event.venue?.city ? "nearby" as const : "trending" as const,
        tags: item.reasons,
        entityType: "event" as const,
      })),
      {
        source: "for_you",
        signals: {
          followedArtistSlugs: signals.followedArtistSlugs,
          followedVenueSlugs: signals.followedVenueSlugs,
          hasLocation: signals.hasLocation,
          recentViewTerms: visible.flatMap((item) => item.reasons).slice(0, 8),
        },
        preferences: getPreferenceSnapshot(),
        seed,
      },
    );

    return ranked;
  }, [data.items, hiddenIds, signals]);

  useEffect(() => {
    if (!rankedItems.length) return;
    track("personalization_rank_applied", { rankingSource: "for_you", rankedCount: rankedItems.length, version: RANKING_VERSION });
    recordExposureBatch({
      source: "for_you",
      items: rankedItems.map((ranked, index) => ({
        itemType: "event",
        itemKey: `event:${ranked.item.event.slug ?? ranked.item.event.id}`.toLowerCase(),
        position: index,
        topReasonKind: ranked.topReason ?? "unknown",
        isExploration: ranked.breakdown.some((part) => part.key === "exploration"),
      })),
    });
    track("personalization_mix_applied", { source: "for_you", version: RANKING_VERSION });
    const explorationCount = rankedItems.filter((entry) => entry.breakdown.some((part) => part.key === "exploration")).length;
    if (explorationCount) track("personalization_exploration_inserted", { source: "for_you", count: explorationCount, rate: 0.2, version: RANKING_VERSION });
    if (rankedItems[0].topReason) track("personalization_top_reason", { rankingSource: "for_you", topReason: rankedItems[0].topReason, version: RANKING_VERSION });
    track("personalization_diversity_applied", { rankingSource: "for_you", diversityRules: "venue_top10<=2,tag_streak<=3,category_balance", version: RANKING_VERSION });
  }, [rankedItems]);

  return (
    <section className="space-y-3" aria-busy={isLoading}>
      <p className="text-sm text-gray-700">
        Personalized events in the next {data.windowDays} days based on your follows, saved searches, location, and recent clicks.
      </p>
      {error ? <ErrorCard message={error} onRetry={() => void load()} /> : null}
      {!isLoading && showAuthFallback ? (
        <EmptyState
          title="Log in to see personalized recommendations"
          description="Sign in to get event picks based on your follows, saved searches, and activity."
          actions={[{ label: "Log in", href: `/login?next=${encodeURIComponent("/for-you")}` }]}
        />
      ) : null}
      {isLoading ? (
        <div className="space-y-3">
          <LoadingCard lines={4} />
          <LoadingCard lines={4} />
          <LoadingCard lines={4} />
        </div>
      ) : null}
      {!isLoading && !error && !showAuthFallback && rankedItems.length === 0 ? (
        <EmptyState
          title="Nothing to show—try clearing preferences"
          description="Follow a venue or artist, save a search, or set your location."
          actions={[
            { label: "Follow 3 venues", href: "/venues", variant: "secondary" },
            { label: "Save a search", href: "/search", variant: "secondary" },
            { label: "Set your location", href: "/account", variant: "secondary" },
          ]}
        />
      ) : null}
      {!isLoading && !error && !showAuthFallback ? (
        <div className="space-y-3">
          {rankedItems.map((ranked) => {
            const item = ranked.item;
            const explanation = buildExplanation({
              item: {
                id: item.event.id,
                slug: item.event.slug,
                title: item.event.title,
                source: "recommendations",
                venueSlug: item.event.venue?.slug,
                venueName: item.event.venue?.name,
                topReason: ranked.topReason ?? undefined,
              },
              contextSignals: { ...signals, source: "recommendations", pathname: "/for-you" },
            });

            return (
              <article className="space-y-2" key={item.event.id}>
                <EventCard
                  href={`/events/${item.event.slug}`}
                  title={item.event.title}
                  startAt={item.event.startAt}
                  venueName={item.event.venue?.name}
                  venueSlug={item.event.venue?.slug}
                  badges={item.reasons.slice(0, 2)}
                  secondaryText={debugEnabled ? `Score: ${ranked.score} • ${ranked.breakdown.map((entry) => `${entry.key}:${entry.value}`).join(", ")}` : `Score: ${ranked.score}`}
                  onOpen={() => {
                    recordFeedback({ type: "click", source: "for_you", item: { type: "event", idOrSlug: item.event.id, tags: item.reasons, venueSlug: item.event.venue?.slug } });
                    recordOutcome({ action: "click", itemType: "event", itemKey: `event:${item.event.slug ?? item.event.id}`.toLowerCase(), sourceHint: "for_you" });
                  }}
                  action={<ItemActionsMenu type="event" idOrSlug={item.event.slug} source="for_you" measurementSource="for_you" explanation={explanation} onHidden={() => setHiddenIds((current) => [...current, item.event.id])} />}
                />
                {explanation ? <WhyThis source="for_you" explanation={explanation} /> : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
