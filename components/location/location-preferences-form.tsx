"use client";

import { type FormEvent, useState } from "react";
import { enqueueToast } from "@/lib/toast";

type LocationDraft = {
  locationLabel: string;
  lat: string;
  lng: string;
  radiusKm: string;
};

type GeocodeResult = {
  label: string;
  lat: number;
  lng: number;
};

export function LocationPreferencesForm({
  initial,
  saveButtonLabel,
  onSave,
  afterSave,
}: {
  initial: LocationDraft;
  saveButtonLabel: string;
  onSave: (payload: { locationLabel: string | null; lat: number | null; lng: number | null; radiusKm: number }) => Promise<boolean>;
  afterSave?: (form: LocationDraft) => void;
}) {
  const [form, setForm] = useState(initial);
  const [query, setQuery] = useState(initial.locationLabel);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function searchPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setStatus("Enter at least 3 characters to search.");
      return;
    }

    setIsSearching(true);
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
    setIsSearching(false);

    if (response.status === 501) {
      setResults([]);
      setStatus("Geocoding is not configured. Use Advanced coordinates below.");
      return;
    }

    if (!response.ok) {
      setResults([]);
      setStatus("Unable to search locations right now.");
      return;
    }

    const data = (await response.json()) as { results?: GeocodeResult[] };
    const nextResults = data.results ?? [];
    setResults(nextResults);
    if (nextResults.length === 0) setStatus("No places found.");
  }

  async function saveLocation() {
    const ok = await onSave({
      locationLabel: form.locationLabel || null,
      lat: form.lat === "" ? null : Number(form.lat),
      lng: form.lng === "" ? null : Number(form.lng),
      radiusKm: Number(form.radiusKm || "25"),
    });
    setStatus(ok ? "Location saved." : "Unable to save location.");
    enqueueToast({ title: ok ? "Location saved" : "Unable to save location", variant: ok ? "success" : "error" });
    if (ok && afterSave) afterSave(form);
  }

  return (
    <div className="space-y-3">
      <form className="space-y-2" onSubmit={searchPlace}>
        <label className="text-sm font-medium">Search for a place</label>
        <div className="flex gap-2">
          <input className="w-full rounded border p-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="City or postcode" />
          <button className="rounded border px-3 py-2 text-sm" type="submit">{isSearching ? "Searching…" : "Search"}</button>
        </div>
      </form>

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((result) => (
            <li key={`${result.label}-${result.lat}-${result.lng}`}>
              <button
                className="w-full rounded border p-2 text-left text-sm hover:bg-gray-50"
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, locationLabel: result.label, lat: String(result.lat), lng: String(result.lng) }));
                  setQuery(result.label);
                  setStatus("Selected place. Adjust radius and save when ready.");
                }}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Label
          <input className="mt-1 w-full rounded border p-2" value={form.locationLabel} onChange={(e) => setForm((prev) => ({ ...prev, locationLabel: e.target.value }))} />
        </label>
        <label className="text-sm">Radius (km)
          <input
            className="mt-1 w-full rounded border p-2"
            type="number"
            min={1}
            max={200}
            value={form.radiusKm}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (nextValue.trim() === "") {
                setForm((prev) => ({ ...prev, radiusKm: "25" }));
                return;
              }
              const parsed = Number(nextValue);
              if (Number.isNaN(parsed)) return;
              setForm((prev) => ({ ...prev, radiusKm: String(parsed) }));
            }}
          />
        </label>
      </div>

      <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced (manual latitude/longitude)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Latitude
            <input className="mt-1 w-full rounded border p-2" type="number" step="any" value={form.lat} onChange={(e) => setForm((prev) => ({ ...prev, lat: e.target.value }))} />
          </label>
          <label className="text-sm">Longitude
            <input className="mt-1 w-full rounded border p-2" type="number" step="any" value={form.lng} onChange={(e) => setForm((prev) => ({ ...prev, lng: e.target.value }))} />
          </label>
        </div>
      </details>

      <button className="rounded border px-3 py-1 text-sm" type="button" onClick={() => void saveLocation()}>{saveButtonLabel}</button>
      {status ? <p className="text-sm text-gray-600">{status}</p> : null}
    </div>
  );
}
