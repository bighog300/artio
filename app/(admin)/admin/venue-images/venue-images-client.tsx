"use client";

import Link from "next/link";
import { useState } from "react";

type VenueCandidate = {
  id: string;
  url: string;
  source: string;
  sortOrder: number;
};

export type VenueGroup = {
  venueId: string;
  venueName: string;
  venueCity: string | null;
  venueCountry: string | null;
  featuredAssetId: string | null;
  venueStatus: string;
  candidates: VenueCandidate[];
};

type VenueImagesClientProps = {
  groups: VenueGroup[];
};

export function VenueImagesClient(props: VenueImagesClientProps) {
  const [groups, setGroups] = useState(props.groups);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function selectCandidate(venueId: string, candidateId: string, setAsCover: boolean) {
    setLoadingId(candidateId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });

    try {
      const res = await fetch(`/api/admin/venues/${venueId}/homepage-image-candidates/${candidateId}/select`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setErrors((prev) => ({ ...prev, [candidateId]: body.error?.message ?? "Failed to select candidate." }));
        return;
      }

      setGroups((prev) => prev.flatMap((group) => {
        if (group.venueId !== venueId) return [group];
        const nextCandidates = group.candidates.filter((candidate) => candidate.id !== candidateId);
        if (nextCandidates.length === 0) return [];
        return [{
          ...group,
          featuredAssetId: setAsCover ? "set" : group.featuredAssetId,
          candidates: nextCandidates,
        }];
      }));
    } finally {
      setLoadingId(null);
    }
  }

  async function rejectCandidate(venueId: string, candidateId: string) {
    setLoadingId(candidateId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });

    try {
      const res = await fetch(`/api/admin/venues/${venueId}/homepage-image-candidates/${candidateId}/reject`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setErrors((prev) => ({ ...prev, [candidateId]: body.error?.message ?? "Failed to dismiss candidate." }));
        return;
      }

      setGroups((prev) => prev.flatMap((group) => {
        if (group.venueId !== venueId) return [group];
        const nextCandidates = group.candidates.filter((candidate) => candidate.id !== candidateId);
        if (nextCandidates.length === 0) return [];
        return [{ ...group, candidates: nextCandidates }];
      }));
    } finally {
      setLoadingId(null);
    }
  }

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending homepage image candidates.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const location = [group.venueCity, group.venueCountry].filter(Boolean).join(", ");
        return (
          <section key={group.venueId} className="space-y-3 rounded-lg border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{group.venueName}</h2>
                <p className="text-xs text-muted-foreground">{location || "Location unavailable"}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${group.featuredAssetId ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {group.featuredAssetId ? "Cover set" : "No cover"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <Link className="underline text-muted-foreground" href={`/admin/venues/${group.venueId}`}>
                Open venue admin page
              </Link>
              <span className="text-muted-foreground">{group.candidates.length} candidates</span>
            </div>

            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-3 pb-1">
                {group.candidates.map((candidate) => {
                  const isLoading = loadingId === candidate.id;
                  return (
                    <div key={candidate.id} className="w-36 space-y-1">
                      <div className="group relative h-24 w-36 overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={candidate.url}
                          alt="Homepage candidate"
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            (event.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <div className="absolute inset-0 hidden items-center justify-center gap-1 rounded-lg bg-black/60 group-hover:flex flex-col">
                          <button type="button" className="w-28 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-50" onClick={() => selectCandidate(group.venueId, candidate.id, true)} disabled={isLoading}>{isLoading ? "…" : "★ Set as cover"}</button>
                          <button type="button" className="w-28 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-50" onClick={() => selectCandidate(group.venueId, candidate.id, false)} disabled={isLoading}>{isLoading ? "…" : "+ Add to gallery"}</button>
                          <button type="button" className="w-28 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-red-300 disabled:opacity-50" onClick={() => rejectCandidate(group.venueId, candidate.id)} disabled={isLoading}>{isLoading ? "…" : "✕ Dismiss"}</button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{candidate.source}</p>
                      {errors[candidate.id] ? (
                        <div className="flex items-start justify-between gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          <span>{errors[candidate.id]}</span>
                          <button
                            type="button"
                            onClick={() => setErrors((prev) => {
                              const next = { ...prev };
                              delete next[candidate.id];
                              return next;
                            })}
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
