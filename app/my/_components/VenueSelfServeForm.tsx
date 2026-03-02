"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploader from "@/app/my/_components/ImageUploader";

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
  isPublished: boolean;
};

export default function VenueSelfServeForm({ venue, submissionStatus }: { venue: VenueRecord; submissionStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | null }) {
  void submissionStatus;
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>({ ...venue });
  const [error, setError] = useState<string | null>(null);
  const descriptionLength = String(form.description ?? "").trim().length;

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
      <p className="text-xs text-muted-foreground">Minimum 20 characters ({descriptionLength}/20)</p>
      <label className="block"><span className="text-sm">Address line 1</span><input className="border rounded p-2 w-full" value={String(form.addressLine1 ?? "")} onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Address line 2</span><input className="border rounded p-2 w-full" value={String(form.addressLine2 ?? "")} onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">City</span><input className="border rounded p-2 w-full" value={String(form.city ?? "")} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Region</span><input className="border rounded p-2 w-full" value={String(form.region ?? "")} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Postcode</span><input className="border rounded p-2 w-full" value={String(form.postcode ?? "")} onChange={(e) => setForm((p) => ({ ...p, postcode: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Country</span><input className="border rounded p-2 w-full" value={String(form.country ?? "")} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Website</span><input className="border rounded p-2 w-full" value={String(form.websiteUrl ?? "")} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} /></label>
      <label className="block"><span className="text-sm">Instagram</span><input className="border rounded p-2 w-full" value={String(form.instagramUrl ?? "")} onChange={(e) => setForm((p) => ({ ...p, instagramUrl: e.target.value }))} /></label>
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
