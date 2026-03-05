"use client";

import Image from "next/image";
import { useState } from "react";
import { InlineBanner } from "@/components/ui/inline-banner";

type IngestVenueSnapshotProps = {
  runId: string;
  venueId: string;
  snapshot: {
    venueDescription?: string | null;
    venueCoverImageUrl?: string | null;
    venueOpeningHours?: string | null;
    venueContactEmail?: string | null;
    venueInstagramUrl?: string | null;
    venueFacebookUrl?: string | null;
  };
  venue: {
    description: string | null;
    openingHours: string | null;
    contactEmail: string | null;
    instagramUrl: string | null;
    facebookUrl: string | null;
    featuredAssetId: string | null;
  };
};

function truncateValue(value: string) {
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export default function IngestVenueSnapshot({ runId, venueId, snapshot, venue }: IngestVenueSnapshotProps) {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const textFields: Array<{
    key: string;
    label: string;
    snapshotValue: string | null | undefined;
    venueValue: string | null;
  }> = [
    { key: "description", label: "Description", snapshotValue: snapshot.venueDescription, venueValue: venue.description },
    { key: "openingHours", label: "Opening hours", snapshotValue: snapshot.venueOpeningHours, venueValue: venue.openingHours },
    { key: "contactEmail", label: "Contact email", snapshotValue: snapshot.venueContactEmail, venueValue: venue.contactEmail },
    { key: "instagramUrl", label: "Instagram URL", snapshotValue: snapshot.venueInstagramUrl, venueValue: venue.instagramUrl },
    { key: "facebookUrl", label: "Facebook URL", snapshotValue: snapshot.venueFacebookUrl, venueValue: venue.facebookUrl },
  ];

  const hasAnySnapshotData = textFields.some((field) => hasValue(field.snapshotValue)) || hasValue(snapshot.venueCoverImageUrl);

  async function applyField(field: string, value: string) {
    setApplying(field);
    setError(null);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(body.error?.message ?? "Apply failed.");
        return;
      }
      setApplied((prev) => new Set([...prev, field]));
    } finally {
      setApplying(null);
    }
  }

  async function importCoverImage(imageUrl: string) {
    setApplying("venueCoverImageUrl");
    setError(null);
    try {
      const res = await fetch(`/api/admin/ingest/runs/${runId}/import-venue-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, setAsFeatured: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(body.error?.message ?? "Image import failed.");
        return;
      }
      setApplied((prev) => new Set([...prev, "venueCoverImageUrl"]));
    } finally {
      setApplying(null);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Venue snapshot</h2>
        <p className="text-sm text-muted-foreground">Data extracted from this run&apos;s source page. Apply individual fields to update the venue record.</p>
      </div>

      {!hasAnySnapshotData ? (
        <p className="text-sm text-muted-foreground">No venue data was extracted from this run.</p>
      ) : (
        <div className="space-y-3">
          <dl className="space-y-2">
            {textFields.map((field) => {
              if (!hasValue(field.snapshotValue)) return null;

              return (
                <div key={field.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-[180px_1fr_auto] md:items-start">
                  <dt className="text-sm font-medium">{field.label}</dt>
                  <dd>
                    <div className="text-sm" title={field.snapshotValue ?? undefined}>{truncateValue(field.snapshotValue ?? "")}</div>
                    <div className="text-xs text-muted-foreground">{field.venueValue ? "(already set)" : "(not set)"}</div>
                  </dd>
                  <div className="md:justify-self-end">
                    {applied.has(field.key) ? (
                      <button type="button" disabled className="text-sm text-emerald-700">✓ Applied</button>
                    ) : applying === field.key ? (
                      <button type="button" disabled className="text-sm text-muted-foreground">Applying…</button>
                    ) : (
                      <button type="button" onClick={() => applyField(field.key, field.snapshotValue!)} className="text-sm underline">↑ Apply</button>
                    )}
                  </div>
                </div>
              );
            })}
          </dl>

          {hasValue(snapshot.venueCoverImageUrl) ? (
            <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[180px_1fr_auto] md:items-start">
              <div className="text-sm font-medium">Cover image</div>
              <div className="space-y-2">
                <Image
                  src={snapshot.venueCoverImageUrl!}
                  alt="Extracted venue cover image"
                  width={144}
                  height={96}
                  unoptimized
                  className="h-24 w-36 rounded-lg object-cover"
                />
                <div className="text-xs text-muted-foreground">{venue.featuredAssetId ? "(cover already set)" : "(no cover set)"}</div>
              </div>
              <div className="md:justify-self-end">
                {applied.has("venueCoverImageUrl") ? (
                  <button type="button" disabled className="text-sm text-emerald-700">✓ Imported</button>
                ) : applying === "venueCoverImageUrl" ? (
                  <button type="button" disabled className="text-sm text-muted-foreground">Importing…</button>
                ) : (
                  <button type="button" onClick={() => importCoverImage(snapshot.venueCoverImageUrl!)} className="text-sm underline">↑ Import as cover</button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <InlineBanner>
          <div className="flex items-start justify-between gap-2">
            <span>{error}</span>
            <button type="button" className="text-xs underline" onClick={() => setError(null)}>Dismiss</button>
          </div>
        </InlineBanner>
      ) : null}
    </section>
  );
}
