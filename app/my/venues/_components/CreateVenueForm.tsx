"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type CreateVenuePayload = {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  country?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  websiteUrl?: string;
  instagramUrl?: string;
};

type Props = { buttonLabel?: string; showTopSubmit?: boolean };

export function CreateVenueForm({ buttonLabel = "Create venue", showTopSubmit = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CreateVenuePayload>({ name: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venueLimitReached, setVenueLimitReached] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setVenueLimitReached(false);

    const res = await fetch("/api/my/venues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 400 && body?.error === "venue_limit_reached") {
        setVenueLimitReached(true);
        setIsSubmitting(false);
        return;
      }

      setError(body?.error?.message ?? "Failed to create venue");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    router.push(`/my/venues/${body.venue.id}?created=1`);
  }

  const submitButtonLabel = isSubmitting ? "Creating..." : buttonLabel;

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-3 rounded border p-4">
      {showTopSubmit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>{submitButtonLabel}</Button>
        </div>
      ) : null}
      <label className="block">
        <span className="text-sm">Venue name</span>
        <input
          className="w-full rounded border p-2"
          required
          minLength={2}
          maxLength={80}
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
      </label>
      <label className="block">
        <span className="text-sm">Address line 1 (optional)</span>
        <input className="w-full rounded border p-2" maxLength={120} value={form.addressLine1 ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, addressLine1: event.target.value || undefined }))} />
      </label>
      <label className="block">
        <span className="text-sm">Address line 2 (optional)</span>
        <input className="w-full rounded border p-2" maxLength={120} value={form.addressLine2 ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, addressLine2: event.target.value || undefined }))} />
      </label>
      <label className="block">
        <span className="text-sm">City (optional)</span>
        <input className="w-full rounded border p-2" maxLength={80} value={form.city ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value || undefined }))} />
      </label>
      <label className="block">
        <span className="text-sm">Region (optional)</span>
        <input className="w-full rounded border p-2" maxLength={80} value={form.region ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value || undefined }))} />
      </label>
      <label className="block">
        <span className="text-sm">Postcode (optional)</span>
        <input className="w-full rounded border p-2" maxLength={20} value={form.postcode ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, postcode: event.target.value || undefined }))} />
      </label>
      <label className="block">
        <span className="text-sm">Country (optional)</span>
        <input className="w-full rounded border p-2" maxLength={80} value={form.country ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value || undefined }))} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm">Latitude (optional)</span>
          <input className="w-full rounded border p-2" type="number" step="any" value={form.lat ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, lat: event.target.value === "" ? undefined : Number(event.target.value) }))} />
        </label>
        <label className="block">
          <span className="text-sm">Longitude (optional)</span>
          <input className="w-full rounded border p-2" type="number" step="any" value={form.lng ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, lng: event.target.value === "" ? undefined : Number(event.target.value) }))} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm">Website (optional)</span>
        <input className="w-full rounded border p-2" type="url" value={form.websiteUrl ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, websiteUrl: event.target.value || undefined }))} />
      </label>
      <label className="block">
        <span className="text-sm">Instagram URL (optional)</span>
        <input className="w-full rounded border p-2" type="url" value={form.instagramUrl ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, instagramUrl: event.target.value || undefined }))} />
      </label>
      {venueLimitReached ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>You can own up to 3 venues. Manage your existing venues instead.</p>
          <Button asChild variant="link" className="mt-1 h-auto p-0 text-amber-900">
            <Link href="/my/venues">Go to My venues</Link>
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={isSubmitting}>{submitButtonLabel}</Button>
    </form>
  );
}
