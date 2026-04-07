"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type EntityType = "EVENT" | "ARTIST" | "ARTWORK" | "VENUE";
type Origin = "ingest" | "venue_generation" | "claim" | "manual";

type UnifiedRecord = {
  id: string;
  entityType: EntityType;
  title: string;
  subtitle: string | null;
  origin: Origin;
  adminHref: string;
  image: { url: string | null; isProcessing: boolean; hasFailure: boolean } | null;
  readinessScore: number;
  blockers: string[];
  warnings: string[];
  chips: string[];
  publishApiPath: string;
  remediationHref: string | null;
  remediationLabel: string | null;
};

const entityTypeLabel: Record<EntityType, string> = {
  EVENT: "Event",
  ARTIST: "Artist",
  ARTWORK: "Artwork",
  VENUE: "Venue",
};

const originLabel: Record<Origin, string> = {
  ingest: "via ingest",
  venue_generation: "via venue generation",
  claim: "via claim",
  manual: "manually added",
};

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function entityPillClass(entityType: EntityType) {
  if (entityType === "EVENT") return "bg-blue-100 text-blue-800";
  if (entityType === "ARTIST") return "bg-violet-100 text-violet-800";
  if (entityType === "ARTWORK") return "bg-fuchsia-100 text-fuchsia-800";
  return "bg-teal-100 text-teal-800";
}

function ChipButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
    >
      {label}
    </button>
  );
}

export default function ReadyToPublishClient({
  records,
  userRole,
}: {
  records: UnifiedRecord[];
  userRole?: "USER" | "EDITOR" | "ADMIN";
}) {
  const [rows, setRows] = useState(records);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [publishedName, setPublishedName] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [blockingByArtworkId, setBlockingByArtworkId] = useState<Record<string, string[]>>({});
  const [typeFilter, setTypeFilter] = useState<EntityType | "ALL">("ALL");
  const [originFilter, setOriginFilter] = useState<Origin | "ALL">("ALL");
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ approved: number; failed: number } | null>(null);

  const typeCounts = useMemo(
    () => ({
      EVENT: rows.filter((r) => r.entityType === "EVENT").length,
      ARTIST: rows.filter((r) => r.entityType === "ARTIST").length,
      ARTWORK: rows.filter((r) => r.entityType === "ARTWORK").length,
      VENUE: rows.filter((r) => r.entityType === "VENUE").length,
    }),
    [rows],
  );

  const originCounts = useMemo(
    () => ({
      ingest: rows.filter((r) => r.origin === "ingest").length,
      venue_generation: rows.filter((r) => r.origin === "venue_generation").length,
      claim: rows.filter((r) => r.origin === "claim").length,
      manual: rows.filter((r) => r.origin === "manual").length,
    }),
    [rows],
  );

  const filtered = useMemo(
    () => rows.filter((r) => (typeFilter === "ALL" || r.entityType === typeFilter) && (originFilter === "ALL" || r.origin === originFilter)),
    [rows, typeFilter, originFilter],
  );

  const readyCount = filtered.filter((r) => r.readinessScore >= 80).length;

  async function publishArtist(id: string) {
    setWorkingId(id);
    setPublishedName(null);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/ingest/ready-to-publish/artists/${id}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setErrorById((prev) => ({ ...prev, [id]: body.error?.message ?? "Failed to publish artist." }));
        throw new Error("publish_failed");
      }
      const publishedRecord = rows.find((item) => item.id === id);
      setRows((prev) => prev.filter((item) => item.id !== id));
      setPublishedName(publishedRecord?.title ?? "Artist");
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: prev[id] || "Failed to publish artist." }));
      throw new Error("publish_failed");
    } finally {
      setWorkingId(null);
    }
  }

  async function publishArtwork(id: string) {
    setWorkingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    setBlockingByArtworkId((prev) => ({ ...prev, [id]: [] }));
    try {
      const res = await fetch(`/api/admin/ingest/ready-to-publish/artworks/${id}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string; details?: { blocking?: Array<{ label?: string }> } } };
      if (!res.ok) {
        if (res.status === 400 && body.error?.code === "not_ready") {
          const blocking = body.error?.details?.blocking?.map((issue) => issue.label).filter((label): label is string => Boolean(label)) ?? [];
          setBlockingByArtworkId((prev) => ({ ...prev, [id]: blocking }));
          throw new Error("publish_failed");
        }
        setErrorById((prev) => ({ ...prev, [id]: body.error?.message ?? "Failed to publish artwork." }));
        throw new Error("publish_failed");
      }
      setRows((prev) => prev.filter((item) => item.id !== id));
      setPublishedName(rows.find((item) => item.id === id)?.title ?? "Artwork");
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: prev[id] || "Failed to publish artwork." }));
      throw new Error("publish_failed");
    } finally {
      setWorkingId(null);
    }
  }

  async function publishVenue(id: string) {
    setWorkingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/venues/${id}/publish`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setErrorById((prev) => ({ ...prev, [id]: body.error?.message ?? "Failed to publish venue." }));
        throw new Error("publish_failed");
      }
      const publishedRecord = rows.find((item) => item.id === id);
      setRows((prev) => prev.filter((item) => item.id !== id));
      setPublishedName(publishedRecord?.title ?? "Venue");
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: prev[id] || "Failed to publish venue." }));
      throw new Error("publish_failed");
    } finally {
      setWorkingId(null);
    }
  }

  async function publishEvent(id: string) {
    setWorkingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/events/${id}/publish`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setErrorById((prev) => ({ ...prev, [id]: body.error?.message ?? "Failed to publish event." }));
        throw new Error("publish_failed");
      }
      const publishedRecord = rows.find((item) => item.id === id);
      setRows((prev) => prev.filter((item) => item.id !== id));
      setPublishedName(publishedRecord?.title ?? "Event");
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: prev[id] || "Failed to publish event." }));
      throw new Error("publish_failed");
    } finally {
      setWorkingId(null);
    }
  }

  async function publishRecord(record: UnifiedRecord) {
    switch (record.entityType) {
      case "ARTIST":
        return publishArtist(record.id);
      case "ARTWORK":
        return publishArtwork(record.id);
      case "VENUE":
        return publishVenue(record.id);
      case "EVENT":
        return publishEvent(record.id);
      default:
        return undefined;
    }
  }

  async function bulkPublishReady() {
    if (userRole !== "ADMIN") return;
    if (bulkPublishing) return;
    const eligible = filtered.filter((r) => r.readinessScore >= 80);
    if (!eligible.length) return;
    if (!window.confirm(`Publish ${eligible.length} record${eligible.length === 1 ? "" : "s"}? This cannot be undone.`)) return;

    setBulkPublishing(true);
    setBulkProgress({ done: 0, total: eligible.length });
    setBulkResults(null);

    const BATCH_SIZE = 3;
    let approved = 0;
    let failed = 0;

    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const batch = eligible.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((record) => publishRecord(record)));
      for (const result of results) {
        if (result.status === "fulfilled") approved += 1;
        else failed += 1;
      }
      setBulkProgress({ done: approved + failed, total: eligible.length });
    }

    setBulkPublishing(false);
    setBulkProgress(null);
    setBulkResults({ approved, failed });
  }

  if (rows.length === 0) {
    return <div className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">Nothing waiting to publish.</div>;
  }

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-sm font-semibold">Unified publish queue</h2>
          {publishedName ? <p className="text-xs text-emerald-700">Published {publishedName}</p> : null}
        </div>
        {userRole === "ADMIN" ? (
          <Button size="sm" variant="outline" disabled={bulkPublishing || readyCount === 0} onClick={() => void bulkPublishReady()}>
            {bulkPublishing ? `Publishing… ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}` : `Publish all ready (${readyCount})`}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Admin only</span>
        )}
      </div>

      {bulkResults ? (
        <div className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${bulkResults.failed === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <span>
            Bulk publish complete: {bulkResults.approved} succeeded{bulkResults.failed ? `, ${bulkResults.failed} failed` : ""}.
          </span>
          <button type="button" className="underline" onClick={() => setBulkResults(null)}>Dismiss</button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 flex-shrink-0 text-xs text-muted-foreground">
            Type
          </span>
          <ChipButton active={typeFilter === "ALL"} label={`All (${rows.length})`} onClick={() => setTypeFilter("ALL")} />
          {typeCounts.EVENT > 0 ? <ChipButton active={typeFilter === "EVENT"} label={`Events (${typeCounts.EVENT})`} onClick={() => setTypeFilter("EVENT")} /> : null}
          {typeCounts.ARTIST > 0 ? <ChipButton active={typeFilter === "ARTIST"} label={`Artists (${typeCounts.ARTIST})`} onClick={() => setTypeFilter("ARTIST")} /> : null}
          {typeCounts.ARTWORK > 0 ? <ChipButton active={typeFilter === "ARTWORK"} label={`Artworks (${typeCounts.ARTWORK})`} onClick={() => setTypeFilter("ARTWORK")} /> : null}
          {typeCounts.VENUE > 0 ? <ChipButton active={typeFilter === "VENUE"} label={`Venues (${typeCounts.VENUE})`} onClick={() => setTypeFilter("VENUE")} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 flex-shrink-0 text-xs text-muted-foreground">
            Origin
          </span>
          <ChipButton active={originFilter === "ALL"} label={`All (${rows.length})`} onClick={() => setOriginFilter("ALL")} />
          {originCounts.ingest > 0 ? <ChipButton active={originFilter === "ingest"} label={`Via ingest (${originCounts.ingest})`} onClick={() => setOriginFilter("ingest")} /> : null}
          {originCounts.venue_generation > 0 ? <ChipButton active={originFilter === "venue_generation"} label={`Via venue generation (${originCounts.venue_generation})`} onClick={() => setOriginFilter("venue_generation")} /> : null}
          {originCounts.claim > 0 ? <ChipButton active={originFilter === "claim"} label={`Via claim (${originCounts.claim})`} onClick={() => setOriginFilter("claim")} /> : null}
          {originCounts.manual > 0 ? <ChipButton active={originFilter === "manual"} label={`Manually added (${originCounts.manual})`} onClick={() => setOriginFilter("manual")} /> : null}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((record) => (
          <div key={record.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {record.image?.url ? (
                  <img src={record.image.url} alt={record.title} className="h-9 w-9 rounded object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${entityPillClass(record.entityType)}`}>{entityTypeLabel[record.entityType]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{originLabel[record.origin]}</span>
                  </div>
                  <p className="truncate text-sm font-medium"><Link className="underline" href={record.adminHref}>{record.title}</Link></p>
                  {record.subtitle ? <p className="truncate text-xs text-muted-foreground">{record.subtitle}</p> : null}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded bg-muted">
                      <div className={`h-full ${scoreTone(record.readinessScore)}`} style={{ width: `${record.readinessScore}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{record.readinessScore}% ready</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {record.blockers.length > 0 && record.remediationHref && record.remediationLabel ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={record.remediationHref}>{record.remediationLabel}</Link>
                  </Button>
                ) : null}
                {userRole === "ADMIN" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={workingId === record.id || record.blockers.length > 0}
                    onClick={() => void publishRecord(record)}
                  >
                    {workingId === record.id ? "Publishing…" : record.warnings.length > 0 ? "Publish anyway" : "Publish"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Admin only</span>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {record.blockers.map((item) => <span key={`${record.id}-block-${item}`} className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-800">{item}</span>)}
              {record.warnings.map((item) => <span key={`${record.id}-warn-${item}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">{item}</span>)}
              {record.chips.map((item) => <span key={`${record.id}-chip-${item}`} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">{item}</span>)}
            </div>

            {blockingByArtworkId[record.id]?.length ? (
              <ul className="mt-2 ml-5 list-disc text-xs text-amber-700">
                {blockingByArtworkId[record.id].map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
            {errorById[record.id] ? <p className="mt-1 text-xs text-red-600">{errorById[record.id]}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
