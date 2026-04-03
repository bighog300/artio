"use client";

import { FormEvent, useEffect, useState } from "react";
import { enqueueToast } from "@/lib/toast";

type PromoCode = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
};

function getErrorMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body && "error" in body) {
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return fallback;
}

export function PromoCodesSection({ eventId }: { eventId: string }) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    code: "",
    discountType: "PERCENT" as "PERCENT" | "FIXED",
    value: "",
    maxUses: "",
    expiresAt: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadCodes() {
      setLoading(true);
      try {
        const res = await fetch(`/api/my/events/${eventId}/promo-codes`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCodes([]);
          return;
        }
        setCodes(Array.isArray(body?.promoCodes) ? body.promoCodes : []);
      } finally {
        setLoading(false);
      }
    }

    void loadCodes();
  }, [eventId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        value: Number(form.value),
        maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      const res = await fetch(`/api/my/events/${eventId}/promo-codes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          setFormError("A promo code with that name already exists for this event.");
          return;
        }
        setFormError(getErrorMessage(body, "Failed to create promo code."));
        return;
      }
      setCodes((prev) => [body as PromoCode, ...prev]);
      setForm({ code: "", discountType: "PERCENT", value: "", maxUses: "", expiresAt: "" });
      setFormError(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePromoCode(code: PromoCode) {
    const res = await fetch(`/api/my/events/${eventId}/promo-codes/${code.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !code.isActive }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      enqueueToast({ title: getErrorMessage(body, "Failed to update promo code."), variant: "error" });
      return;
    }
    setCodes((prev) => prev.map((item) => (item.id === code.id ? (body as PromoCode) : item)));
    enqueueToast({ title: `Promo code ${code.isActive ? "deactivated" : "activated"}.`, variant: "success" });
  }

  async function deletePromoCode(code: PromoCode) {
    const res = await fetch(`/api/my/events/${eventId}/promo-codes/${code.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      enqueueToast({ title: getErrorMessage(body, "Failed to delete promo code."), variant: "error" });
      return;
    }
    setCodes((prev) => prev.filter((item) => item.id !== code.id));
    enqueueToast({ title: "Promo code deleted.", variant: "success" });
  }

  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-muted-foreground">Loading promo codes…</p> : null}

      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span>Code</span>
          <input
            className="w-full rounded border p-2"
            type="text"
            placeholder="e.g. SUMMER20"
            required
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span>Discount type</span>
          <select
            className="w-full rounded border p-2"
            value={form.discountType}
            onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as "PERCENT" | "FIXED" }))}
          >
            <option value="PERCENT">Percentage off</option>
            <option value="FIXED">Fixed amount off</option>
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span>{form.discountType === "PERCENT" ? "Discount %" : "Discount (£)"}</span>
          <input
            className="w-full rounded border p-2"
            type="number"
            min={1}
            required
            value={form.value}
            onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span>Max uses (optional)</span>
          <input
            className="w-full rounded border p-2"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={form.maxUses}
            onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span>Expires at (optional)</span>
          <input
            className="w-full rounded border p-2"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
          />
        </label>

        <div className="md:col-span-2">
          <button className="rounded border px-3 py-1 text-sm" disabled={submitting}>
            {submitting ? "Adding…" : "Add promo code"}
          </button>
        </div>
      </form>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      {!loading && codes.length === 0 ? <p className="text-sm text-muted-foreground">No promo codes yet. Add one above.</p> : null}

      {!loading && codes.length > 0 ? (
        <ul className="space-y-2">
          {codes.map((code) => (
            <li key={code.id} className="space-y-2 rounded border p-3 text-sm md:flex md:items-center md:justify-between md:space-y-0">
              <div className="space-y-1">
                <div className="font-mono font-bold">{code.code}</div>
                <div className="text-muted-foreground">
                  {code.discountType === "PERCENT" ? `${code.value}%` : `£${(code.value / 100).toFixed(2)} off`}
                  {" · "}
                  {code.usedCount}/{code.maxUses == null ? "∞" : code.maxUses}
                  {" · "}
                  {code.expiresAt ? new Date(code.expiresAt).toLocaleString() : "No expiry"}
                </div>
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${code.isActive ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                  {code.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded border px-2 py-1 text-sm" type="button" onClick={() => void togglePromoCode(code)}>
                  {code.isActive ? "Deactivate" : "Activate"}
                </button>
                {code.usedCount === 0 ? (
                  <button className="rounded border px-2 py-1 text-sm text-destructive" type="button" onClick={() => void deletePromoCode(code)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
