"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ArtworkAdminInitial = {
  title: string;
  slug: string | null;
  description: string | null;
  medium: string | null;
  year: number | null;
  dimensions: string | null;
  priceAmountMajor: number | null;
  currency: string | null;
  isPublished: boolean;
  artistId: string;
};

export default function ArtworkAdminForm({ artworkId, initial }: { artworkId: string; initial: ArtworkAdminInitial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const res = await fetch(`/api/admin/artwork/${artworkId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        slug: form.slug?.trim() ? form.slug.trim() : null,
        description: form.description?.trim() ? form.description.trim() : null,
        medium: form.medium?.trim() ? form.medium.trim() : null,
        year: form.year,
        dimensions: form.dimensions?.trim() ? form.dimensions.trim() : null,
        priceAmount: form.priceAmountMajor != null ? Math.round(form.priceAmountMajor * 100) : null,
        currency: form.currency?.trim() ? form.currency.trim() : null,
        artistId: form.artistId.trim() ? form.artistId.trim() : null,
        isPublished: form.isPublished,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message ?? body?.message ?? "Save failed");
      return;
    }

    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Edit Artwork</h2>
      <form onSubmit={onSubmit} className="space-y-3 max-w-2xl">
        <label className="block">
          <span className="text-sm">Title</span>
          <input className="w-full rounded border p-2" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm">Slug</span>
          <input className="w-full rounded border p-2" value={form.slug ?? ""} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm">Description</span>
          <textarea className="w-full rounded border p-2" rows={4} value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm">Medium</span>
          <input className="w-full rounded border p-2" value={form.medium ?? ""} onChange={(event) => setForm((current) => ({ ...current, medium: event.target.value }))} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">Year</span>
            <input
              type="number"
              className="w-full rounded border p-2"
              value={form.year ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, year: event.target.value === "" ? null : Number(event.target.value) }))}
            />
          </label>
          <label className="block">
            <span className="text-sm">Dimensions</span>
            <input className="w-full rounded border p-2" value={form.dimensions ?? ""} onChange={(event) => setForm((current) => ({ ...current, dimensions: event.target.value }))} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">Price (whole units, e.g. 1200 = £12.00)</span>
            <input
              type="number"
              min={0}
              className="w-full rounded border p-2"
              value={form.priceAmountMajor ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, priceAmountMajor: event.target.value === "" ? null : Number(event.target.value) }))}
            />
          </label>
          <label className="block">
            <span className="text-sm">Currency</span>
            <select className="w-full rounded border p-2" value={form.currency ?? "GBP"} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}>
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm">Artist ID</span>
          <input className="w-full rounded border p-2" value={form.artistId} onChange={(event) => setForm((current) => ({ ...current, artistId: event.target.value }))} />
        </label>
        <label className="block text-sm">
          <input type="checkbox" className="mr-2" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} />
          Published
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="rounded border px-3 py-1">Save</button>
      </form>
    </section>
  );
}
