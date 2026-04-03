"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploader from "@/app/my/_components/ImageUploader";
import { enqueueToast } from "@/lib/toast";

const BASIC_FIELDS = ["name", "description", "websiteUrl", "instagramUrl", "featuredAssetId", "featuredImageUrl"] as const;
const LOCATION_FIELDS = ["addressLine1", "addressLine2", "city", "region", "postcode", "country"] as const;

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

type VenueFormState = {
  name: string;
  description: string;
  websiteUrl: string;
  instagramUrl: string;
  featuredAssetId: string | null;
  featuredImageUrl: string | null;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
};

export default function VenueSelfServeForm({
  venue,
  submissionStatus,
  fields = "basic",
}: {
  venue: VenueRecord;
  submissionStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | null;
  fields?: "basic" | "location";
}) {
  const router = useRouter();
  const [form, setForm] = useState<VenueFormState>({
    name: venue.name ?? "",
    description: venue.description ?? "",
    websiteUrl: venue.websiteUrl ?? "",
    instagramUrl: venue.instagramUrl ?? "",
    featuredAssetId: venue.featuredAssetId ?? null,
    featuredImageUrl: venue.featuredImageUrl ?? null,
    addressLine1: venue.addressLine1 ?? "",
    addressLine2: venue.addressLine2 ?? "",
    city: venue.city ?? "",
    region: venue.region ?? "",
    postcode: venue.postcode ?? "",
    country: venue.country ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const descriptionLength = form.description.trim().length;
  void submissionStatus;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const activeFields = fields === "basic" ? BASIC_FIELDS : LOCATION_FIELDS;
    const payload = Object.fromEntries(activeFields.map((key) => [key, form[key] ?? null]));

    const res = await fetch(`/api/my/venues/${venue.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message || "Failed to save venue");
      return;
    }

    enqueueToast({ title: "Venue saved", variant: "success" });
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

    enqueueToast({ title: "Featured image removed", variant: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-2xl">
      {(fields === "basic") && (
        <>
          <label className="block">
            <span className="text-sm">Name</span>
            <input className="border rounded p-2 w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">Description</span>
            <textarea className="border rounded p-2 w-full" maxLength={4000} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </label>
          {descriptionLength < 20 ? (
            <p className="text-xs text-muted-foreground">Minimum 20 characters ({descriptionLength}/20)</p>
          ) : (
            <p className="text-xs text-muted-foreground">{descriptionLength}/4000 characters</p>
          )}
          <label className="block">
            <span className="text-sm">Website</span>
            <input className="border rounded p-2 w-full" value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">Instagram</span>
            <input className="border rounded p-2 w-full" value={form.instagramUrl} onChange={(e) => setForm((p) => ({ ...p, instagramUrl: e.target.value }))} />
          </label>
          <ImageUploader
            label="Upload featured image"
            initialUrl={venue.featuredAsset?.url ?? venue.featuredImageUrl}
            onUploaded={({ assetId }) => setForm((p) => ({ ...p, featuredAssetId: assetId, featuredImageUrl: null }))}
            onRemove={removeFeaturedImage}
          />
        </>
      )}

      {(fields === "location") && (
        <>
          <label className="block">
            <span className="text-sm">Address line 1</span>
            <input className="border rounded p-2 w-full" value={form.addressLine1} onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">Address line 2</span>
            <input className="border rounded p-2 w-full" value={form.addressLine2} onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">City</span>
            <input className="border rounded p-2 w-full" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">Region</span>
            <input className="border rounded p-2 w-full" value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">Postcode</span>
            <input className="border rounded p-2 w-full" value={form.postcode} onChange={(e) => setForm((p) => ({ ...p, postcode: e.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm">Country</span>
            <input className="border rounded p-2 w-full" value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} />
          </label>
        </>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="rounded border px-3 py-1">Save venue</button>
    </form>
  );
}
