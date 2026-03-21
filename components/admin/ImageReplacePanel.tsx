"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  endpoint: string;
  label?: string;
  currentImageUrl?: string | null;
};

export function ImageReplacePanel({ endpoint, label = "entity", currentImageUrl }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imageUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importImage() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: url.trim() }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: { message?: string };
      };

      if (!res.ok) {
        setError(data.error?.message ?? "Import failed — check the URL is a direct image link.");
        return;
      }

      setResult({ imageUrl: data.url ?? "" });
      setUrl("");
    } catch {
      setError("Import failed — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Import image from URL</h2>
        <p className="text-sm text-muted-foreground">
          Paste a direct image URL to fetch, upload to storage, and set as
          the featured {label} image.
        </p>
      </div>

      {currentImageUrl && !result ? (
        <div className="flex items-center gap-3">
          <img
            src={currentImageUrl}
            alt="Current featured image"
            className="h-16 w-16 rounded object-cover border"
          />
          <p className="text-xs text-muted-foreground">Current featured image</p>
        </div>
      ) : null}

      {result ? (
        <div className="flex items-center gap-3">
          <img
            src={result.imageUrl}
            alt="Newly imported image"
            className="h-16 w-16 rounded object-cover border"
          />
          <p className="text-xs text-emerald-600">
            Image imported successfully.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          type="url"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          placeholder="https://example.com/image.jpg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter") void importImage();
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || !url.trim()}
          onClick={() => void importImage()}
        >
          {loading ? "Importing…" : "Import"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </section>
  );
}
