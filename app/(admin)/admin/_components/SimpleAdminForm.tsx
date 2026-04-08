"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  title: string;
  endpoint: string;
  method: "POST" | "PATCH";
  initial: Record<string, unknown>;
  fields: Array<{ name: string; label: string; type?: string }>;
  redirectPath: string;
};

export default function SimpleAdminForm({ title, endpoint, method, initial, fields, redirectPath }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>(initial);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.message || "Save failed");
      return;
    }
    router.push(redirectPath);
    router.refresh();
  }

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <form onSubmit={onSubmit} className="space-y-2 max-w-2xl">
        {fields.map((field) => (
          <label key={field.name} className="block">
            <span className="text-sm">{field.label}</span>
            <input
              type={field.type || "text"}
              value={String(form[field.name] ?? "")}
              onChange={(ev) => setForm((prev) => ({ ...prev, [field.name]: ev.target.value }))}
              className="border p-2 rounded w-full"
            />
          </label>
        ))}
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.isPublished)}
            onChange={(ev) => setForm((prev) => ({ ...prev, isPublished: ev.target.checked }))}
            className="mr-2"
          />
          Published
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="rounded border px-3 py-1">Save</button>
      </form>
    </main>
  );
}
