"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CronJob = {
  id: string;
  name: string;
  displayName: string;
  endpoint: string;
  schedule: string;
  enabled: boolean;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
};

function relativeFromNow(iso: string | null) {
  if (!iso) return "Never";
  const deltaMs = new Date(iso).getTime() - Date.now();
  const absMin = Math.round(Math.abs(deltaMs) / 60_000);
  if (absMin < 1) return deltaMs >= 0 ? "in <1 min" : "<1 min ago";
  if (absMin < 60) return deltaMs >= 0 ? `in ${absMin} min` : `${absMin} min ago`;
  const hrs = Math.round(absMin / 60);
  if (hrs < 24) return deltaMs >= 0 ? `in ${hrs} hr` : `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return deltaMs >= 0 ? `in ${days} day` : `${days} day ago`;
}

export default function CronSettingsClient() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [runNowState, setRunNowState] = useState<Record<string, string>>({});
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [jobsRes, tickRes] = await Promise.all([fetch("/api/admin/cron"), fetch("/api/admin/cron/tick-status")]);
    const jobsJson = await jobsRes.json();
    const tickJson = await tickRes.json();
    setJobs(jobsJson.jobs ?? []);
    setLastTickAt(tickJson.lastTickAt ?? null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const tickBanner = useMemo(() => {
    if (!lastTickAt) return "🔴 Tick not running — last ping was never";
    const ageSec = Math.floor((Date.now() - new Date(lastTickAt).getTime()) / 1000);
    if (ageSec < 120) return `🟢 Tick healthy — last ping ${ageSec} seconds ago`;
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 10) return `🟡 Tick delayed — last ping ${ageMin} minutes ago`;
    return `🔴 Tick not running — last ping was ${ageMin} minutes ago`;
  }, [lastTickAt]);

  async function patch(name: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/admin/cron/${name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json?.error?.code === "invalid_schedule") setErrors((prev) => ({ ...prev, [name]: "Invalid cron expression" }));
      return;
    }
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setJobs((prev) => prev.map((job) => (job.name === name ? json.job : job)));
  }

  async function runNow(name: string) {
    setRunNowState((prev) => ({ ...prev, [name]: "Running..." }));
    const res = await fetch(`/api/admin/cron/${name}/run-now`, { method: "POST" });
    const json = await res.json();
    setRunNowState((prev) => ({ ...prev, [name]: json.ok ? "Success" : `Error: ${json.message || json.status}` }));
    setTimeout(() => setRunNowState((prev) => ({ ...prev, [name]: "" })), 3000);
    await load();
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading scheduled jobs…</div>;

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4">
      <h2 className="text-base font-semibold">Scheduled Jobs</h2>
      <div className="rounded-md border p-3 text-sm">{tickBanner}</div>
      <p className="text-xs text-muted-foreground">The tick endpoint /api/cron/tick must be called every minute by an external service (e.g. UptimeRobot) with Authorization: Bearer &lt;CRON_SECRET&gt;. On Vercel Pro/Team this is handled automatically via vercel.json.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead><TableHead>Schedule</TableHead><TableHead>Enabled</TableHead><TableHead>Next Run</TableHead><TableHead>Last Run</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell><div className="font-medium">{job.displayName}</div><div className="text-xs text-muted-foreground">{job.name}</div></TableCell>
              <TableCell>
                <input
                  className="w-40 rounded border px-2 py-1 text-xs"
                  value={editing[job.name] ?? job.schedule}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [job.name]: e.target.value }))}
                  onBlur={() => void patch(job.name, { schedule: editing[job.name] ?? job.schedule })}
                  onKeyDown={(e) => { if (e.key === "Enter") void patch(job.name, { schedule: editing[job.name] ?? job.schedule }); }}
                />
                {errors[job.name] ? <div className="text-xs text-red-600">{errors[job.name]}</div> : null}
              </TableCell>
              <TableCell><Switch checked={job.enabled} onCheckedChange={(checked) => void patch(job.name, { enabled: checked })} /></TableCell>
              <TableCell>{relativeFromNow(job.nextFireAt)}</TableCell>
              <TableCell>{relativeFromNow(job.lastFiredAt)}</TableCell>
              <TableCell>
                {job.lastStatus === "success" ? <Badge>✅ success</Badge> : null}
                {job.lastStatus === "error" ? <Badge variant="destructive">❌ error</Badge> : null}
                {job.lastStatus === "running" ? <Badge variant="secondary">🟠 running</Badge> : null}
                {!job.lastStatus ? <Badge variant="outline">-</Badge> : null}
              </TableCell>
              <TableCell>
                <Button size="sm" onClick={() => void runNow(job.name)}>Run Now</Button>
                {runNowState[job.name] ? <div className="text-xs text-muted-foreground">{runNowState[job.name]}</div> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
