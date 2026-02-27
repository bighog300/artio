"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploader from "@/app/my/_components/ImageUploader";
import { Button } from "@/components/ui/button";

type VenueRecord = {
  id: string;
  name: string;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postcode: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  featuredImageUrl: string | null;
  featuredAssetId: string | null;
  featuredAsset?: { url: string } | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  isPublished: boolean;
};

export default function VenueSelfServeForm({ venue, submissionStatus }: { venue: VenueRecord; submissionStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null }) {
  void submissionStatus;
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>({ ...venue });
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/my/venues/${venue.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message || "Failed to save venue");
      return;
    }

    router.refresh();
  }

  async function removeFeaturedImage() {
    setError(null);
    const payload = { featuredAssetId: null, featuredImageUrl: null };
    setForm((p) => ({ ...p, ...payload }));

    const res = await fetch(`/api/my/venues/${venue.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message || "Failed to remove featured image");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-2xl">
      <label className="block"><span className="text-sm">Name</span><input className="border rounded p-2 w-full" value={String(form.name ?? "")} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Description</span><textarea className="border rounded p-2 w-full" value={String(form.description ?? "")} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Address line 1</span><input className="border rounded p-2 w-full" value={String(form.addressLine1 ?? "")} onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Address line 2</span><input className="border rounded p-2 w-full" value={String(form.addressLine2 ?? "")} onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">City</span><input className="border rounded p-2 w-full" value={String(form.city ?? "")} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Region</span><input className="border rounded p-2 w-full" value={String(form.region ?? "")} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Postcode</span><input className="border rounded p-2 w-full" value={String(form.postcode ?? "")} onChange={(e) => setForm((p) => ({ ...p, postcode: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Country</span><input className="border rounded p-2 w-full" value={String(form.country ?? "")} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-sm">Latitude</span><input className="border rounded p-2 w-full" type="number" step="any" value={String(form.lat ?? "")} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value === "" ? null : Number(e.target.value) }))} /></label>
        <label className="block"><span className="text-sm">Longitude</span><input className="border rounded p-2 w-full" type="number" step="any" value={String(form.lng ?? "")} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value === "" ? null : Number(e.target.value) }))} /></label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-sm">Timezone (IANA)</span><input className="border rounded p-2 w-full" placeholder="Europe/London" value={String(form.timezone ?? "")} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))} /></label>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            disabled={form.lat == null || form.lng == null}
            onClick={async () => {
              setError(null);
              const res = await fetch(`/api/my/venues/${venue.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ autoDetectTimezone: true, lat: form.lat, lng: form.lng }),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body?.error?.message || "Failed to infer timezone");
                return;
              }
              const body = await res.json();
              setForm((p) => ({ ...p, timezone: body.timezone ?? "" }));
              router.refresh();
            }}
          >
            Auto-detect timezone
          </Button>
        </div>
      </div>
      <label className="block"><span className="text-sm">Website</span><input className="border rounded p-2 w-full" value={String(form.websiteUrl ?? "")} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Instagram</span><input className="border rounded p-2 w-full" value={String(form.instagramUrl ?? "")} onChange={(e) => setForm((p) => ({ ...p, instagramUrl: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Featured image URL (legacy)</span><input className="border rounded p-2 w-full" value={String(form.featuredImageUrl ?? "")} onChange={(e) => setForm((p) => ({ ...p, featuredImageUrl: e.target.value || null }))} /></label>
      <ImageUploader
        label="Upload featured image"
        initialUrl={venue.featuredAsset?.url ?? venue.featuredImageUrl}
        onUploaded={({ assetId }) => setForm((p) => ({ ...p, featuredAssetId: assetId, featuredImageUrl: null }))}
        onRemove={removeFeaturedImage}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="rounded border px-3 py-1">Save venue</button>
    </form>
  );
}
