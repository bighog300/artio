"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageGalleryManager from "@/app/(admin)/admin/_components/ImageGalleryManager";

type Props = {
  title: string;
  endpoint: string;
  method: "POST" | "PATCH";
  initial: Record<string, unknown>;
  fields: Array<{ name: string; label: string; type?: string }>;
  redirectPath: string;
  uploadTargetType: "venue" | "artist";
  uploadTargetId: string;
  altRequired?: boolean;
};

export default function AdminEntityForm({
  title,
  endpoint,
  method,
  initial,
  fields,
  redirectPath,
  uploadTargetType,
  uploadTargetId,
  altRequired = false,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const res = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.error?.code === "publish_blocked") {
        const blockers: unknown[] = Array.isArray(body?.error?.details?.blockers) ? body.error.details.blockers : [];
        const nextFieldErrors = blockers.reduce<Record<string, string>>((acc, blocker) => {
          if (typeof blocker?.id === "string" && typeof blocker?.message === "string") {
            acc[blocker.id] = blocker.message;
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
            {fieldErrors[field.name] ? <p className="text-xs text-red-500 mt-0.5">{fieldErrors[field.name]}</p> : null}
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
      {uploadTargetId === "new" ? <p className="text-sm text-muted-foreground">Save first to add images.</p> : <ImageGalleryManager entityType={uploadTargetType} entityId={uploadTargetId} altRequired={altRequired} />}
    </main>
  );
}
