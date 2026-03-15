"use client";

export type ArtworkFormData = {
  title: string;
  slug: string | null;
  description: string | null;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  priceAmount: number | null;
  currency: string | null;
  condition?: string | null;
  conditionNotes?: string | null;
  provenance?: string | null;
  editionInfo?: string | null;
  frameIncluded?: boolean | null;
  shippingNotes?: string | null;
};

export function ArtworkEditForm({
  data,
  onChange,
}: {
  data: ArtworkFormData;
  onChange: (updated: ArtworkFormData) => void;
}) {
  function set<K extends keyof ArtworkFormData>(key: K, value: ArtworkFormData[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Title</span>
        <input
          id="title"
          className="w-full rounded border px-2 py-1 text-sm"
          value={data.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Slug</span>
        <input
          className="w-full rounded border px-2 py-1 text-sm"
          value={data.slug ?? ""}
          placeholder="auto-generated if blank"
          onChange={(e) => set("slug", e.target.value || null)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Description</span>
        <textarea
          id="description"
          className="w-full rounded border px-2 py-1 text-sm"
          rows={4}
          value={data.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Year</span>
          <input
            type="number"
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="e.g. 2023"
            value={data.year ?? ""}
            onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Medium</span>
          <input
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="e.g. Oil on Canvas"
            value={data.medium ?? ""}
            onChange={(e) => set("medium", e.target.value || null)}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Dimensions</span>
        <input
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. 60 × 80 cm"
          value={data.dimensions ?? ""}
          onChange={(e) => set("dimensions", e.target.value || null)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Price (e.g. 1200 = £1,200)</span>
          <input
            type="number"
            min={0}
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="Leave blank if not for sale"
            value={data.priceAmount ?? ""}
            onChange={(e) => set("priceAmount", e.target.value ? Number(e.target.value) : null)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Currency</span>
          <select
            className="w-full rounded border px-2 py-1 text-sm"
            value={data.currency ?? "GBP"}
            onChange={(e) => set("currency", e.target.value)}
          >
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
      </div>

      <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-medium">Sale details</summary>
        <div className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm">Condition</span>
            <select
              className="w-full rounded border px-2 py-1 text-sm"
              value={data.condition ?? ""}
              onChange={(e) => set("condition", e.target.value || null)}
            >
              <option value="">Select condition</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Condition notes</span>
            <textarea
              className="w-full rounded border px-2 py-1 text-sm"
              rows={2}
              maxLength={500}
              value={data.conditionNotes ?? ""}
              onChange={(e) => set("conditionNotes", e.target.value || null)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Provenance</span>
            <textarea
              className="w-full rounded border px-2 py-1 text-sm"
              rows={2}
              maxLength={1000}
              value={data.provenance ?? ""}
              onChange={(e) => set("provenance", e.target.value || null)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Edition info</span>
            <input
              className="w-full rounded border px-2 py-1 text-sm"
              maxLength={100}
              value={data.editionInfo ?? ""}
              onChange={(e) => set("editionInfo", e.target.value || null)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(data.frameIncluded)}
              onChange={(e) => set("frameIncluded", e.target.checked)}
            />
            Frame included
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Shipping notes</span>
            <textarea
              className="w-full rounded border px-2 py-1 text-sm"
              rows={2}
              maxLength={500}
              value={data.shippingNotes ?? ""}
              onChange={(e) => set("shippingNotes", e.target.value || null)}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
