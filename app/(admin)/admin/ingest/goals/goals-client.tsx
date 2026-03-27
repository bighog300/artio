"use client";

import { Fragment, useState } from "react";
import { SuggestionsSection } from "@/app/(admin)/admin/ingest/discovery/suggestions-section";

type GoalWithProgress = {
  id: string;
  entityType: "VENUE" | "ARTIST" | "EVENT";
  region: string;
  country: string;
  targetCount: number;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  _count: { jobs: number };
  progress: {
    queued: number;
    seeded: number;
    published: number;
    jobCount: number;
    lastJobAt: Date | null;
    venuesWithApprovedEvents: number;
    totalApprovedEvents: number;
  };
};

type Props = {
  goals: GoalWithProgress[];
  statusCounts: { ACTIVE: number; PAUSED: number; COMPLETED: number; CANCELLED: number };
};


type RunFeedback = {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
};

function progressTone(seeded: number, target: number) {
  if (target <= 0) return "bg-red-500";
  if (seeded >= target) return "bg-emerald-500";
  if (seeded >= target * 0.5) return "bg-amber-500";
  return "bg-red-500";
}

function statusClass(status: GoalWithProgress["status"]) {
  if (status === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (status === "PAUSED") return "bg-amber-100 text-amber-900";
  if (status === "COMPLETED") return "bg-blue-100 text-blue-900";
  return "bg-muted text-muted-foreground";
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function GoalsClient({ goals: initialGoals, statusCounts }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [goals, setGoals] = useState(initialGoals);
  const [runFeedbackByGoalId, setRunFeedbackByGoalId] = useState<Record<string, RunFeedback>>({});
  const [expandedSuggestionsGoalId, setExpandedSuggestionsGoalId] =
    useState<string | null>(null);
  const [form, setForm] = useState({
    entityType: "VENUE" as "VENUE" | "ARTIST" | "EVENT",
    region: "",
    country: "",
    targetCount: 50,
    notes: "",
  });

  async function handleCreateGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.region.trim() || !form.country.trim() || form.targetCount < 1 || form.targetCount > 1000) {
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/admin/discovery/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: form.entityType,
          region: form.region.trim(),
          country: form.country.trim(),
          targetCount: form.targetCount,
          notes: form.notes.trim() ? form.notes.trim() : null,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json?.goal?.id) {
        return;
      }

      const created = await fetch(`/api/admin/discovery/goals/${json.goal.id}`, { cache: "no-store" });
      const detail = await created.json();
      if (!created.ok || !detail?.goal || !detail?.progress) {
        return;
      }

      setGoals((prev) => [
        {
          ...detail.goal,
          _count: { jobs: detail.jobs?.length ?? 0 },
          progress: detail.progress,
        },
        ...prev,
      ]);

      setShowCreateForm(false);
      setForm({ entityType: "VENUE", region: "", country: "", targetCount: 50, notes: "" });
    } finally {
      setCreating(false);
    }
  }

  async function runGoalNow(goalId: string) {
    setRunFeedbackByGoalId((prev) => ({
      ...prev,
      [goalId]: { status: "loading", message: null },
    }));

    try {
      const response = await fetch(`/api/admin/discovery/goals/${goalId}/run`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error("run_failed");
      }

      const queued = Number(json?.totalQueued ?? 0);
      setRunFeedbackByGoalId((prev) => ({
        ...prev,
        [goalId]: { status: "success", message: `${queued} candidates queued` },
      }));

      window.setTimeout(() => {
        setRunFeedbackByGoalId((prev) => ({
          ...prev,
          [goalId]: { status: "idle", message: null },
        }));
      }, 4000);
    } catch {
      setRunFeedbackByGoalId((prev) => ({
        ...prev,
        [goalId]: { status: "error", message: "Run failed" },
      }));
    }
  }

  async function updateGoalStatus(goalId: string, status: GoalWithProgress["status"]) {
    const response = await fetch(`/api/admin/discovery/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) return;

    setGoals((prev) => prev.map((goal) => (goal.id === goalId ? { ...goal, status } : goal)));
  }

  return (
    <section className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { label: "Active", value: statusCounts.ACTIVE },
          { label: "Paused", value: statusCounts.PAUSED },
          { label: "Completed", value: statusCounts.COMPLETED },
          { label: "Cancelled", value: statusCounts.CANCELLED },
        ].map((item) => (
          <span key={item.label} className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
            {item.label} ({item.value})
          </span>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Create a discovery goal</h3>
          <button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            className="rounded border px-2 py-1 text-xs"
          >
            New goal +
          </button>
        </div>

        {showCreateForm ? (
          <form onSubmit={handleCreateGoal} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Entity type</span>
              <select
                className="w-full rounded border px-2 py-1 text-sm text-foreground"
                value={form.entityType}
                onChange={(event) => setForm((prev) => ({ ...prev, entityType: event.target.value as "VENUE" | "ARTIST" | "EVENT" }))}
              >
                <option value="VENUE">Venue</option>
                <option value="ARTIST">Artist</option>
                <option value="EVENT">Event</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Target count</span>
              <input
                type="number"
                min={1}
                max={1000}
                required
                className="w-full rounded border px-2 py-1 text-sm text-foreground"
                value={form.targetCount}
                onChange={(event) => setForm((prev) => ({ ...prev, targetCount: Number(event.target.value) }))}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Region</span>
              <input
                type="text"
                required
                className="w-full rounded border px-2 py-1 text-sm text-foreground"
                value={form.region}
                onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Country</span>
              <input
                type="text"
                required
                className="w-full rounded border px-2 py-1 text-sm text-foreground"
                value={form.country}
                onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground md:col-span-2">
              <span>Notes (optional)</span>
              <textarea
                className="w-full rounded border px-2 py-1 text-sm text-foreground"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create goal"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {goals.length === 0 ? (
        <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          No active goals. Create one above to start goal-driven discovery.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Entity type</th>
                <th className="py-2 pr-3">Region</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Progress</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Jobs</th>
                <th className="py-2 pr-3">Last run</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => {
                const pct = goal.targetCount > 0 ? Math.min(100, Math.round((goal.progress.seeded / goal.targetCount) * 100)) : 0;
                return (
                  <Fragment key={goal.id}>
                    <tr className="border-b align-top last:border-0">
                      <td className="py-3 pr-3">{goal.entityType}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{goal.region}, {goal.country}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{goal.targetCount}</td>
                      <td className="py-3 pr-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded bg-muted">
                              <div className={`h-full ${progressTone(goal.progress.seeded, goal.targetCount)}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{goal.progress.seeded} / {goal.targetCount} seeded{goal.progress.totalApprovedEvents > 0
                              ? ` · ${goal.progress.totalApprovedEvents} approved events`
                              : ""}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(goal.status)}`}>
                          {goal.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{goal.progress.jobCount}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{formatDate(goal.progress.lastJobAt)}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {goal.status === "PAUSED" ? (
                            <button type="button" className="underline" onClick={() => updateGoalStatus(goal.id, "ACTIVE")}>Resume</button>
                          ) : (
                            <button type="button" className="underline" onClick={() => updateGoalStatus(goal.id, "PAUSED")}>Pause</button>
                          )}
                          {goal.status === "ACTIVE" ? (
                            <button type="button" className="underline" onClick={() => updateGoalStatus(goal.id, "COMPLETED")}>Complete</button>
                          ) : null}
                          <button
                            type="button"
                            className="underline disabled:opacity-50"
                            disabled={runFeedbackByGoalId[goal.id]?.status === "loading"}
                            onClick={() => runGoalNow(goal.id)}
                          >
                            {runFeedbackByGoalId[goal.id]?.status === "loading" ? "Running..." : "Run now"}
                          </button>
                          {runFeedbackByGoalId[goal.id]?.message ? (
                            <span
                              className={runFeedbackByGoalId[goal.id]?.status === "error"
                                ? "text-rose-600"
                                : "text-muted-foreground"}
                            >
                              {runFeedbackByGoalId[goal.id]?.message}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="underline"
                            onClick={() => setExpandedSuggestionsGoalId(
                              (prev) => prev === goal.id ? null : goal.id,
                            )}
                          >
                            {expandedSuggestionsGoalId === goal.id
                              ? "Hide suggestions"
                              : "Suggestions"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedSuggestionsGoalId === goal.id ? (
                      <tr>
                        <td colSpan={8} className="pb-4 pt-1">
                          <div className="rounded-lg border bg-background p-4">
                            <SuggestionsSection
                              initialSuggestions={[]}
                              entityType={
                                goal.entityType === "EVENT"
                                  ? undefined
                                  : goal.entityType
                              }
                              region={goal.region}
                              country={goal.country}
                              goalId={goal.id}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
