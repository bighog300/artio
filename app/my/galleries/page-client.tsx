"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CreateGalleryForm({ artworks }: { artworks: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/my/galleries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      setError(body?.error?.message ?? "Failed to create gallery");
      return;
    }

    if (selected.length) {
      await fetch(`/api/my/galleries/${body.id}/items`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: selected.map((id, index) => ({ entityId: id, sortOrder: index })) }),
      });
    }

    router.push(`/my/galleries/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded border p-4">
      <h2 className="text-base font-semibold">Create gallery draft</h2>
      <label className="block text-sm">Title<input className="mt-1 w-full rounded border p-2" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} /></label>
      <label className="block text-sm">Description<input className="mt-1 w-full rounded border p-2" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="space-y-2">
        <p className="text-sm font-medium">Select artworks</p>
        <div className="max-h-48 space-y-1 overflow-auto rounded border p-2">
          {artworks.map((art) => (
            <label key={art.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(art.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, art.id] : current.filter((id) => id !== art.id))} />
              <span>{art.title}</span>
            </label>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create draft gallery"}</Button>
    </form>
  );
}
