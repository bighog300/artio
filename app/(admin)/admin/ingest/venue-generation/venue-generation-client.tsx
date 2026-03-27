"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RunItem = {
  id: string;
  name: string;
  city: string | null;
  postcode: string | null;
  country: string;
  status: string;
  reason: string | null;
  venueId: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  contactEmail: string | null;
  socialWarning: string | null;
  homepageImageStatus: string;
  homepageImageCandidateCount: number;
  eventsPageStatus: string;
  eventsPageUrl: string | null;
  geocodeStatus: string;
  geocodeErrorCode: string | null;
  timezoneWarning: string | null;
  publishable: boolean;
  blockers: string[];
  venueStatus: string | null;
  createdAt: string | Date;
};

type Run = {
  id: string;
  country: string;
  region: string;
  totalReturned: number;
  totalCreated: number;
  totalSkipped: number;
  totalFailed: number;
  geocodeAttempted: number;
  geocodeSucceeded: number;
  geocodeFailed: number;
  geocodeFailureBreakdown: unknown;
  autoPublishedCount: number;
  createdAt: string | Date;
  status?: string | null;
  isStale?: boolean;
  totalQueued?: number;
  items: RunItem[];
};

function geocodeRate(run: Run) {
  if (!run.geocodeAttempted) return "0%";
  return `${Math.round((run.geocodeSucceeded / run.geocodeAttempted) * 100)}%`;
}

export function VenueGenerationClient({ initialRuns }: { initialRuns: Run[] }) {
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [runs, setRuns] = useState(initialRuns);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [publishingRunId, setPublishingRunId] = useState<string | null>(null);
  const [publishingVenueId, setPublishingVenueId] = useState<string | null>(null);
  const [publishedVenueIds, setPublishedVenueIds] = useState<Set<string>>(
    new Set(
      initialRuns
        .flatMap((run) => run.items)
        .filter((item) => item.venueId && item.venueStatus === "PUBLISHED")
        .map((item) => item.venueId as string),
    ),
  );
  const [publishVenueErrors, setPublishVenueErrors] = useState<Record<string, string>>({});
  const [onboardingVenueId, setOnboardingVenueId] = useState<string | null>(null);
  const [onboardSubmittingVenueId, setOnboardSubmittingVenueId] = useState<string | null>(null);
  const [onboardEventsPageUrl, setOnboardEventsPageUrl] = useState<Record<string, string>>({});
  const [onboardVenueErrors, setOnboardVenueErrors] = useState<Record<string, string>>({});
  const [publishResults, setPublishResults] = useState<Record<string, { published: number; skipped: number }>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const submittingRef = useRef(false);

  const eventsPageLabel = (status: string) => {
    if (status === "detected") return "detected";
    if (status === "not_found") return "not found";
    if (status === "fetch_failed") return "fetch failed";
    return "not attempted";
  };

  const refreshRuns = async () => {
    try {
      const runsRes = await fetch("/api/admin/venue-generation/runs", { cache: "no-store" });
      const runsBody = await runsRes.json().catch(() => ({}));
      if (runsRes.ok && Array.isArray(runsBody?.runs)) {
        setRuns(runsBody.runs);
      } else {
        setError("Failed to refresh runs list.");
      }
    } catch {
      setError("Failed to refresh runs list — check your connection.");
    }
  };

  async function publishVenue(venueId: string) {
    setPublishingVenueId(venueId);
    setPublishVenueErrors((prev) => {
      const next = { ...prev };
      delete next[venueId];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/venues/${venueId}/publish`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setPublishVenueErrors((prev) => ({ ...prev, [venueId]: body.error?.message ?? "Publish failed." }));
        return;
      }
      setPublishedVenueIds((prev) => new Set([...prev, venueId]));
    } finally {
      setPublishingVenueId(null);
    }
  }

  async function onboardVenue(venueId: string) {
    setOnboardSubmittingVenueId(venueId);
    setOnboardVenueErrors((prev) => {
      const next = { ...prev };
      delete next[venueId];
      return next;
    });
    try {
      const value = onboardEventsPageUrl[venueId]?.trim() ?? "";
      const res = await fetch(`/api/admin/venues/${venueId}/onboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventsPageUrl: value || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setOnboardVenueErrors((prev) => ({ ...prev, [venueId]: body.error?.message ?? "Onboarding publish failed." }));
        return;
      }
      setPublishedVenueIds((prev) => new Set([...prev, venueId]));
      setOnboardingVenueId(null);
    } finally {
      setOnboardSubmittingVenueId(null);
    }
  }

  function toggleItem(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submittingRef.current) return;
          submittingRef.current = true;
          setLoading(true);
          setError(null);
          setMessage(null);
          try {
            const response = await fetch("/api/admin/venue-generation", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ country, region }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error?.message ?? "Generation failed");
            setMessage(`${body.totalQueued ?? 0} venues queued, ${body.totalSkipped} skipped.`);
            await refreshRuns();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
          } finally {
            setLoading(false);
            submittingRef.current = false;
          }
        }}
      >
        <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" required />
        <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region" required />
        <Button type="submit" disabled={loading}>{loading ? "Generating…" : "Generate Venues"}</Button>
        <p className="col-span-full text-xs text-muted-foreground">
          Enter full geographic names, e.g. &quot;United Kingdom&quot; / &quot;Greater London&quot;. Letters, spaces, hyphens, and commas only.
        </p>
      </form>

      {message ? <p className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}

      <div className="space-y-3 rounded-lg border bg-background p-4">
        <h2 className="text-sm font-semibold">Recent Runs</h2>
        {runs.map((run) => {
          const created = run.items.filter((item) => item.status === "created");
          const skipped = run.items.filter((item) => item.status === "skipped");
          const failed = run.items.filter((item) => item.status === "failed");
          const breakdown = Object.entries((run.geocodeFailureBreakdown && typeof run.geocodeFailureBreakdown === "object" ? run.geocodeFailureBreakdown : {}) as Record<string, number>);

          return (
            <details key={run.id} className="rounded border p-3" open>
              <summary className="cursor-pointer text-sm font-medium">
                <span className={run.status === "FAILED" ? "text-red-600" : run.status === "RUNNING" || run.status === "PENDING" ? "text-amber-600" : "text-emerald-700"}>
                  [{run.status ?? "SUCCEEDED"}]
                </span>{" "}
                {run.region}, {run.country} — created {run.totalCreated}/{run.totalReturned}, queued {run.totalQueued ?? Math.max(0, run.totalReturned - run.totalSkipped)}, skipped {run.totalSkipped}, failed {run.totalFailed}, geocode {geocodeRate(run)}{run.autoPublishedCount > 0 ? `, auto-published: ${run.autoPublishedCount}` : ""}
              </summary>
              {run.isStale ? <p className="mt-2 text-xs text-amber-700">⚠️ Stale run (older than 30 minutes and not completed)</p> : null}
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span>Geocode: attempted {run.geocodeAttempted}, succeeded {run.geocodeSucceeded}, failed {run.geocodeFailed}</span>
                  {run.status === "SUCCEEDED" && run.totalCreated > 0 ? (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={publishingRunId === run.id}
                      onClick={async () => {
                        setPublishingRunId(run.id);
                        setError(null);
                        setMessage(null);
                        try {
                          const response = await fetch(`/api/admin/venue-generation/runs/${run.id}/bulk-publish`, { method: "POST" });
                          const body = await response.json();
                          if (!response.ok) throw new Error(body?.error?.message ?? "Bulk publish failed");
                          setPublishResults((prev) => ({ ...prev, [run.id]: { published: body.published ?? 0, skipped: body.skipped ?? 0 } }));
                          await refreshRuns();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Bulk publish failed");
                        } finally {
                          setPublishingRunId(null);
                        }
                      }}
                    >
                      {publishingRunId === run.id ? "Publishing…" : "Publish all ready"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryingRunId === run.id}
                    onClick={async () => {
                      setRetryingRunId(run.id);
                      setError(null);
                      setMessage(null);
                      try {
                        const response = await fetch(`/api/admin/venue-generation/runs/${run.id}/retry-geocode`, { method: "POST" });
                        const body = await response.json();
                        if (!response.ok) throw new Error(body?.error?.message ?? body?.message ?? "Retry geocoding failed");
                        setMessage(body.message ?? "Retry geocoding completed");
                        await refreshRuns();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Retry geocoding failed");
                      } finally {
                        setRetryingRunId(null);
                      }
                    }}
                  >
                    {retryingRunId === run.id ? "Retrying…" : "Retry geocoding for this run"}
                  </Button>
                  {publishResults[run.id] ? (
                    <span className="text-xs text-muted-foreground">
                      Published {publishResults[run.id].published}, skipped {publishResults[run.id].skipped}
                    </span>
                  ) : null}
                </div>

                {breakdown.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th>Error code</th><th>Count</th></tr></thead>
                    <tbody>{breakdown.map(([code, count]) => <tr key={code} className="border-t"><td className="py-1">{code}</td><td>{count}</td></tr>)}</tbody>
                  </table>
                ) : <p className="text-xs text-muted-foreground">No geocode failures recorded.</p>}

                <div>
                  <h3 className="font-medium">Created ({created.length})</h3>
                  <div className="mt-2 overflow-hidden rounded border">
                    <div className="flex items-center justify-between border-b bg-muted/10 px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">{created.length} venues</span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => {
                          const allExpanded = created.every((item) => expandedItems.has(item.id));
                          if (allExpanded) {
                            setExpandedItems((prev) => {
                              const next = new Set(prev);
                              created.forEach((item) => next.delete(item.id));
                              return next;
                            });
                            return;
                          }
                          setExpandedItems((prev) => {
                            const next = new Set(prev);
                            created.forEach((item) => next.add(item.id));
                            return next;
                          });
                        }}
                      >
                        {created.every((item) => expandedItems.has(item.id)) ? "Collapse all" : "Expand all"}
                      </button>
                    </div>
                    <ul>
                    {created.map((item) => (
                      <li key={item.id} className="border-b last:border-b-0">
                        <div
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/30"
                          onClick={() => toggleItem(item.id)}
                        >
                          <span className="min-w-0 flex-1 text-sm">
                            {item.venueId ? (
                              <Link
                                className="underline"
                                href={`/admin/venues/${item.venueId}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {item.name}
                              </Link>
                            ) : item.name}
                            {item.city ? <span className="text-muted-foreground"> · {item.city}</span> : null}
                          </span>
                          <span className={item.publishable ? "text-xs font-medium text-emerald-700" : "text-xs text-red-700"}>
                            {item.publishable ? "Ready" : "Blocked"}
                          </span>
                          <span className="min-w-0 max-w-56 truncate text-xs text-muted-foreground">
                            {item.blockers[0] ?? ""}
                          </span>
                          {item.venueId ? (
                            <>
                              {publishedVenueIds.has(item.venueId) ? (
                                <span className="text-xs text-emerald-700">✓ Published</span>
                              ) : publishingVenueId === item.venueId ? (
                                <span className="text-xs text-muted-foreground">Publishing…</span>
                              ) : item.venueStatus === "ONBOARDING" && item.publishable ? (
                                <button
                                  type="button"
                                  className="text-xs underline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const venueId = item.venueId as string;
                                    setOnboardingVenueId((prev) => (prev === venueId ? null : venueId));
                                    setOnboardEventsPageUrl((prev) => (
                                      venueId in prev
                                        ? prev
                                        : { ...prev, [venueId]: item.eventsPageStatus === "detected" ? (item.eventsPageUrl ?? "") : "" }
                                    ));
                                  }}
                                >
                                  Onboard
                                </button>
                              ) : item.publishable && (item.venueStatus === "DRAFT" || Boolean(item.eventsPageUrl)) ? (
                                <button
                                  type="button"
                                  className="text-xs underline"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void publishVenue(item.venueId as string);
                                  }}
                                >
                                  Publish
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground" title={item.blockers.join(", ")}>Blocked</span>
                              )}
                            </>
                          ) : null}
                          <span className="select-none text-xs text-muted-foreground">
                            {expandedItems.has(item.id) ? "▲" : "▼"}
                          </span>
                        </div>
                        {item.venueId && publishVenueErrors[item.venueId] ? (
                          <div className="px-3 pb-2 text-xs text-red-700">
                            {publishVenueErrors[item.venueId]}{" "}
                            <button
                              type="button"
                              className="underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPublishVenueErrors((prev) => {
                                  const next = { ...prev };
                                  delete next[item.venueId as string];
                                  return next;
                                });
                              }}
                              aria-label={`Dismiss publish error for ${item.name}`}
                            >
                              ✕
                            </button>
                          </div>
                        ) : null}
                        {item.venueId && onboardingVenueId === item.venueId ? (
                          <div className="mx-3 mb-2 rounded border bg-muted/20 p-2 text-xs">
                            <label className="block space-y-1">
                              <span className="font-medium">Events page URL (optional)</span>
                              <Input
                                value={onboardEventsPageUrl[item.venueId] ?? ""}
                                onChange={(event) => setOnboardEventsPageUrl((prev) => ({ ...prev, [item.venueId as string]: event.target.value }))}
                                placeholder="https://example.com/events"
                              />
                            </label>
                            <div className="mt-2 flex items-center gap-3">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => onboardVenue(item.venueId as string)}
                                disabled={onboardSubmittingVenueId === item.venueId}
                              >
                                {onboardSubmittingVenueId === item.venueId ? "Publishing…" : "Publish venue"}
                              </Button>
                              {onboardVenueErrors[item.venueId] ? <span className="text-red-700">{onboardVenueErrors[item.venueId]}</span> : null}
                            </div>
                          </div>
                        ) : null}
                        {expandedItems.has(item.id) ? (
                          <div className="space-y-1 bg-muted/20 px-3 pb-3 pt-1 text-xs text-muted-foreground">
                            <p>
                              Geocode: {item.geocodeStatus}
                              {item.geocodeErrorCode ? ` (${item.geocodeErrorCode})` : ""}
                              {item.timezoneWarning ? ` · timezone: ${item.timezoneWarning}` : ""}
                            </p>
                            <p>
                              Homepage images: {item.homepageImageStatus}
                              {item.homepageImageCandidateCount > 0 ? ` (${item.homepageImageCandidateCount} candidates)` : ""}
                            </p>
                            <p>Events page: {eventsPageLabel(item.eventsPageStatus)}</p>
                            {item.socialWarning ? <p>Social: {item.socialWarning}</p> : null}
                            {item.instagramUrl ? <p>Instagram: <a className="underline" href={item.instagramUrl} target="_blank" rel="noreferrer">{item.instagramUrl}</a></p> : null}
                            {item.facebookUrl ? <p>Facebook: <a className="underline" href={item.facebookUrl} target="_blank" rel="noreferrer">{item.facebookUrl}</a></p> : null}
                            {item.contactEmail ? <p>Contact: {item.contactEmail}</p> : null}
                            {item.reason ? <p>Status reason: {item.reason}</p> : null}
                            {item.blockers?.length > 0 ? <p className="text-red-700">All blockers: {item.blockers.join(", ")}</p> : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium">Skipped ({skipped.length})</h3>
                  <ul className="list-disc pl-5">{skipped.map((item) => <li key={item.id}>{item.name} — {item.reason ?? "skipped"}</li>)}</ul>
                </div>
                <div>
                  <h3 className="font-medium">Failed ({failed.length})</h3>
                  <ul className="list-disc pl-5">{failed.map((item) => <li key={item.id}>{item.name} — {item.reason ?? "failed"}</li>)}</ul>
                </div>
                {run.items.length >= 50 ? (
                  <p className="text-xs text-muted-foreground">
                    Showing first 50 items. Full data available via the API.
                  </p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
