"use client";

import { useEffect, useState } from "react";

type QueryName =
  | "events_list"
  | "events_query"
  | "events_tags"
  | "events_date_range"
  | "events_geo_bbox"
  | "trending_groupby"
  | "trending_event_lookup"
  | "recommendations_seed"
  | "venue_upcoming"
  | "artist_upcoming"
  | "artist_past"
  | "admin_submissions"
  | "follow_counts";

type SnapshotListItem = {
  id: string;
  name: string;
  createdAt: string;
  paramsJson: Record<string, unknown>;
};

const names: QueryName[] = [
  "events_list",
  "events_query",
  "events_tags",
  "events_date_range",
  "events_geo_bbox",
  "trending_groupby",
  "trending_event_lookup",
  "recommendations_seed",
  "venue_upcoming",
  "artist_upcoming",
  "artist_past",
  "admin_submissions",
  "follow_counts",
];

export default function PerfAdminClient() {
  const [name, setName] = useState<QueryName>("events_list");
  const [days, setDays] = useState("30");
  const [limit, setLimit] = useState("20");
  const [status, setStatus] = useState("IN_REVIEW");
  const [targetType, setTargetType] = useState("ARTIST");
  const [targetId, setTargetId] = useState("");
  const [output, setOutput] = useState("");
  const [items, setItems] = useState<SnapshotListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function loadSnapshots() {
    const res = await fetch("/api/admin/perf/snapshots?limit=10", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    void loadSnapshots();
  }, []);

  async function runExplain() {
    const params: Record<string, unknown> = { limit: Number(limit), days: Number(days) };
    if (name === "admin_submissions") {
      params.status = status;
    }
    if (name === "follow_counts") {
      params.targetType = targetType;
      params.targetId = targetId;
    }

    const res = await fetch("/api/admin/perf/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, params }),
    });

    const data = await res.json();
    if (!res.ok) {
      setOutput(JSON.stringify(data, null, 2));
      return;
    }

    setOutput(data.explainText || "");
    setSelectedId(data.snapshotId);
    await loadSnapshots();
  }

  async function viewSnapshot(id: string) {
    const res = await fetch(`/api/admin/perf/snapshots/${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSelectedId(id);
    setOutput(data.explainText || "");
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-2 max-w-xl">
        <label className="text-sm">Query name</label>
        <select className="border rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value as QueryName)}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <label className="text-sm">Days</label>
        <input className="border rounded px-2 py-1" value={days} onChange={(e) => setDays(e.target.value)} />
        <label className="text-sm">Limit</label>
        <input className="border rounded px-2 py-1" value={limit} onChange={(e) => setLimit(e.target.value)} />

        {name === "admin_submissions" ? (
          <>
            <label className="text-sm">Status</label>
            <select className="border rounded px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </>
        ) : null}

        {name === "follow_counts" ? (
          <>
            <label className="text-sm">Target type</label>
            <select className="border rounded px-2 py-1" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="ARTIST">ARTIST</option>
              <option value="VENUE">VENUE</option>
            </select>
            <label className="text-sm">Target id (uuid)</label>
            <input className="border rounded px-2 py-1" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          </>
        ) : null}

        <button className="border rounded px-3 py-2 w-fit" onClick={runExplain}>Run EXPLAIN</button>
      </div>

      <div>
        <h2 className="font-medium">EXPLAIN Output {selectedId ? `(${selectedId})` : ""}</h2>
        <pre className="mt-2 p-3 border rounded bg-neutral-50 text-xs overflow-auto whitespace-pre-wrap">{output || "No output yet."}</pre>
      </div>

      <div>
        <h2 className="font-medium">Recent Snapshots</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <button className="underline" onClick={() => viewSnapshot(item.id)}>{item.name}</button>
              <span className="text-neutral-500">{new Date(item.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
