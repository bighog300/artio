"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = ["medium", "genre", "movement", "mood"] as const;
type Category = (typeof CATEGORIES)[number];

type TagRow = {
  id: string;
  name: string;
  slug: string;
  category: string;
  _count: { eventTags: number };
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function AdminTagsClient({ initialTags }: { initialTags: TagRow[] }) {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState<Category>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.name.localeCompare(b.name)), [tags]);

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            const response = await fetch("/api/admin/tags", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, slug, category }),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: { message?: string }; id?: string };
            if (!response.ok) throw new Error(body.error?.message ?? "Failed to create tag");
            const created = body as TagRow;
            setTags((prev) => [...prev, { ...created, _count: { eventTags: 0 } }]);
            setName("");
            setSlug("");
            setCategory("medium");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create tag");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Input
          value={name}
          onChange={(event) => {
            const nextName = event.target.value;
            setName(nextName);
            setSlug(slugify(nextName));
          }}
          placeholder="Tag name"
          required
        />
        <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="tag-slug" required />
        <select className="h-10 rounded-md border px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
          {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add tag"}</Button>
      </form>

      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Category</th>
              <th className="p-3">Event count</th>
              <th className="p-3">Delete</th>
            </tr>
          </thead>
          <tbody>
            {sortedTags.map((tag) => (
              <tr key={tag.id} className="border-t">
                <td className="p-3">{tag.name}</td>
                <td className="p-3">{tag.slug}</td>
                <td className="p-3">
                  <select
                    className="h-9 rounded-md border px-2 text-sm"
                    value={tag.category}
                    onChange={async (event) => {
                      const nextCategory = event.target.value as Category;
                      setTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, category: nextCategory } : item)));
                      const response = await fetch(`/api/admin/tags/${tag.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ category: nextCategory }),
                      });
                      if (!response.ok) {
                        setTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, category: tag.category } : item)));
                        setError("Failed to update category");
                      }
                    }}
                  >
                    {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </td>
                <td className="p-3">{tag._count.eventTags}</td>
                <td className="p-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={tag._count.eventTags > 0}
                    onClick={async () => {
                      const response = await fetch(`/api/admin/tags/${tag.id}`, { method: "DELETE" });
                      if (!response.ok) {
                        setError("Failed to delete tag");
                        return;
                      }
                      setTags((prev) => prev.filter((item) => item.id !== tag.id));
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
