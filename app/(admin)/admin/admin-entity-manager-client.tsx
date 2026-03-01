"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import AdminInlineRowActions, { buildEditableDraft, getNextEditingId } from "./_components/AdminInlineRowActions";

type EntityName = "venues" | "events" | "artists";
type ModerationStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED" | "ARCHIVED";

const moderationTabs: Array<{ value: ModerationStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PUBLISHED", label: "Published" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ARCHIVED", label: "Archived" },
];

const defaultStatusCounts: Record<ModerationStatus, number> = {
  DRAFT: 0,
  IN_REVIEW: 0,
  APPROVED: 0,
  PUBLISHED: 0,
  REJECTED: 0,
  ARCHIVED: 0,
};

type RowResult = { rowIndex: number; status: string; errors?: string[]; targetId?: string; patch?: Record<string, unknown> };
type PresetListItem = { id: string; name: string; entityType: EntityName; updatedAt: string };

type EditableField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "checkbox" | "datetime";
};

export function AdminEntityManagerClient({ entity, fields, title, defaultMatchBy }: { entity: EntityName; fields: string[]; title: string; defaultMatchBy: "id" | "slug" | "name" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get("status");
  const selectedStatus = moderationTabs.some((tab) => tab.value === rawStatus) ? (rawStatus as ModerationStatus) : "IN_REVIEW";

  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<ModerationStatus, number>>(defaultStatusCounts);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});

  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ summary: Record<string, number>; rowResults: RowResult[]; sampleRows: string[][] } | null>(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [matchBy, setMatchBy] = useState<"id" | "slug" | "name">(defaultMatchBy);
  const [presets, setPresets] = useState<PresetListItem[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  const maxPage = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);
  const editableConfig = useMemo(() => editableFieldsForEntity(entity), [entity]);
  const editableKeys = useMemo(() => new Set(editableConfig.map((field) => String(field.key))), [editableConfig]);

  const loadData = useCallback(async (nextQuery = query, nextPage = page) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      params.set("status", selectedStatus);
      if (showArchived) params.set("showArchived", "1");
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const res = await fetch(`/api/admin/${entity}?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load");
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
      setStatusCounts({ ...defaultStatusCounts, ...(body.statusCounts ?? {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setBusy(false);
    }
  }, [entity, page, query, selectedStatus, showArchived]);

  const loadPresets = useCallback(async () => {
    try {
      const params = new URLSearchParams({ entityType: entity });
      const res = await fetch(`/api/admin/import-mapping-presets?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load presets");
      setPresets(body.presets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load presets");
    }
  }, [entity]);

  useEffect(() => {
    if (!searchParams.get("status")) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("status", "IN_REVIEW");
      router.replace(`${pathname}?${params.toString()}`);
      return;
    }

    const timer = setTimeout(() => void loadData(query, page), 250);
    return () => clearTimeout(timer);
  }, [loadData, page, pathname, query, router, searchParams]);

  useEffect(() => {
    if (!importOpen) return;
    setPresetNotice(null);
    void loadPresets();
  }, [importOpen, loadPresets]);


  function updateSelectedStatus(nextStatus: ModerationStatus) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", nextStatus);
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
    setPage(1);
  }
  function startEdit(item: Record<string, unknown>) {
    const id = String(item.id ?? "");
    setEditingId((current) => getNextEditingId(current, id));
    setDrafts((current) => ({ ...current, [id]: buildEditableDraft(item, editableConfig) }));
  }

  async function exportCsv() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    const href = `/api/admin/${entity}/export?${params.toString()}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function suggestField(column: string) {
    const lowered = column.toLowerCase();
    return fields.find((field) => lowered.includes(field.toLowerCase()) || field.toLowerCase().includes(lowered)) ?? "__ignore";
  }

  async function onUpload(file: File) {
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    const [head = ""] = text.split(/\r?\n/, 1);
    const parsedHeaders = head.split(",").map((part) => part.trim()).filter(Boolean);
    setHeaders(parsedHeaders);
    setMapping(Object.fromEntries(parsedHeaders.map((column) => [column, suggestField(column)])));
    setPreview(null);
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", new File([csvText], fileName ?? `${entity}.csv`, { type: "text/csv" }));
      form.set("mapping", JSON.stringify(mapping));
      form.set("options", JSON.stringify({ createMissing, matchBy, dryRun: true }));
      const res = await fetch(`/api/admin/${entity}/import/preview`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Preview failed");
      setPreview(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", new File([csvText], fileName ?? `${entity}.csv`, { type: "text/csv" }));
      form.set("mapping", JSON.stringify(mapping));
      form.set("options", JSON.stringify({ createMissing, matchBy, dryRun: false }));
      const res = await fetch(`/api/admin/${entity}/import/apply`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Apply failed");
      setImportOpen(false);
      setPreview(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSelectedPreset(presetId: string) {
    if (!presetId) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/import-mapping-presets/${presetId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load preset");
      setMapping((body.mappingJson ?? {}) as Record<string, string>);
      setPresetNotice(`Loaded preset \"${body.name}\".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preset");
    }
  }

  async function savePreset() {
    const name = window.prompt("Preset name (2-60 chars):");
    if (!name) return;
    setError(null);
    try {
      const payload = { entityType: entity, name, mapping };
      const firstRes = await fetch("/api/admin/import-mapping-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (firstRes.status === 409) {
        const overwrite = window.confirm("Preset exists. Overwrite it?");
        if (!overwrite) return;
        const overwriteRes = await fetch("/api/admin/import-mapping-presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, overwrite: true }),
        });
        const overwriteBody = await overwriteRes.json();
        if (!overwriteRes.ok) throw new Error(overwriteBody?.error?.message ?? "Failed to overwrite preset");
        await loadPresets();
        setSelectedPresetId(overwriteBody.id);
        setPresetNotice(`Preset \"${overwriteBody.name}\" overwritten.`);
        return;
      }

      const body = await firstRes.json();
      if (!firstRes.ok) throw new Error(body?.error?.message ?? "Failed to save preset");
      await loadPresets();
      setSelectedPresetId(body.id);
      setPresetNotice(`Preset \"${body.name}\" saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset");
    }
  }

  async function deleteSelectedPreset() {
    if (!selectedPresetId) return;
    const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
    const confirmed = window.confirm(`Delete preset \"${selectedPreset?.name ?? "selected"}\"?`);
    if (!confirmed) return;

    setError(null);
    try {
      const res = await fetch(`/api/admin/import-mapping-presets/${selectedPresetId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to delete preset");
      await loadPresets();
      setSelectedPresetId("");
      setPresetNotice("Preset deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete preset");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">Total: {total}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {moderationTabs.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            variant={selectedStatus === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => updateSelectedStatus(tab.value)}
          >
            {tab.label} <span className="ml-1 rounded bg-background/70 px-1.5 py-0.5 text-xs">{statusCounts[tab.value] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} className="rounded border px-2 py-1 text-sm" placeholder={`Search ${entity}`} />
        <Button type="button" variant="outline" size="sm" onClick={() => void exportCsv()}>Export CSV</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen((v) => !v)}>Import CSV</Button>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={showArchived} onChange={(e) => { setPage(1); setShowArchived(e.target.checked); }} /> Show archived</label>
      </div>

      {importOpen ? (
        <div className="space-y-2 rounded border p-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onUpload(file); }} />
          {headers.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select value={selectedPresetId} onChange={(e) => { const presetId = e.target.value; setSelectedPresetId(presetId); void loadSelectedPreset(presetId); }} className="rounded border px-2 py-1">
                  <option value="">Load preset</option>
                  {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" onClick={() => void savePreset()}>Save preset</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void deleteSelectedPreset()} disabled={!selectedPresetId}>Delete preset</Button>
              </div>
              {presetNotice ? <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">{presetNotice}</p> : null}
              <div className="grid gap-2 md:grid-cols-2">
                {headers.map((column) => (
                  <label key={column} className="flex items-center justify-between gap-2 text-sm">
                    <span>{column}</span>
                    <select value={mapping[column] ?? "__ignore"} onChange={(e) => setMapping((m) => ({ ...m, [column]: e.target.value }))} className="rounded border px-2 py-1">
                      <option value="__ignore">Ignore</option>
                      {fields.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} /> Create missing</label>
                <select className="rounded border px-2 py-1" value={matchBy} onChange={(e) => setMatchBy(e.target.value as "id" | "slug" | "name") }>
                  <option value="id">matchBy=id</option>
                  <option value="slug">matchBy=slug</option>
                  <option value="name">matchBy=name</option>
                </select>
                <Button type="button" variant="outline" size="sm" onClick={() => void runPreview()}>Preview import</Button>
              </div>
            </div>
          ) : null}
          {preview ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Summary: total {preview.summary.total}, valid {preview.summary.valid}, invalid {preview.summary.invalid}, update {preview.summary.willUpdate}, create {preview.summary.willCreate}, skipped {preview.summary.skipped}</p>
              <div className="max-h-64 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead><tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Errors</th></tr></thead>
                  <tbody>{preview.rowResults.slice(0, 20).map((row) => <tr key={row.rowIndex} className="border-t"><td className="px-2 py-1">{row.rowIndex}</td><td className="px-2 py-1">{row.status}</td><td className="px-2 py-1">{row.errors?.join(", ") ?? ""}</td></tr>)}</tbody>
                </table>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void applyImport()}>Apply import</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50"><tr>{["id", ...fields, "status", "actions"].map((field) => <th key={field} className="px-3 py-2 text-left">{field}</th>)}</tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td className="px-3 py-3 text-muted-foreground" colSpan={fields.length + 3}>{busy ? "Loading..." : "No records"}</td></tr> : items.map((item) => {
              const id = String(item.id ?? "");
              const isEditing = editingId === id;
              return (
                <tr key={id} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">{id}</td>
                  {fields.map((field) => (
                    <td key={field} className="px-3 py-2">
                      {isEditing && editableKeys.has(field)
                        ? renderEditableField({
                          field,
                          value: drafts[id]?.[field],
                          onChange: (next) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [field]: next } })),
                        })
                        : String(item[field] ?? "")}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {typeof item.status === "string" ? <span className="rounded border px-2 py-0.5 text-xs">{item.status}</span> : null}
                      {item.deletedAt ? <span className="rounded border px-2 py-0.5 text-xs">Archived</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <AdminInlineRowActions
                      entityLabel={entityLabelForEntity(entity)}
                      entityType={entity}
                      id={id}
                      initial={item}
                      editable={editableConfig}
                      patchUrl={`/api/admin/${entity}/${id}`}
                      archiveUrl={`/api/admin/${entity}/${id}/archive`}
                      restoreUrl={`/api/admin/${entity}/${id}/restore`}
                      deleteUrl={`/api/admin/${entity}/${id}`}
                      isArchived={Boolean(item.deletedAt)}
                      isEditing={isEditing}
                      status={typeof item.status === "string" ? item.status : undefined}
                      publishBlockers={Array.isArray(item.publishBlockers) ? item.publishBlockers.filter((entry): entry is string => typeof entry === "string") : []}
                      onStartEdit={() => startEdit(item)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveSuccess={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
        <span className="text-sm">Page {page} / {maxPage}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Next</Button>
      </div>
    </div>
  );
}

function entityLabelForEntity(entity: EntityName) {
  if (entity === "events") return "Event";
  if (entity === "venues") return "Venue";
  return "Artist";
}

function editableFieldsForEntity(entity: EntityName): EditableField[] {
  if (entity === "events") {
    return [
      { key: "title", label: "Title", type: "text" },
      { key: "startAt", label: "Start at", type: "datetime" },
      { key: "endAt", label: "End at", type: "datetime" },
      { key: "isPublished", label: "Published", type: "checkbox" },
    ] as const;
  }
  if (entity === "venues") {
    return [
      { key: "name", label: "Name", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "country", label: "Country", type: "text" },
      { key: "isPublished", label: "Published", type: "checkbox" },
    ] as const;
  }
  return [
    { key: "name", label: "Name", type: "text" },
    { key: "isPublished", label: "Published", type: "checkbox" },
  ] as const;
}

function renderEditableField({ field, value, onChange }: { field: string; value: unknown; onChange: (value: unknown) => void }) {
  if (field === "isPublished") {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        Published
      </label>
    );
  }

  if (field === "startAt" || field === "endAt") {
    const iso = typeof value === "string" ? value : "";
    return (
      <input
        type="datetime-local"
        className="w-full rounded border px-2 py-1 text-xs"
        value={iso ? iso.slice(0, 16) : ""}
        onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)}
      />
    );
  }

  return <input className="w-full rounded border px-2 py-1 text-xs" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
}
