"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WindowDays = 7 | 30;
type TargetType = "EVENT" | "VENUE" | "ARTIST";
type Metric = "clicks" | "views";

type OverviewPayload = {
  windowDays: number;
  totals: {
    eventsTracked: number;
    uniqueUsers: number;
    uniqueSessions: number;
    digestsViewed: number;
    digestClicks: number;
    nearbyClicks: number;
    searchClicks: number;
    followingClicks: number;
    follows: number;
    saveSearches: number;
  };
  ctr: {
    digestCtr: number | null;
    nearbyCtr: number | null;
    searchCtr: number | null;
    followingCtr: number | null;
  };
  top: {
    events: Array<{ eventId: string; clicks: number; label?: string; href?: string }>;
    venues: Array<{ venueId: string; clicks: number; label?: string; href?: string }>;
    artists: Array<{ artistId: string; clicks: number; label?: string; href?: string }>;
  };
};

type TopTargetsPayload = {
  windowDays: number;
  targetType: TargetType;
  metric: Metric;
  items: Array<{
    targetId: string;
    views: number;
    clicks: number;
    ctr: number;
    label?: string;
    href?: string;
  }>;
};

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function TopList({ title, rows }: { title: string; rows: Array<{ id: string; clicks: number; label?: string; href?: string }> }) {
  return (
    <section className="border rounded p-3">
      <h3 className="font-medium">{title}</h3>
      {rows.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between gap-4">
              {row.href ? (
                <a className="underline truncate" href={row.href}>{row.label ?? row.id}</a>
              ) : (
                <code className="break-all text-xs">{row.label ?? row.id}</code>
              )}
              <span className="shrink-0">{row.clicks}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-neutral-500">No data in this window.</p>}
    </section>
  );
}

export default function AnalyticsAdminClient() {
  const [days, setDays] = useState<WindowDays>(7);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [topType, setTopType] = useState<TargetType>("EVENT");
  const [topMetric, setTopMetric] = useState<Metric>("clicks");
  const [topDays, setTopDays] = useState<WindowDays>(7);
  const [topData, setTopData] = useState<TopTargetsPayload | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [topLoading, setTopLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setOverviewLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/analytics/overview?days=${days}`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setData(null);
          setError(body?.error?.message || "Failed to load analytics");
          return;
        }
        setData(body as OverviewPayload);
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    async function loadTop() {
      setTopLoading(true);
      setTopError(null);
      try {
        const res = await fetch(`/api/admin/analytics/top-targets?days=${topDays}&targetType=${topType}&metric=${topMetric}&limit=20`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setTopData(null);
          setTopError(body?.error?.message || "Failed to load top targets");
          return;
        }
        setTopData(body as TopTargetsPayload);
      } finally {
        if (!cancelled) setTopLoading(false);
      }
    }
    void loadTop();
    return () => { cancelled = true; };
  }, [topDays, topMetric, topType]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="analytics-window" className="text-sm font-medium">Window</label>
        <select
          id="analytics-window"
          className="border rounded px-2 py-1"
          disabled={overviewLoading}
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value) as WindowDays)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {overviewLoading && !data ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded border bg-muted animate-pulse" />
          ))}
        </div>
      ) : null}
      {!overviewLoading && !data ? <p className="text-sm text-neutral-500">No analytics data available.</p> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.totals).map(([key, value]) => (
              <div key={key} className="border rounded p-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">{key}</p>
                <p className="text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="border rounded p-3"><p className="text-xs uppercase text-neutral-500">Digest CTR</p><p className="text-xl font-semibold">{formatPercent(data.ctr.digestCtr)}</p></div>
            <div className="border rounded p-3"><p className="text-xs uppercase text-neutral-500">Nearby CTR</p><p className="text-xl font-semibold">{formatPercent(data.ctr.nearbyCtr)}</p></div>
            <div className="border rounded p-3"><p className="text-xs uppercase text-neutral-500">Search CTR</p><p className="text-xl font-semibold">{formatPercent(data.ctr.searchCtr)}</p></div>
            <div className="border rounded p-3"><p className="text-xs uppercase text-neutral-500">Following CTR</p><p className="text-xl font-semibold">{formatPercent(data.ctr.followingCtr)}</p></div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <TopList title="Top Events" rows={data.top.events.map((item) => ({ id: item.eventId, clicks: item.clicks, label: item.label, href: item.href }))} />
            <TopList title="Top Venues" rows={data.top.venues.map((item) => ({ id: item.venueId, clicks: item.clicks, label: item.label, href: item.href }))} />
            <TopList title="Top Artists" rows={data.top.artists.map((item) => ({ id: item.artistId, clicks: item.clicks, label: item.label, href: item.href }))} />
          </div>
        </>
      ) : null}

      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-semibold">Top targets</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(["EVENT", "VENUE", "ARTIST"] as const).map((type) => (
            <button type="button" key={type} className={`px-3 py-1 border rounded text-sm ${topType === type ? "bg-primary text-primary-foreground" : "bg-background"}`} disabled={topLoading} onClick={() => setTopType(type)}>{type[0]}{type.slice(1).toLowerCase()}s</button>
          ))}

          <label className="ml-2 text-sm">Metric</label>
          <select disabled={topLoading} className="border rounded px-2 py-1 text-sm" value={topMetric} onChange={(e) => setTopMetric(e.target.value as Metric)}>
            <option value="clicks">Clicks</option>
            <option value="views">Views</option>
          </select>

          <label className="ml-2 text-sm">Window</label>
          <select disabled={topLoading} className="border rounded px-2 py-1 text-sm" value={String(topDays)} onChange={(e) => setTopDays(Number(e.target.value) as WindowDays)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        {topError ? <p className="text-sm text-red-600">{topError}</p> : null}
        {topLoading && !topData ? (
          <div className="h-10 rounded border bg-muted animate-pulse" />
        ) : null}
        {!topLoading && !topData ? <p className="text-sm text-neutral-500">No top targets found.</p> : null}
        {topData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Label</th>
                  <th className="text-right py-2">Clicks</th>
                  <th className="text-right py-2">Views</th>
                  <th className="text-right py-2">CTR</th>
                  <th className="text-right py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {topData.items.map((item) => (
                  <tr key={item.targetId} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      {item.href ? <Link className="underline" href={item.href}>{item.label ?? item.targetId}</Link> : <code>{item.label ?? item.targetId}</code>}
                    </td>
                    <td className="text-right">{item.clicks}</td>
                    <td className="text-right">{item.views}</td>
                    <td className="text-right">{formatPercent(item.ctr)}</td>
                    <td className="text-right">
                      <Link className="underline" href={`/admin/analytics/${topType}/${encodeURIComponent(item.targetId)}?days=${topDays}&metric=${topMetric}`}>Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}
