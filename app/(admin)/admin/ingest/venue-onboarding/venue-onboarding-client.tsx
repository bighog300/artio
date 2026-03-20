"use client";

import Link from "next/link";
import { useState } from "react";
import { computeVenuePublishBlockers } from "@/lib/publish-readiness";

type OnboardingVenue = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  websiteUrl: string | null;
  eventsPageUrl: string | null;
  featuredAssetId: string | null;
  description: string | null;
  openingHours: unknown;
  contactEmail: string | null;
  instagramUrl: string | null;
  createdAt: string | Date;
  homepageImageCandidates: Array<{
    id: string;
    url: string;
    source: string;
    sortOrder: number;
  }>;
  generationRunItems: Array<{ eventsPageStatus: string }>;
};

export function VenueOnboardingClient({ venues: initialVenues }: { venues: OnboardingVenue[] }) {
  const [venues, setVenues] = useState(initialVenues);
  const [onboardingVenueId, setOnboardingVenueId] = useState<string | null>(null);
  const [eventsUrlInputs, setEventsUrlInputs] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCandidateId, setLoadingCandidateId] = useState<string | null>(null);
  const [candidateErrors, setCandidateErrors] = useState<Record<string, string>>({});

  async function selectCover(venueId: string, candidateId: string) {
    setLoadingCandidateId(candidateId);
    setCandidateErrors((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });

    try {
      const res = await fetch(`/api/admin/venues/${venueId}/homepage-image-candidates/${candidateId}/select`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setCandidateErrors((prev) => ({ ...prev, [candidateId]: body.error?.message ?? "Failed to set cover image." }));
        return;
      }

      setVenues((prev) => prev.map((venue) => {
        if (venue.id !== venueId) return venue;
        return {
          ...venue,
          featuredAssetId: "set",
          homepageImageCandidates: venue.homepageImageCandidates.filter((candidate) => candidate.id !== candidateId),
        };
      }));
    } finally {
      setLoadingCandidateId(null);
    }
  }

  async function publishVenue(venueId: string) {
    setPublishing(venueId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[venueId];
      return next;
    });

    try {
      const value = eventsUrlInputs[venueId]?.trim() ?? "";
      const res = await fetch(`/api/admin/venues/${venueId}/onboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventsPageUrl: value || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setErrors((prev) => ({ ...prev, [venueId]: body.error?.message ?? "Onboarding publish failed." }));
        return;
      }

      setVenues((prev) => prev.filter((venue) => venue.id !== venueId));
      setOnboardingVenueId((prev) => (prev === venueId ? null : prev));
    } finally {
      setPublishing(null);
    }
  }

  if (venues.length === 0) {
    return <p className="text-sm text-muted-foreground">No venues in onboarding. All clear.</p>;
  }

  return (
    <div className="space-y-4">
      {venues.map((venue) => {
        const eventsPageStatus = venue.generationRunItems[0]?.eventsPageStatus;
        const blockers = computeVenuePublishBlockers(venue);
        let eventsPageStatusIndicator: React.ReactNode = <span>Not attempted</span>;

        if (eventsPageStatus === "detected") {
          eventsPageStatusIndicator = <span className="text-emerald-700">✓ Auto-detected</span>;
        } else if (eventsPageStatus === "not_found") {
          eventsPageStatusIndicator = <span className="text-amber-700">Not found during generation</span>;
        } else if (eventsPageStatus === "fetch_failed") {
          eventsPageStatusIndicator = <span className="text-amber-700">Detection failed</span>;
        } else if (eventsPageStatus === "not_attempted" || !eventsPageStatus) {
          eventsPageStatusIndicator = <span className="text-muted-foreground">Not attempted</span>;
        }

        return (
          <section key={venue.id} className="rounded-lg border bg-background p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/admin/venues/${venue.id}`} className="font-semibold underline">
                  {venue.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {[venue.city, venue.country].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {venue.lat != null && venue.lng != null
                  ? <span className="text-emerald-700">✓ Geocoded</span>
                  : <span className="text-rose-700">✕ No coordinates</span>}
                {venue.featuredAssetId
                  ? <span className="text-emerald-700">✓ Cover set</span>
                  : <span className="text-amber-700">No cover</span>}
              </div>
            </div>

            {venue.homepageImageCandidates.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-2 pb-1">
                  {venue.homepageImageCandidates.map((candidate) => (
                    <div key={candidate.id} className="w-28 space-y-1">
                      <div className="group relative h-20 w-28 overflow-hidden rounded border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={candidate.url}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/60 rounded">
                          <button
                            type="button"
                            className="rounded bg-black/70 px-2 py-1 text-[10px] text-white disabled:opacity-50"
                            disabled={loadingCandidateId === candidate.id}
                            onClick={() => selectCover(venue.id, candidate.id)}
                          >
                            {loadingCandidateId === candidate.id ? "…" : "★ Set cover"}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{candidate.source}</p>
                      {candidateErrors[candidate.id]
                        ? <p className="text-[10px] text-destructive">{candidateErrors[candidate.id]}</p>
                        : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : venue.websiteUrl ? (
              <p className="text-xs text-muted-foreground">No image candidates found from homepage.</p>
            ) : (
              <p className="text-xs text-muted-foreground">No website URL — images must be added manually.</p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor={`events-url-${venue.id}`}>Events page URL</label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                {eventsPageStatusIndicator}
              </div>
              <input
                id={`events-url-${venue.id}`}
                type="url"
                className="w-full rounded border bg-background px-2 py-1 text-sm"
                placeholder={venue.eventsPageUrl ?? "https://example.com/events"}
                value={eventsUrlInputs[venue.id] ?? venue.eventsPageUrl ?? ""}
                onChange={(e) => {
                  setEventsUrlInputs((prev) => ({ ...prev, [venue.id]: e.target.value }));
                  setOnboardingVenueId(venue.id);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the detected URL, or enter a custom one. Optional — venue can be
                published without it.
              </p>
            </div>

            <div className="space-y-2">
              {blockers.length > 0 ? (
                <p className="text-xs text-rose-700">
                  Cannot publish: {blockers.map((b) => b.message).join(" · ")}
                </p>
              ) : null}
              <button
                type="button"
                className="rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
                disabled={blockers.length > 0 || publishing === venue.id}
                onClick={() => publishVenue(venue.id)}
              >
                {publishing === venue.id ? "Publishing…" : "Publish venue"}
              </button>
              {errors[venue.id] ? <p className="text-xs text-destructive">{errors[venue.id]}</p> : null}
              {onboardingVenueId === venue.id ? (
                <p className="text-[11px] text-muted-foreground">Ready to publish with current events URL input.</p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
