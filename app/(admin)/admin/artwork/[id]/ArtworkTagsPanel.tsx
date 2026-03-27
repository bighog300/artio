"use client";

import { useMemo, useState } from "react";

type TagOption = {
  id: string;
  name: string;
  slug: string;
  category: string;
};

type Props = {
  artworkId: string;
  initialTags: TagOption[];
  allTags: TagOption[];
};

export function ArtworkTagsPanel({ artworkId, initialTags, allTags }: Props) {
  const [currentTags, setCurrentTags] = useState(initialTags);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTags = useMemo(
    () => allTags.filter((tag) => !currentTags.some((current) => current.id === tag.id)),
    [allTags, currentTags],
  );

  const groupedAvailableTags = useMemo(() => {
    return availableTags.reduce<Record<string, TagOption[]>>((acc, tag) => {
      if (!acc[tag.category]) acc[tag.category] = [];
      acc[tag.category].push(tag);
      return acc;
    }, {});
  }, [availableTags]);

  async function addTag() {
    if (!selectedTagId || pending) return;
    const toAdd = allTags.find((tag) => tag.id === selectedTagId);
    if (!toAdd) return;

    setPending(true);
    setError(null);
    setCurrentTags((prev) => [...prev, toAdd]);
    setSelectedTagId("");

    try {
      const response = await fetch(`/api/admin/artworks/${artworkId}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagId: toAdd.id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
        throw new Error(body.error?.message ?? body.message ?? "Failed to add tag");
      }
    } catch (err) {
      setCurrentTags((prev) => prev.filter((tag) => tag.id !== toAdd.id));
      setError(err instanceof Error ? err.message : "Failed to add tag");
    } finally {
      setPending(false);
    }
  }

  async function removeTag(tag: TagOption) {
    if (pending) return;
    setPending(true);
    setError(null);
    setCurrentTags((prev) => prev.filter((item) => item.id !== tag.id));

    try {
      const response = await fetch(`/api/admin/artworks/${artworkId}/tags/${tag.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
        throw new Error(body.error?.message ?? body.message ?? "Failed to remove tag");
      }
    } catch (err) {
      setCurrentTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setError(err instanceof Error ? err.message : "Failed to remove tag");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Artwork tags</h2>

      <div className="flex flex-wrap gap-2">
        {currentTags.length > 0 ? (
          currentTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="rounded-full border bg-muted px-2.5 py-1 text-xs"
              onClick={() => void removeTag(tag)}
              disabled={pending}
              title={`Remove ${tag.name}`}
            >
              {tag.name} <span aria-hidden="true">×</span>
            </button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No tags applied yet.</p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-sm">
          <span className="mb-1 block text-muted-foreground">Add tag</span>
          <select
            className="h-10 w-full rounded-md border px-3 text-sm"
            value={selectedTagId}
            onChange={(event) => setSelectedTagId(event.target.value)}
            disabled={pending || availableTags.length === 0}
          >
            <option value="">Select a tag</option>
            {Object.entries(groupedAvailableTags).map(([category, tags]) => (
              <optgroup key={category} label={category}>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name} ({tag.slug})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="h-10 rounded border px-3 text-sm"
          disabled={!selectedTagId || pending}
          onClick={() => void addTag()}
        >
          Add tag
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
