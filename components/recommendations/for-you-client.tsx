"use client";

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
import { trackEngagement } from "@/lib/engagement-client";

type ForYouResponse = {
  windowDays: number;
  items: Array<{
    score: number;
    reasons: string[];
    reason: string;
    reasonCategory: "network" | "trending" | "nearby";
    event: {
      id: string;
      title: string;
      slug: string;
      startAt: string;
      venue: { name: string; slug: string; city: string | null } | null;
      savedByCount?: number;
      inCollectionsCount?: number;
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

export async function fetchForYouRecommendations({
  signal,
  fetchImpl = fetch,
}: {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ kind: "unauthorized" | "error" } | { kind: "success"; data: ForYouResponse }> {
  const response = await fetchImpl("/api/recommendations/for-you?days=7&limit=20", { cache: "no-store", signal });
  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "error" };
  const data = (await response.json()) as ForYouResponse;
  return { kind: "success", data };
}

export function shouldAttemptForYouFetch({
  attempted,
  lockedOut,
}: {
  attempted: boolean;
  lockedOut: boolean;
}): boolean {
  return !lockedOut && !attempted;
}

export function ForYouClient() {
  const [data, setData] = useState<ForYouResponse>({ windowDays: 7, items: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthFallback, setShowAuthFallback] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [feedbackByEventId, setFeedbackByEventId] = useState<Record<string, "up" | "down" | null>>({});
  const [signals, setSignals] = useState<OnboardingSignals>(emptySignals);
  const [areSignalsLoaded, setAreSignalsLoaded] = useState(false);
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(false);
  const [locationPromptError, setLocationPromptError] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const attemptedRef = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    const result = await fetchForYouRecommendations({ signal });
    if (signal?.aborted) return;
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
  }, []);

  useEffect(() => {
    if (lockedOut) {
      setShowAuthFallback(true);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!shouldAttemptForYouFetch({ attempted: attemptedRef.current, lockedOut })) return;

    attemptedRef.current = true;
    const controller = new AbortController();
    void load(controller.signal);

    return () => {
      controller.abort();
    };
  }, [load, lockedOut]);

  useEffect(() => {
    let cancelled = false;
    void getOnboardingSignals()
      .then((next) => {
        if (!cancelled) {
          setSignals(next);
          setAreSignalsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAreSignalsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rankedItems = useMemo(() => {
    const visible = data.items.filter((item) => !hiddenIds.includes(item.event.id));
    const seed = data.items.length + new Date().getDate();
    const ranked = rankItems(
      visible.map((item) => {
        const feedback = feedbackByEventId[item.event.id];
        const optimisticScore = feedback === "up" ? item.score + 8 : item.score;
        return {
          ...item,
          score: optimisticScore,
          id: item.event.id,
          slug: item.event.slug,
          title: item.event.title,
          venueSlug: item.event.venue?.slug,
          hasLocation: Boolean(item.event.venue?.city),
          sourceCategory: item.event.venue?.city ? "nearby" as const : "trending" as const,
          tags: item.reasons,
          entityType: "event" as const,
        };
      }),
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
  }, [data.items, feedbackByEventId, hiddenIds, signals]);

  const groupedItems = useMemo(() => {
    const buckets: Record<"network" | "trending" | "nearby", typeof rankedItems> = { network: [], trending: [], nearby: [] };
    for (const ranked of rankedItems) buckets[ranked.item.reasonCategory ?? "trending"].push(ranked);
    return buckets;
  }, [rankedItems]);

  const handleFeedback = useCallback((eventId: string, feedback: "up" | "down") => {
    setFeedbackByEventId((current) => ({ ...current, [eventId]: feedback }));
    if (feedback === "down") {
      setHiddenIds((current) => (current.includes(eventId) ? current : [...current, eventId]));
    }
    trackEngagement({
      surface: "FOLLOWING",
      action: "CLICK",
      targetType: "EVENT",
      targetId: eventId,
      meta: { feedback },
    });
  }, []);

  const handleHide = useCallback((eventId: string) => {
    setHiddenIds((current) => (current.includes(eventId) ? current : [...current, eventId]));
    void fetch(`/api/events/by-id/${eventId}/hide`, { method: "POST" });
  }, []);

  const useDeviceLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationPromptError("Could not detect location. Set it manually.");
      return;
    }

    setIsDetectingLocation(true);
    setLocationPromptError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const payload = { lat: position.coords.latitude, lng: position.coords.longitude };

        try {
          let response = await fetch("/api/me/location", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!response.ok && response.status === 405) {
            response = await fetch("/api/me/location", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          if (!response.ok) {
            throw new Error("location_update_failed");
          }

          setSignals((current) => ({ ...current, hasLocation: true }));
          setLocationPromptError(null);
        } catch {
          setLocationPromptError("Could not detect location. Set it manually.");
        } finally {
          setIsDetectingLocation(false);
        }
      },
      () => {
        setIsDetectingLocation(false);
        setLocationPromptError("Could not detect location. Set it manually.");
      },
    );
  }, []);

  const shouldShowLocationPrompt = areSignalsLoaded && !signals.hasLocation && !locationPromptDismissed;

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
          {shouldShowLocationPrompt ? (
            <aside className="rounded-xl border border-dashed p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2">
                  <p className="font-medium text-sm">Set your location for nearby picks</p>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll show you events happening near you.
                  </p>
                </div>
                <button type="button" onClick={() => setLocationPromptDismissed(true)} aria-label="Dismiss location prompt" className="text-sm text-muted-foreground hover:text-foreground">
                  Dismiss
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={useDeviceLocation} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50" disabled={isDetectingLocation}>
                  {isDetectingLocation ? "Detecting..." : "Use my location"}
                </button>
                <a href="/account#location" className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">Set manually</a>
              </div>
              {locationPromptError ? <p className="text-sm text-red-600">{locationPromptError}</p> : null}
            </aside>
          ) : null}
          {(["network", "trending", "nearby"] as const).map((section) => {
            const sectionItems = groupedItems[section];
            if (!sectionItems.length) return null;
            const heading = section === "network" ? "From your network" : section === "nearby" ? "Near you" : "Trending now";
            return (
              <section key={section} className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
                {sectionItems.map((ranked) => {
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
                <p className="text-xs font-medium text-muted-foreground">{item.reason}</p>
                <EventCard
                  href={`/events/${item.event.slug}`}
                  title={item.event.title}
                  startAt={item.event.startAt}
                  venueName={item.event.venue?.name}
                  venueSlug={item.event.venue?.slug}
                  badges={item.reasons.slice(0, 2)}
                  secondaryText={debugEnabled ? `Score: ${ranked.score} • ${ranked.breakdown.map((entry) => `${entry.key}:${entry.value}`).join(", ")}` : `Score: ${ranked.score}`}
                  savedByCount={item.event.savedByCount}
                  inCollectionsCount={item.event.inCollectionsCount}
                  onOpen={() => {
                    recordFeedback({ type: "click", source: "for_you", item: { type: "event", idOrSlug: item.event.id, tags: item.reasons, venueSlug: item.event.venue?.slug } });
                    recordOutcome({ action: "click", itemType: "event", itemKey: `event:${item.event.slug ?? item.event.id}`.toLowerCase(), sourceHint: "for_you" });
                  }}
                  action={(
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-600" aria-label="Recommendation feedback">
                        <button
                          type="button"
                          className={`rounded border px-2 py-1 hover:bg-gray-50 ${feedbackByEventId[item.event.id] === "up" ? "bg-gray-100" : ""}`}
                          onClick={() => handleFeedback(item.event.id, "up")}
                          aria-pressed={feedbackByEventId[item.event.id] === "up"}
                        >
                          👍 More like this
                        </button>
                        <button
                          type="button"
                          className={`rounded border px-2 py-1 hover:bg-gray-50 ${feedbackByEventId[item.event.id] === "down" ? "bg-gray-100" : ""}`}
                          onClick={() => handleFeedback(item.event.id, "down")}
                          aria-pressed={feedbackByEventId[item.event.id] === "down"}
                        >
                          👎 Less like this
                        </button>
                      </div>
                      <ItemActionsMenu type="event" idOrSlug={item.event.id} source="for_you" measurementSource="for_you" explanation={explanation} onHidden={() => handleHide(item.event.id)} />
                    </div>
                  )}
                />
                {explanation ? <WhyThis source="for_you" explanation={explanation} /> : null}
              </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
