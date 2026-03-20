"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ImageGalleryManager from "@/app/(admin)/admin/_components/ImageGalleryManager";

type Props = {
  title: string;
  endpoint: string;
  method: "POST" | "PATCH";
  eventId?: string;
  altRequired?: boolean;
  initial: {
    title?: string;
    slug?: string;
    description?: string | null;
    timezone?: string;
    startAt?: string;
    endAt?: string;
    venueId?: string | null;
    tagSlugs?: string[];
    artistSlugs?: string[];
    isPublished?: boolean;
  };
};

export default function EventAdminForm({ title, endpoint, method, eventId, initial, altRequired = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ ...initial });
  const [tagSlugsText, setTagSlugsText] = useState((initial.tagSlugs || []).join(","));
  const [artistSlugsText, setArtistSlugsText] = useState((initial.artistSlugs || []).join(","));
  const [venueOptions, setVenueOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/venues?status=PUBLISHED&page=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: Array<{ id: string; name: string }> } | null) => {
        if (data?.items) setVenueOptions(data.items);
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = {
      ...form,
      tagSlugs: tagSlugsText.split(",").map((x) => x.trim()).filter(Boolean),
      artistSlugs: artistSlugsText.split(",").map((x) => x.trim()).filter(Boolean),
    };

    const res = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.error?.code === "publish_blocked") {
        const blockers: unknown[] = Array.isArray(body?.error?.details?.blockers) ? body.error.details.blockers : [];
        const nextFieldErrors = blockers.reduce<Record<string, string>>((acc, blocker) => {
          if (
            blocker !== null &&
            typeof blocker === "object" &&
            "id" in blocker &&
            "message" in blocker &&
            typeof (blocker as Record<string, unknown>).id === "string" &&
            typeof (blocker as Record<string, unknown>).message === "string"
          ) {
            acc[(blocker as Record<string, unknown>).id as string] =
              (blocker as Record<string, unknown>).message as string;
          }
          return acc;
        }, {});
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
          return;
        }
      }
      setError(body?.message || body?.error?.message || "Save failed");
      return;
    }
    router.push("/admin/events");
    router.refresh();
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <form onSubmit={onSubmit} className="space-y-2 max-w-2xl">
        {[
          ["title", "Title"],
          ["slug", "Slug"],
          ["timezone", "Timezone"],
          ["startAt", "Start (ISO 8601)", "datetime-local"],
          ["endAt", "End (ISO 8601)", "datetime-local"],
        ].map(([key, label, type]) => (
          <label key={key} className="block">
            <span className="text-sm">{label}</span>
            <input className="border p-2 rounded w-full" type={type || "text"} value={String(form[key as keyof typeof form] ?? "")} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value || null }))} />
            {fieldErrors[key] ? <p className="text-xs text-red-500 mt-0.5">{fieldErrors[key]}</p> : null}
          </label>
        ))}
        <label className="block">
          <span className="text-sm">Venue</span>
          <select
            className="border p-2 rounded w-full text-sm"
            value={String(form.venueId ?? "")}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                venueId: e.target.value || null,
              }))
            }
          >
            <option value="">— No venue —</option>
            {venueOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            {form.venueId &&
            !venueOptions.some((v) => v.id === form.venueId) ? (
              <option value={String(form.venueId)}>
                {String(form.venueId)} (current)
              </option>
            ) : null}
          </select>
          {fieldErrors.venue ? (
            <p className="text-xs text-red-500 mt-0.5">{fieldErrors.venue}</p>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm">Description</span>
          <textarea className="border p-2 rounded w-full" value={String(form.description ?? "")} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value || null }))} />
        </label>
        <label className="block">
          <span className="text-sm">Tag slugs (comma-separated)</span>
          <input className="border p-2 rounded w-full" value={tagSlugsText} onChange={(e) => setTagSlugsText(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm">Artist slugs (comma-separated)</span>
          <input className="border p-2 rounded w-full" value={artistSlugsText} onChange={(e) => setArtistSlugsText(e.target.value)} />
        </label>
        {eventId ? (
          <label className="block text-sm"><input type="checkbox" className="mr-2" checked={Boolean(form.isPublished)} onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))} />Published</label>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="rounded border px-3 py-1">Save</button>
      </form>
      {eventId ? <ImageGalleryManager entityType="event" entityId={eventId} altRequired={altRequired} /> : <p className="text-sm text-muted-foreground">Save this event first to add images.</p>}
    </main>
  );
}
