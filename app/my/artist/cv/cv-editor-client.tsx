"use client";

import { useMemo, useState } from "react";
import type { CvEntryType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CvEntry = {
  id: string;
  entryType: CvEntryType;
  title: string;
  organisation: string | null;
  location: string | null;
  year: number;
  endYear: number | null;
  description: string | null;
  url: string | null;
  sortOrder: number;
};

type FormState = {
  entryType: CvEntryType;
  title: string;
  organisation: string;
  location: string;
  year: string;
  endYear: string;
  description: string;
  url: string;
  sortOrder: string;
};

const CV_TYPES: CvEntryType[] = [
  "EXHIBITION_SOLO",
  "EXHIBITION_GROUP",
  "RESIDENCY",
  "AWARD",
  "EDUCATION",
  "PUBLICATION",
  "OTHER",
];

const CV_TYPE_LABELS: Record<CvEntryType, string> = {
  EXHIBITION_SOLO: "Solo exhibitions",
  EXHIBITION_GROUP: "Group exhibitions",
  RESIDENCY: "Residencies",
  AWARD: "Awards & prizes",
  EDUCATION: "Education",
  PUBLICATION: "Publications",
  OTHER: "Other",
};

const maxYear = new Date().getUTCFullYear() + 5;

const makeInitialForm = (entryType: CvEntryType = "EXHIBITION_SOLO"): FormState => ({
  entryType,
  title: "",
  organisation: "",
  location: "",
  year: String(new Date().getUTCFullYear()),
  endYear: "",
  description: "",
  url: "",
  sortOrder: "0",
});

const entryToForm = (entry: CvEntry): FormState => ({
  entryType: entry.entryType,
  title: entry.title,
  organisation: entry.organisation ?? "",
  location: entry.location ?? "",
  year: String(entry.year),
  endYear: entry.endYear != null ? String(entry.endYear) : "",
  description: entry.description ?? "",
  url: entry.url ?? "",
  sortOrder: String(entry.sortOrder ?? 0),
});

function toPayload(form: FormState) {
  return {
    entryType: form.entryType,
    title: form.title.trim(),
    organisation: form.organisation.trim() || undefined,
    location: form.location.trim() || undefined,
    year: Number(form.year),
    endYear: form.endYear.trim() ? Number(form.endYear) : undefined,
    description: form.description.trim() || undefined,
    url: form.url.trim() || undefined,
    sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : 0,
  };
}

export default function CvEditorClient({ initialEntries }: { initialEntries: CvEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(makeInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(makeInitialForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groupedEntries = new Map<CvEntryType, CvEntry[]>();
    for (const type of CV_TYPES) groupedEntries.set(type, []);
    for (const entry of entries) {
      groupedEntries.get(entry.entryType)?.push(entry);
    }
    for (const type of CV_TYPES) {
      const row = groupedEntries.get(type) ?? [];
      row.sort((a, b) => b.year - a.year || a.sortOrder - b.sortOrder);
    }
    return groupedEntries;
  }, [entries]);

  async function onAddSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/my/artist/cv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toPayload(addForm)),
    });

    if (!res.ok) {
      setError("Could not create entry.");
      setBusy(false);
      return;
    }

    const created = (await res.json()) as CvEntry;
    setEntries((prev) => [...prev, created]);
    setShowAddForm(false);
    setAddForm(makeInitialForm(addForm.entryType));
    setBusy(false);
  }

  function startEdit(entry: CvEntry) {
    setEditingId(entry.id);
    setEditForm(entryToForm(entry));
  }

  async function onEditSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/my/artist/cv/${encodeURIComponent(editingId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toPayload(editForm)),
    });

    if (!res.ok) {
      setError("Could not update entry.");
      setBusy(false);
      return;
    }

    const updated = (await res.json()) as CvEntry;
    setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    setEditingId(null);
    setBusy(false);
  }

  async function onDelete(entry: CvEntry) {
    if (!confirm(`Delete “${entry.title}”? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/my/artist/cv/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete entry.");
      setBusy(false);
      return;
    }

    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    if (editingId === entry.id) setEditingId(null);
    setBusy(false);
  }

  return (
    <section className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!showAddForm ? (
        <Button onClick={() => setShowAddForm(true)} type="button">Add entry</Button>
      ) : (
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-3 text-sm font-medium">Add CV entry</p>
          <CvEntryForm
            value={addForm}
            onChange={setAddForm}
            onSubmit={onAddSubmit}
            onCancel={() => {
              setShowAddForm(false);
              setAddForm(makeInitialForm());
            }}
            busy={busy}
            submitLabel="Create entry"
          />
        </div>
      )}

      {CV_TYPES.map((type) => {
        const items = grouped.get(type) ?? [];
        return (
          <div className="space-y-2" key={type}>
            <h2 className="text-lg font-semibold">{CV_TYPE_LABELS[type]}</h2>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : null}
            {items.map((entry) => (
              <div className="rounded-lg border bg-card p-4" key={entry.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{entry.year}{entry.endYear ? ` – ${entry.endYear}` : ""} · {entry.title}</p>
                    <p className="text-sm text-muted-foreground">{entry.organisation ?? ""}{entry.organisation && entry.location ? ", " : ""}{entry.location ?? ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" type="button" onClick={() => startEdit(entry)}>Edit</Button>
                    <Button size="sm" variant="destructive" type="button" onClick={() => void onDelete(entry)} disabled={busy}>Delete</Button>
                  </div>
                </div>

                {editingId === entry.id ? (
                  <div className="mt-4 border-t pt-4">
                    <CvEntryForm
                      value={editForm}
                      onChange={setEditForm}
                      onSubmit={onEditSubmit}
                      onCancel={() => setEditingId(null)}
                      busy={busy}
                      submitLabel="Save changes"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function CvEntryForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  value: FormState;
  onChange: (next: FormState) => void;
  onSubmit: (ev: React.FormEvent) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Type</span>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={value.entryType}
            onChange={(ev) => onChange({ ...value, entryType: ev.target.value as CvEntryType })}
          >
            {CV_TYPES.map((type) => <option key={type} value={type}>{CV_TYPE_LABELS[type]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Title</span>
          <Input required value={value.title} onChange={(ev) => onChange({ ...value, title: ev.target.value })} />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>Organisation</span><Input value={value.organisation} onChange={(ev) => onChange({ ...value, organisation: ev.target.value })} /></label>
        <label className="space-y-1 text-sm"><span>Location</span><Input value={value.location} onChange={(ev) => onChange({ ...value, location: ev.target.value })} /></label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm"><span>Year</span><Input type="number" min={1900} max={maxYear} required value={value.year} onChange={(ev) => onChange({ ...value, year: ev.target.value })} /></label>
        <label className="space-y-1 text-sm"><span>End year</span><Input type="number" min={1900} max={maxYear} value={value.endYear} onChange={(ev) => onChange({ ...value, endYear: ev.target.value })} /></label>
        <label className="space-y-1 text-sm"><span>Sort order</span><Input type="number" value={value.sortOrder} onChange={(ev) => onChange({ ...value, sortOrder: ev.target.value })} /></label>
      </div>

      <label className="space-y-1 text-sm"><span>URL</span><Input value={value.url} onChange={(ev) => onChange({ ...value, url: ev.target.value })} /></label>
      <label className="space-y-1 text-sm"><span>Description</span><Textarea value={value.description} onChange={(ev) => onChange({ ...value, description: ev.target.value })} /></label>

      <div className="flex gap-2">
        <Button disabled={busy} type="submit">{submitLabel}</Button>
        <Button disabled={busy} type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
