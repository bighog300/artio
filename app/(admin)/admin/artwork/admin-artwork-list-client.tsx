"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import AdminInlineRowActions, { buildEditableDraft, getNextEditingId } from "../_components/AdminInlineRowActions";

type ArtworkListItem = {
  id: string;
  title: string;
  slug: string | null;
  artistId: string;
  isPublished: boolean;
  updatedAt: string;
  deletedAt: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  artist?: { name: string };
  thumbnailUrl?: string | null;
};

const PAGE_SIZE = 20;
const editableFields = [
  { key: "title", label: "Title", type: "text" },
  { key: "isPublished", label: "Published", type: "checkbox" },
] as const;

const CURRENCIES = ["GBP", "USD", "EUR"] as const;

function normalizeItem(item: ArtworkListItem): ArtworkListItem {
  return {
    ...item,
    priceAmount: typeof item.priceAmount === "number" ? item.priceAmount : null,
    currency: typeof item.currency === "string" ? item.currency : null,
  };
}

function formatPrice(priceAmount: number | null | undefined, currency: string | null | undefined): string {
  if (priceAmount == null) return "—";
  // Keep in sync with DEFAULT_CURRENCY in lib/format.ts
  const resolvedCurrency = currency && CURRENCIES.includes(currency as (typeof CURRENCIES)[number]) ? currency : "GBP";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: resolvedCurrency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(priceAmount / 100);
}

export default function AdminArtworkListClient({ pricedCount: initialPricedCount }: { pricedCount: number }) {
  const [items, setItems] = useState<ArtworkListItem[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [onlyArchived, setOnlyArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedPermanently, setFailedPermanently] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCurrency, setBulkCurrency] = useState<(typeof CURRENCIES)[number]>("GBP");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkOpen, setIsBulkOpen] = useState(initialPricedCount < 200);
  const [pricedCount, setPricedCount] = useState(initialPricedCount);

  const maxPage = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const load = useCallback(async () => {
    if (failedPermanently) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (query.trim()) params.set("query", query.trim());
      if (showArchived) params.set("showArchived", "1");
      if (onlyArchived) params.set("onlyArchived", "1");
      const res = await fetch(`/api/admin/artwork?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        setFailedPermanently(true);
        setError("Authentication required. Please refresh the page.");
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load artworks");
      const incomingItems = Array.isArray(body.items) ? (body.items as ArtworkListItem[]).map(normalizeItem) : [];
      setItems(incomingItems);
      setTotal(body.total ?? 0);
      setSelectedIds((current) => current.filter((id) => incomingItems.some((item) => item.id === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load artworks");
    } finally {
      setBusy(false);
    }
  }, [failedPermanently, onlyArchived, page, query, showArchived]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  function startEdit(item: ArtworkListItem) {
    setEditingId((current) => getNextEditingId(current, item.id));
    setDrafts((current) => ({ ...current, [item.id]: buildEditableDraft(item, editableFields) }));
  }

  const progressPct = Math.min(100, Math.round((pricedCount / 200) * 100));
  const progressColor = pricedCount >= 200 ? "bg-emerald-500" : pricedCount >= 100 ? "bg-amber-500" : "bg-gray-400";
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const parsedBulkPrice = bulkPrice === "" ? null : Number.parseInt(bulkPrice, 10);
  const canApplyBulk = !bulkBusy && selectedIds.length > 0 && parsedBulkPrice != null && Number.isFinite(parsedBulkPrice) && parsedBulkPrice >= 0 && parsedBulkPrice <= 100_000;

  async function applyBulkPrice() {
    if (!canApplyBulk || parsedBulkPrice == null) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkMessage(null);

    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const newlyPricedCount = selectedItems.filter((item) => item.priceAmount == null).length;
    const nextAmount = Math.round(parsedBulkPrice * 100);

    try {
      const res = await fetch("/api/admin/artwork/bulk-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedIds.map((id) => ({ id, priceAmount: nextAmount, currency: bulkCurrency })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to update prices");

      setItems((current) => current.map((item) => (selectedIds.includes(item.id) ? { ...item, priceAmount: nextAmount, currency: bulkCurrency } : item)));
      setSelectedIds([]);
      setBulkMessage(`Updated ${selectedItems.length} artworks`);
      if (newlyPricedCount > 0) setPricedCount((current) => current + newlyPricedCount);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to update prices");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded border bg-background p-4">
        <div className="mb-2 text-sm font-medium">B4 Progress: {pricedCount} / 200 priced published artworks</div>
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div className={`h-full ${progressColor}`} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="rounded border bg-background p-4">
        <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setIsBulkOpen((current) => !current)}>
          <span>Bulk price panel</span>
          <span>{isBulkOpen ? "Hide" : "Show"}</span>
        </button>

        {isBulkOpen ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <select className="rounded border px-2 py-1 text-sm" value={bulkCurrency} onChange={(event) => setBulkCurrency(event.target.value as (typeof CURRENCIES)[number])}>
                {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
              <input
                type="number"
                min={0}
                max={100000}
                step={1}
                value={bulkPrice}
                onChange={(event) => setBulkPrice(event.target.value)}
                className="w-52 rounded border px-2 py-1 text-sm"
                placeholder="Price (e.g. 1200)"
              />
              <Button type="button" size="sm" onClick={() => void applyBulkPrice()} disabled={!canApplyBulk}>
                {bulkBusy ? "Applying..." : "Apply to selected"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(items.filter((item) => item.priceAmount == null).map((item) => item.id))}
                disabled={items.length === 0}
              >
                Select all unpriced
              </Button>
            </div>
            {bulkError ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{bulkError}</p> : null}
            {bulkMessage ? <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{bulkMessage}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage Artwork</h2>
        <p className="text-sm text-muted-foreground">Total: {total}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          className="rounded border px-2 py-1 text-sm"
          placeholder="Search artwork"
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => {
              setPage(1);
              setShowArchived(event.target.checked);
              if (!event.target.checked) setOnlyArchived(false);
            }}
          />
          Show archived
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyArchived}
            onChange={(event) => {
              setPage(1);
              setOnlyArchived(event.target.checked);
              if (event.target.checked) setShowArchived(true);
            }}
          />
          Archived only
        </label>
      </div>

      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item.id) : [])}
                  aria-label="Select all visible artworks"
                />
              </th>
              <th className="px-3 py-2 text-left">img</th>
              <th className="px-3 py-2 text-left">title</th>
              <th className="px-3 py-2 text-left">artist</th>
              <th className="px-3 py-2 text-left">price</th>
              <th className="px-3 py-2 text-left">status</th>
              <th className="px-3 py-2 text-left">updatedAt</th>
              <th className="px-3 py-2 text-left">archived</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={9}>{busy ? "Loading..." : "No records"}</td>
              </tr>
            ) : items.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={(event) => {
                        setSelectedIds((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)));
                      }}
                      aria-label={`Select ${item.title}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {typeof item.thumbnailUrl === "string" && item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        className="w-full rounded border px-2 py-1 text-xs"
                        value={typeof drafts[item.id]?.title === "string" ? String(drafts[item.id]?.title) : ""}
                        onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? {}), title: event.target.value } }))}
                      />
                    ) : item.title}
                  </td>
                  <td className="px-3 py-2">{item.artist?.name ?? item.artistId}</td>
                  <td className="px-3 py-2">{formatPrice(item.priceAmount, item.currency)}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(drafts[item.id]?.isPublished)}
                          onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? {}), isPublished: event.target.checked } }))}
                        />
                        Published
                      </label>
                    ) : item.isPublished ? "published" : "draft"}
                  </td>
                  <td className="px-3 py-2">{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{item.deletedAt ? <span className="rounded border px-2 py-0.5 text-xs">Archived</span> : null}</td>
                  <td className="px-3 py-2">
                    <AdminInlineRowActions
                      entityLabel="Artwork"
                      entityType="artwork"
                      id={item.id}
                      initial={item}
                      editable={editableFields}
                      patchUrl={`/api/admin/artwork/${item.id}`}
                      archiveUrl={`/api/admin/artwork/${item.id}/archive`}
                      restoreUrl={`/api/admin/artwork/${item.id}/restore`}
                      deleteUrl={`/api/admin/artwork/${item.id}`}
                      isArchived={Boolean(item.deletedAt)}
                      isEditing={isEditing}
                      onStartEdit={() => startEdit(item)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveSuccess={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</Button>
        <span className="text-sm">Page {page} / {maxPage}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))}>Next</Button>
      </div>
    </section>
  );
}
