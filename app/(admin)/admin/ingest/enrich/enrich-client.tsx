"use client";

import { Fragment, useMemo, useState } from "react";

export type GapFilter = "ALL" | "MISSING_BIO" | "MISSING_DESCRIPTION" | "MISSING_IMAGE";
export type StatusFilter = "ALL" | "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ONBOARDING";
export type SearchProvider = "google_pse" | "brave" | "ai_only";

type TemplateKey = "ARTIST_BIO" | "ARTIST_IMAGE" | "ARTWORK_DESCRIPTION" | "ARTWORK_IMAGE" | "VENUE_DESCRIPTION" | "EVENT_IMAGE";
type EntityType = "ARTIST" | "ARTWORK" | "VENUE" | "EVENT";

type PreviewItem = {
  id: string;
  name: string;
  status: string;
  confidenceScore: number;
  gaps: string[];
};

type RunDetailItem = {
  id: string;
  status: "PENDING" | "STAGED" | "SKIPPED" | "SUCCESS" | "FAILED";
  errorMessage: string | null;
  fieldsBefore: Record<string, unknown> | null;
  fieldsAfter: Record<string, unknown> | null;
  fieldsChanged?: string[];
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  artistId: string | null;
  artworkId: string | null;
  venueId: string | null;
  eventId: string | null;
  artist?: { name: string } | null;
  artwork?: { title: string } | null;
  venue?: { name: string } | null;
  event?: { title: string } | null;
};

export type EnrichmentRun = {
  id: string;
  templateKey: TemplateKey;
  entityType: EntityType;
  createdAt: string | Date;
  processedItems: number;
  successItems: number;
  skippedItems: number;
  failedItems: number;
  totalItems: number;
  _count?: { items: number };
  status?: string;
};

export type WorkbenchTemplate = {
  key: TemplateKey;
  label: string;
  entityType: EntityType;
  searchEnabled: boolean;
  gapOptions: Array<{ value: GapFilter; label: string }>;
};

function timeAgo(value: string | Date) {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  return rtf.format(Math.round(diffHr / 24), "day");
}

function scoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

function priorityFromScore(score: number) {
  if (score < 60) return { label: "HIGH", className: "bg-rose-100 text-rose-800" };
  if (score < 80) return { label: "MED", className: "bg-amber-100 text-amber-800" };
  return { label: "LOW", className: "bg-emerald-100 text-emerald-800" };
}

function statusChip(status: string) {
  switch (status) {
    case "SUCCESS":
    case "PUBLISHED":
      return "bg-emerald-100 text-emerald-800";
    case "FAILED":
      return "bg-rose-100 text-rose-700";
    case "SKIPPED":
      return "bg-muted text-muted-foreground";
    case "STAGED":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function FieldDiff({
  before,
  after,
  fieldsChanged,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  fieldsChanged?: string[];
}) {
  const keys = fieldsChanged?.length ? fieldsChanged : Object.keys(after ?? {});

  if (!keys.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1">
      {keys.map((key) => {
        const oldVal = before?.[key];
        const newVal = after?.[key];
        const display = (value: unknown): string => {
          if (value == null) return "—";
          if (key === "featuredAssetId") {
            return value === "PENDING_IMAGE" ? "(image would be imported)" : "(image set)";
          }
          if (Array.isArray(value)) return value.join(", ") || "—";
          const rendered = String(value);
          return rendered.length > 80 ? `${rendered.slice(0, 77)}…` : rendered;
        };

        return (
          <div key={key} className="text-xs">
            <span className="font-medium text-muted-foreground">{key}: </span>
            {oldVal !== newVal ? (
              <>
                <span className="text-rose-600/70 line-through">{display(oldVal)}</span>
                {" → "}
                <span className="text-emerald-700">{display(newVal)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{display(newVal)} (unchanged)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EnrichClient({ templates, initialRuns }: { templates: WorkbenchTemplate[]; initialRuns: EnrichmentRun[] }) {
  const initialTemplate = templates[0];

  const [templateId, setTemplateId] = useState<TemplateKey>(initialTemplate.key);
  const [entityType, setEntityType] = useState<EntityType>(initialTemplate.entityType);
  const [gapFilter, setGapFilter] = useState<GapFilter>(initialTemplate.gapOptions[0]?.value ?? "ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("google_pse");
  const [limit, setLimit] = useState<10 | 25 | 50>(25);
  const [dryRun, setDryRun] = useState(true);
  const [previewItems, setPreviewItems] = useState<PreviewItem[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null);
  const [runs, setRuns] = useState<EnrichmentRun[]>(initialRuns);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [detailsByRunId, setDetailsByRunId] = useState<Record<string, RunDetailItem[]>>({});
  const [applyingRunId, setApplyingRunId] = useState<string | null>(null);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.key === templateId) ?? templates[0],
    [templateId, templates],
  );

  const sortedPreviewItems = useMemo(() => {
    if (!previewItems) return null;
    return [...previewItems].sort((a, b) => {
      const pa = priorityFromScore(a.confidenceScore).label;
      const pb = priorityFromScore(b.confidenceScore).label;
      const order: Record<string, number> = { HIGH: 0, MED: 1, LOW: 2 };
      return order[pa] - order[pb] || a.name.localeCompare(b.name);
    });
  }, [previewItems]);

  function handleTemplateChange(nextTemplateId: TemplateKey) {
    const selected = templates.find((template) => template.key === nextTemplateId);
    if (!selected) return;
    setTemplateId(nextTemplateId);
    setEntityType(selected.entityType);
    setGapFilter(selected.gapOptions[0]?.value ?? "ALL");
    setPreviewItems(null);
    setRunProgress(null);
  }

  async function previewTargets() {
    setPreviewing(true);
    try {
      const params = new URLSearchParams({
        templateId,
        entityType,
        gapFilter,
        statusFilter,
        limit: String(limit),
      });

      const response = await fetch(`/api/admin/enrichment/preview?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Failed to preview targets");
      setPreviewItems((data.items ?? []) as PreviewItem[]);
    } catch {
      setPreviewItems([]);
    } finally {
      setPreviewing(false);
    }
  }

  async function runEnrichment() {
    if (!previewItems || running) return;
    setRunning(true);
    setRunProgress({ done: 0, total: previewItems.length });

    try {
      const effectiveProvider = activeTemplate.searchEnabled ? searchProvider : "ai_only";
      const response = await fetch("/api/admin/enrichment/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          entityType,
          gapFilter,
          statusFilter,
          searchProvider: effectiveProvider,
          limit,
          dryRun,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Failed to run enrichment");
      const run = data.run as EnrichmentRun & { items?: RunDetailItem[] };
      setRuns((prev) => [run, ...prev].slice(0, 20));
      setExpandedRunId(run.id);
      const detailResponse = await fetch(`/api/admin/enrichment/runs/${run.id}`);
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        setDetailsByRunId((prev) => ({ ...prev, [run.id]: (detailData.run?.items ?? []) as RunDetailItem[] }));
      } else {
        setDetailsByRunId((prev) => ({ ...prev, [run.id]: (run.items ?? []) as RunDetailItem[] }));
      }
      setRunProgress({ done: previewItems.length, total: previewItems.length });
    } finally {
      setRunning(false);
    }
  }

  async function toggleExpand(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(runId);
    if (detailsByRunId[runId]) return;

    const response = await fetch(`/api/admin/enrichment/runs/${runId}`);
    const data = await response.json();
    if (!response.ok) return;
    setDetailsByRunId((prev) => ({ ...prev, [runId]: (data.run?.items ?? []) as RunDetailItem[] }));
  }

  async function retryFailed(run: EnrichmentRun) {
    const response = await fetch(`/api/admin/enrichment/runs/${run.id}/retry`, { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.run) return;

    const updatedRun = data.run as EnrichmentRun & { items?: RunDetailItem[] };
    setRuns((prev) => prev.map((existing) => (existing.id === run.id ? updatedRun : existing)));
    if (updatedRun.items) {
      setDetailsByRunId((prev) => ({ ...prev, [run.id]: updatedRun.items as RunDetailItem[] }));
    }
  }

  async function applyRun(runId: string) {
    setApplyingRunId(runId);
    try {
      const response = await fetch(`/api/admin/enrichment/runs/${runId}/apply`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Apply failed");
      const updatedRun = data.run as EnrichmentRun & { items?: RunDetailItem[] };
      setRuns((prev) => prev.map((run) => (run.id === runId ? { ...run, ...updatedRun, status: "COMPLETED" } : run)));
      if (updatedRun.items) {
        setDetailsByRunId((prev) => ({ ...prev, [runId]: updatedRun.items as RunDetailItem[] }));
      }
    } finally {
      setApplyingRunId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Configure</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Template</span>
            <select className="w-full rounded border bg-background px-3 py-2 text-sm" value={templateId} onChange={(e) => handleTemplateChange(e.target.value as TemplateKey)}>
              {templates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Entity type</span>
            <select className="w-full rounded border bg-background px-3 py-2 text-sm" value={entityType} onChange={(e) => setEntityType(e.target.value as EntityType)}>
              <option value="ARTIST">ARTIST</option>
              <option value="ARTWORK">ARTWORK</option>
              <option value="VENUE">VENUE</option>
              <option value="EVENT">EVENT</option>
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Gap filter</span>
            <select className="w-full rounded border bg-background px-3 py-2 text-sm" value={gapFilter} onChange={(e) => setGapFilter(e.target.value as GapFilter)}>
              {activeTemplate.gapOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Status filter</span>
            <select className="w-full rounded border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="ALL">ALL</option>
              <option value="DRAFT">DRAFT</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ONBOARDING">ONBOARDING</option>
            </select>
          </label>

          {activeTemplate.searchEnabled ? (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Search provider</span>
              <select className="w-full rounded border bg-background px-3 py-2 text-sm" value={searchProvider} onChange={(e) => setSearchProvider(e.target.value as SearchProvider)}>
                <option value="google_pse">Google PSE</option>
                <option value="brave">Brave</option>
                <option value="ai_only">AI only</option>
              </select>
            </label>
          ) : null}

          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Limit</span>
            <select className="w-full rounded border bg-background px-3 py-2 text-sm" value={limit} onChange={(e) => setLimit(Number(e.target.value) as 10 | 25 | 50)}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="rounded"
          />
          <span>Dry run — stage changes for review before applying</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={previewTargets} disabled={previewing || running}>
            {previewing ? "Previewing..." : `Preview targets${previewItems ? ` (${previewItems.length})` : ""}`}
          </button>
          <button
            type="button"
            className="rounded bg-foreground px-3 py-2 text-sm text-background disabled:cursor-not-allowed disabled:opacity-50"
            onClick={runEnrichment}
            disabled={!previewItems || running}
          >
            {running && runProgress ? `Running... (${runProgress.done}/${runProgress.total})` : dryRun ? `Stage ${previewItems?.length ?? 0} records for review →` : `Run ${previewItems?.length ?? 0} records (writes immediately) →`}
          </button>
        </div>
      </section>

      {sortedPreviewItems ? (
        <section className="rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">Preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sortedPreviewItems.length === 0 ? "No records match this filter — try a different gap or status filter." : `${sortedPreviewItems.length} records will be processed`}
          </p>

          {sortedPreviewItems.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2">Gaps</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPreviewItems.map((item) => {
                    const priority = priorityFromScore(item.confidenceScore);
                    return (
                      <tr key={item.id} className="border-b align-top last:border-0">
                        <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-[11px] ${priority.className}`}>{priority.label}</span></td>
                        <td className="py-2 pr-3 font-medium">{item.name}</td>
                        <td className="py-2 pr-3">{item.status}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded bg-muted"><div className={`h-full ${scoreTone(item.confidenceScore)}`} style={{ width: `${item.confidenceScore}%` }} /></div>
                            <span className="text-xs text-muted-foreground">{item.confidenceScore}</span>
                          </div>
                        </td>
                        <td className="py-2"><div className="flex flex-wrap gap-1">{item.gaps.map((gap) => <span key={`${item.id}-${gap}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{gap}</span>)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Run history</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Template</th>
                <th className="py-2 pr-3">Entity</th>
                <th className="py-2 pr-3">Run status</th>
                <th className="py-2 pr-3">Processed</th>
                <th className="py-2 pr-3">Enriched</th>
                <th className="py-2 pr-3">Skipped</th>
                <th className="py-2 pr-3">Failed</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((run) => (
                <Fragment key={run.id}>
                  <tr className="border-b align-top">
                    <td className="py-2 pr-3 text-muted-foreground" suppressHydrationWarning>{timeAgo(run.createdAt)}</td>
                    <td className="py-2 pr-3">{templates.find((template) => template.key === run.templateKey)?.label ?? run.templateKey}</td>
                    <td className="py-2 pr-3">{run.entityType}</td>
                    <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 ${statusChip(run.status ?? "PENDING")}`}>{run.status ?? "PENDING"}</span></td>
                    <td className="py-2 pr-3">{run.processedItems || run._count?.items || run.totalItems}</td>
                    <td className="py-2 pr-3 text-emerald-700">{run.successItems}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{run.skippedItems}</td>
                    <td className={`py-2 pr-3 ${run.failedItems > 0 ? "text-rose-700" : "text-muted-foreground"}`}>{run.failedItems}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => toggleExpand(run.id)}>
                          {expandedRunId === run.id ? "Collapse" : "Expand"}
                        </button>
                        {run.status === "STAGED" ? (
                          <button
                            type="button"
                            className="rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            disabled={applyingRunId === run.id}
                            onClick={() => void applyRun(run.id)}
                          >
                            {applyingRunId === run.id ? "Applying…" : `Apply ${run.totalItems} staged`}
                          </button>
                        ) : null}
                        {run.failedItems > 0 ? (
                          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => retryFailed(run)}>
                            Retry {run.failedItems} failed
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expandedRunId === run.id ? (
                    <tr className="border-b">
                      <td className="py-2" colSpan={9}>
                        <div className="overflow-x-auto rounded border">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="border-b text-left uppercase tracking-wide text-muted-foreground">
                                <th className="px-2 py-1.5">Name</th>
                                <th className="px-2 py-1.5">Changes</th>
                                <th className="px-2 py-1.5">Confidence delta</th>
                                <th className="px-2 py-1.5">Status</th>
                                <th className="px-2 py-1.5">Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(detailsByRunId[run.id] ?? []).map((item) => {
                                const delta = (item.confidenceAfter ?? 0) - (item.confidenceBefore ?? 0);
                                return (
                                  <tr key={item.id} className="border-b last:border-0">
                                    <td className="px-2 py-1.5 text-muted-foreground">{item.artist?.name ?? item.artwork?.title ?? item.venue?.name ?? item.event?.title ?? item.artistId ?? item.artworkId ?? item.venueId ?? item.eventId ?? "—"}</td>
                                    <td className="px-2 py-1.5" colSpan={1}>
                                      <FieldDiff before={item.fieldsBefore} after={item.fieldsAfter} fieldsChanged={item.fieldsChanged} />
                                    </td>
                                    <td className={`px-2 py-1.5 ${delta > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>{item.confidenceBefore == null || item.confidenceAfter == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</td>
                                    <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 ${statusChip(item.status)}`}>{item.status}</span></td>
                                    <td className="px-2 py-1.5 text-destructive text-xs">{item.status === "FAILED" ? (item.errorMessage ?? "unknown") : null}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td className="py-6 text-sm text-muted-foreground" colSpan={9}>No runs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
