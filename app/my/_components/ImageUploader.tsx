"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type UploadResult = { assetId: string; url: string };
type Suggestion = { code: string; severity: "info" | "warning" | "error"; message: string };
type Metadata = { width: number; height: number; byteSize: number };
type CropPreset = "square" | "landscape" | "portrait" | "hero";
type ProcessUploadResult = {
  ok: boolean;
  asset: { id: string; url: string };
  validation: { metadata: Metadata | null };
  suggestions: Suggestion[];
};

export default function ImageUploader({
  label,
  onUploaded,
  initialUrl,
  onRemove,
}: {
  label: string;
  onUploaded: (result: UploadResult) => void;
  initialUrl?: string | null;
  onRemove?: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{ assetId: string; url: string; metadata: Metadata; suggestions: Suggestion[] } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<CropPreset>("landscape");

  async function onFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    setPreviewUrl(URL.createObjectURL(file));

    const formData = new FormData();
    formData.set("file", file);

    try {
      const res = await fetch("/api/assets/upload/process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Upload failed");
      }

      const data = (await res.json()) as ProcessUploadResult;
      if (!data.ok || !data.validation.metadata) {
        throw new Error("Upload metadata could not be read");
      }

      setPendingAsset({ assetId: data.asset.id, url: data.asset.url, metadata: data.validation.metadata, suggestions: data.suggestions ?? [] });
      setCropOpen(true);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      setPreviewUrl(initialUrl ?? null);
    } finally {
      setIsUploading(false);
    }
  }

  function buildCropFromPreset(metadata: Metadata, preset: CropPreset) {
    if (preset === "square") {
      const size = Math.min(metadata.width, metadata.height);
      return { x: Math.floor((metadata.width - size) / 2), y: Math.floor((metadata.height - size) / 2), width: size, height: size, preset };
    }
    if (preset === "portrait") {
      const targetRatio = 3 / 4;
      const width = Math.min(metadata.width, Math.floor(metadata.height * targetRatio));
      const height = Math.floor(width / targetRatio);
      return { x: Math.floor((metadata.width - width) / 2), y: Math.floor((metadata.height - height) / 2), width, height, preset };
    }
    if (preset === "hero") {
      const targetRatio = 16 / 9;
      const width = Math.min(metadata.width, Math.floor(metadata.height * targetRatio));
      const height = Math.floor(width / targetRatio);
      return { x: Math.floor((metadata.width - width) / 2), y: Math.floor((metadata.height - height) / 2), width, height, preset };
    }
    const targetRatio = 4 / 3;
    const width = Math.min(metadata.width, Math.floor(metadata.height * targetRatio));
    const height = Math.floor(width / targetRatio);
    return { x: Math.floor((metadata.width - width) / 2), y: Math.floor((metadata.height - height) / 2), width, height, preset };
  }

  async function finalizeCrop() {
    if (!pendingAsset) return;
    try {
      setError(null);
      const crop = buildCropFromPreset(pendingAsset.metadata, selectedPreset);
      const res = await fetch(`/api/assets/${pendingAsset.assetId}/crop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(crop),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Crop finalize failed");
      }
      const body = await res.json() as { asset: { id: string; url: string } };
      setPreviewUrl(body.asset.url);
      onUploaded({ assetId: body.asset.id, url: body.asset.url });
      setCropOpen(false);
      setPendingAsset(null);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Crop finalize failed");
    }
  }

  function removeImage() {
    if (!onRemove || !window.confirm("Remove current image?")) return;
    onRemove();
    setPreviewUrl(null);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
      {isUploading ? <p className="text-xs text-gray-600">Uploading...</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {previewUrl ? (
        <>
          <div className="relative h-32 w-32 overflow-hidden rounded border">
            <Image src={previewUrl} alt="Preview" fill sizes="128px" className="object-cover" />
          </div>
          {onRemove ? <button type="button" className="rounded border px-2 py-1 text-sm text-red-700" onClick={removeImage}>Remove image</button> : null}
        </>
      ) : null}
      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crop before save</DialogTitle>
            <DialogDescription>Choose a crop preset before finalizing this image asset.</DialogDescription>
          </DialogHeader>
          {pendingAsset ? (
            <div className="space-y-3 text-sm">
              <p>File size: {Math.round(pendingAsset.metadata.byteSize / 1024)} KB · Dimensions: {pendingAsset.metadata.width}×{pendingAsset.metadata.height}</p>
              <div className="flex flex-wrap gap-2">
                {([["square", "Square"], ["landscape", "Landscape / Card"], ["portrait", "Portrait"], ["hero", "Hero / Banner"]] as Array<[CropPreset, string]>).map(([preset, labelText]) => (
                  <button
                    key={preset}
                    type="button"
                    className={`rounded border px-2 py-1 ${selectedPreset === preset ? "border-black bg-black text-white" : ""}`}
                    onClick={() => setSelectedPreset(preset)}
                  >
                    {labelText}
                  </button>
                ))}
              </div>
              {pendingAsset.suggestions.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {pendingAsset.suggestions.map((suggestion) => <li key={`${suggestion.code}-${suggestion.message}`}>{suggestion.message}</li>)}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <button type="button" className="rounded border px-3 py-1.5" onClick={() => setCropOpen(false)}>Cancel</button>
                <button type="button" className="rounded bg-black px-3 py-1.5 text-white" onClick={() => void finalizeCrop()}>Finalize image</button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
