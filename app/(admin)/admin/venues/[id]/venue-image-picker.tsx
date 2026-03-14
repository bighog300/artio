"use client";

import { useState } from "react";
import Image from "next/image";

type VenueImagePickerProps = {
  venueId: string;
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    isPrimary: boolean;
    sortOrder: number;
    width: number | null;
    height: number | null;
  }>;
  suggestions: Array<{
    candidateId: string;
    runId: string;
    displayUrl: string;
    originalUrl: string;
    title: string;
    source?: "ingest" | "generation";
  }>;
  initialHomepageCandidates: Array<{
    id: string;
    url: string;
    source: string;
    sortOrder: number;
    status: string;
  }>;
};

type Suggestion = VenueImagePickerProps["suggestions"][number];

export default function VenueImagePicker(props: VenueImagePickerProps) {
  const { venueId, suggestions } = props;
  const [images, setImages] = useState(props.images);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [homepageCandidates, setHomepageCandidates] = useState(props.initialHomepageCandidates);
  const [candidateLoadingId, setCandidateLoadingId] = useState<string | null>(null);

  async function setPrimary(imageId: string) {
    setLoadingId(imageId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setError(body.error?.message ?? "Failed to set cover image.");
        return;
      }
      setImages((prev) => prev.map((img) => ({ ...img, isPrimary: img.id === imageId })));
    } finally {
      setLoadingId(null);
    }
  }


  async function selectCandidate(candidateId: string, setAsPrimary: boolean) {
    setCandidateLoadingId(candidateId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}/homepage-image-candidates/${candidateId}/select`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setError(body.error?.message ?? "Upload failed.");
        return;
      }
      const body = await res.json() as { venueImageId: string; url: string };
      setImages((prev) => [
        ...(setAsPrimary ? prev.map((img) => ({ ...img, isPrimary: false })) : prev),
        { id: body.venueImageId, url: body.url, alt: null, isPrimary: setAsPrimary, sortOrder: 0, width: null, height: null },
      ]);
      if (setAsPrimary) {
        await fetch(`/api/admin/venues/${venueId}/images/${body.venueImageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPrimary: true }),
        });
      }
      setHomepageCandidates((prev) => prev.filter((candidate) => candidate.id !== candidateId));
    } finally {
      setCandidateLoadingId(null);
    }
  }

  async function rejectCandidate(candidateId: string) {
    setCandidateLoadingId(candidateId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}/homepage-image-candidates/${candidateId}/reject`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setError(body.error?.message ?? "Dismiss failed.");
        return;
      }
      setHomepageCandidates((prev) => prev.filter((candidate) => candidate.id !== candidateId));
    } finally {
      setCandidateLoadingId(null);
    }
  }

  async function importSuggestion(suggestion: Suggestion, setAsFeatured: boolean) {
    setImportingUrl(suggestion.originalUrl);
    setError(null);
    try {
      const url = suggestion.source === "generation"
        ? `/api/admin/venues/${venueId}/import-generation-image`
        : `/api/admin/ingest/runs/${suggestion.runId}/import-venue-image`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: suggestion.originalUrl, setAsFeatured }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setError(body.error?.message ?? "Import failed.");
        return;
      }
      const body = await res.json() as { imageId: string; url: string; isPrimary: boolean };
      setImages((prev) => [
        ...(body.isPrimary ? prev.map((img) => ({ ...img, isPrimary: false })) : prev),
        { id: body.imageId, url: body.url, alt: null, isPrimary: body.isPrimary, sortOrder: prev.length, width: null, height: null },
      ]);
    } finally {
      setImportingUrl(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4">
      <h2 className="text-base font-semibold">Images</h2>
      <div className="space-y-6">
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Cover image</h3>
            <p className="text-xs text-muted-foreground">The primary image used in listings and the venue profile.</p>
          </div>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {images.map((image) => (
                <div key={image.id} className={`relative h-24 w-36 overflow-hidden rounded-lg border-2 ${image.isPrimary ? "border-primary" : "border-transparent"}`}>
                  <Image
                    src={image.url}
                    alt={image.alt ?? "Venue image"}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 p-1 text-center">
                    {image.isPrimary ? (
                      <span className="inline-block rounded bg-green-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">✓ Cover</span>
                    ) : (
                      <button
                        type="button"
                        className="text-[10px] font-medium text-white underline disabled:opacity-50"
                        onClick={() => setPrimary(image.id)}
                        disabled={loadingId === image.id}
                      >
                        {loadingId === image.id ? "…" : "Set as cover"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {suggestions.length > 0 ? (
          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-medium">Suggested images</h3>
              <p className="text-xs text-muted-foreground">Images from AI venue generation and ingest runs. Import to add to gallery.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {suggestions.map((suggestion) => {
                const isImporting = importingUrl === suggestion.originalUrl;
                return (
                  <div key={suggestion.candidateId} className="group relative h-24 w-36 overflow-hidden rounded-lg border-2 border-transparent">
                    <Image
                      src={suggestion.displayUrl}
                      alt={suggestion.title || "Suggested venue image"}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <div className="absolute inset-0 hidden items-center justify-center gap-1 rounded-lg bg-black/60 group-hover:flex">
                      <button
                        type="button"
                        className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-50"
                        onClick={() => importSuggestion(suggestion, false)}
                        disabled={isImporting}
                      >
                        {isImporting ? "…" : "+ gallery"}
                      </button>
                      <button
                        type="button"
                        className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-50"
                        onClick={() => importSuggestion(suggestion, true)}
                        disabled={isImporting}
                      >
                        {isImporting ? "…" : "★ cover"}
                      </button>
                    </div>
                    {isImporting ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-xs text-white">…</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}


        {homepageCandidates.length > 0 && (
          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-medium">From venue homepage</h3>
              <p className="text-xs text-muted-foreground">
                Candidate images extracted from the venue website at generation time.
                Uploading fetches the full-resolution image and adds it to the gallery.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {homepageCandidates.map((candidate) => {
                const isLoading = candidateLoadingId === candidate.id;
                return (
                  <div key={candidate.id} className="group relative h-24 w-36 overflow-hidden rounded-lg border-2 border-transparent">
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
                      <button
                        type="button"
                        className="w-28 rounded bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white disabled:opacity-50"
                        onClick={() => selectCandidate(candidate.id, true)}
                        disabled={isLoading}
                      >
                        {isLoading ? "…" : "★ Upload & set cover"}
                      </button>
                      <button
                        type="button"
                        className="w-28 rounded bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white disabled:opacity-50"
                        onClick={() => selectCandidate(candidate.id, false)}
                        disabled={isLoading}
                      >
                        {isLoading ? "…" : "+ Upload to gallery"}
                      </button>
                      <button
                        type="button"
                        className="w-28 rounded bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-red-300 disabled:opacity-50"
                        onClick={() => rejectCandidate(candidate.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? "…" : "✕ Dismiss"}
                      </button>
                    </div>
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-xs text-white">…</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {error ? (
          <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
            <span>{error}</span>
            <button type="button" className="text-amber-700" onClick={() => setError(null)}>×</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
