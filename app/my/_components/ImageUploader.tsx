"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type UploadResult = { assetId: string; url: string };
type Suggestion = { code: string; severity: "info" | "warning" | "error"; message: string };
type Metadata = { width: number; height: number; byteSize: number };
type CropPreset = "square" | "landscape" | "portrait" | "hero";
type ProcessingSummary = {
  transformApplied: boolean;
  fallbackUsed: boolean;
  processingPartial: boolean;
  transformedVariants: number;
  totalVariants: number;
  diagnostics: string[];
  runtime: { provider: "sharp" | "none"; mode: "transform" | "passthrough"; reason: "ok" | "sharp_not_installed" | "sharp_load_failed" };
};
type ProcessUploadResult = {
  ok: boolean;
  asset: { id: string; url: string; processingStatus?: "UPLOADED" | "PROCESSING" | "READY" | "FAILED"; processingError?: string | null };
  validation: { metadata: Metadata | null };
  suggestions: Suggestion[];
  processing?: ProcessingSummary;
};

type CropState = {
  preset: CropPreset;
  zoom: number;
  centerX: number;
  centerY: number;
};

const PRESET_RATIO: Record<CropPreset, number> = {
  square: 1,
  landscape: 4 / 3,
  portrait: 3 / 4,
  hero: 16 / 9,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{ assetId: string; url: string; metadata: Metadata; suggestions: Suggestion[]; processing?: ProcessingSummary } | null>(null);
  const [assetStatus, setAssetStatus] = useState<{ assetId: string; processingStatus: "UPLOADED" | "PROCESSING" | "READY" | "FAILED"; processingError?: string | null } | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [cropState, setCropState] = useState<CropState>({ preset: "landscape", zoom: 1, centerX: 0.5, centerY: 0.5 });

  async function onFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    setStatusText("Uploading and processing image...");
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

      if (data.processing?.fallbackUsed) {
        setStatusText("Processing completed in fallback mode; optimization may be limited.");
      } else {
        setStatusText("Upload processed. Set crop and finalize.");
      }

      setPendingAsset({
        assetId: data.asset.id,
        url: data.asset.url,
        metadata: data.validation.metadata,
        suggestions: data.suggestions ?? [],
        processing: data.processing,
      });
      setAssetStatus({ assetId: data.asset.id, processingStatus: data.asset.processingStatus ?? "READY", processingError: null });
      setCropState((prev) => ({ ...prev, preset: "landscape", zoom: 1, centerX: 0.5, centerY: 0.5 }));
      setCropOpen(true);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      setStatusText("Upload failed.");
      setPreviewUrl(initialUrl ?? null);
    } finally {
      setIsUploading(false);
    }
  }

  const cropGeometry = useMemo(() => {
    if (!pendingAsset) return null;
    const metadata = pendingAsset.metadata;
    const ratio = PRESET_RATIO[cropState.preset];
    const zoom = clamp(cropState.zoom, 1, 4);

    const baseWidth = Math.min(metadata.width, metadata.height * ratio);
    const baseHeight = baseWidth / ratio;
    const width = Math.max(1, Math.floor(baseWidth / zoom));
    const height = Math.max(1, Math.floor(baseHeight / zoom));

    const cx = cropState.centerX * metadata.width;
    const cy = cropState.centerY * metadata.height;

    const x = Math.floor(clamp(cx - width / 2, 0, Math.max(0, metadata.width - width)));
    const y = Math.floor(clamp(cy - height / 2, 0, Math.max(0, metadata.height - height)));

    return {
      x,
      y,
      width,
      height,
      aspectRatio: ratio,
      focalPointX: clamp(cropState.centerX, 0, 1),
      focalPointY: clamp(cropState.centerY, 0, 1),
      zoom,
      preset: cropState.preset,
    };
  }, [cropState, pendingAsset]);

  async function finalizeCrop() {
    if (!pendingAsset || !cropGeometry) return;
    try {
      setError(null);
      setIsFinalizing(true);
      setStatusText("Finalizing crop and generating variants...");
      const res = await fetch(`/api/assets/${pendingAsset.assetId}/crop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cropGeometry),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Crop finalize failed");
      }
      const body = await res.json() as { asset: { id: string; url: string; processingStatus: "UPLOADED" | "PROCESSING" | "READY" | "FAILED"; processingError?: string | null } };
      setPreviewUrl(body.asset.url);
      onUploaded({ assetId: body.asset.id, url: body.asset.url });
      setAssetStatus({ assetId: body.asset.id, processingStatus: body.asset.processingStatus, processingError: body.asset.processingError ?? null });
      setStatusText(body.asset.processingStatus === "READY" ? "Image ready." : `Image status: ${body.asset.processingStatus}`);
      setCropOpen(false);
      setPendingAsset(null);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Crop finalize failed");
      setStatusText("Crop finalization failed.");
    } finally {
      setIsFinalizing(false);
    }
  }

  function removeImage() {
    if (!onRemove || !window.confirm("Remove current image?")) return;
    onRemove();
    setPreviewUrl(null);
    setAssetStatus(null);
    setStatusText(null);
  }

  async function refreshProcessingStatus() {
    if (!assetStatus?.assetId) return;
    setIsRefreshingStatus(true);
    try {
      const res = await fetch(`/api/assets/${assetStatus.assetId}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json() as {
        asset?: { id: string; processingStatus: "UPLOADED" | "PROCESSING" | "READY" | "FAILED"; processingError?: string | null };
        image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean };
      };
      if (!body.asset) return;
      setAssetStatus({
        assetId: body.asset.id,
        processingStatus: body.asset.processingStatus,
        processingError: body.asset.processingError ?? null,
      });
      if (body.image?.url) {
        setPreviewUrl(body.image.url);
      }
      if (body.asset.processingStatus === "READY") {
        setStatusText("Image ready.");
      } else if (body.asset.processingStatus === "FAILED") {
        setStatusText("Image processing failed.");
      } else {
        setStatusText("Image is still processing.");
      }
    } finally {
      setIsRefreshingStatus(false);
    }
  }

  const processingDiagnostics = pendingAsset?.processing?.diagnostics ?? [];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
      {isUploading ? <p className="text-xs text-gray-600">Uploading...</p> : null}
      {statusText ? <p className="text-xs text-muted-foreground">{statusText}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {previewUrl ? (
        <>
          <div className="relative h-32 w-32 overflow-hidden rounded border">
            <Image src={previewUrl} alt="Preview" fill sizes="128px" className="object-cover" />
          </div>
          {onRemove ? <button type="button" className="rounded border px-2 py-1 text-sm text-red-700" onClick={removeImage}>Remove image</button> : null}
          {assetStatus?.processingStatus === "PROCESSING" || assetStatus?.processingStatus === "UPLOADED" ? (
            <button type="button" className="ml-2 rounded border px-2 py-1 text-sm" onClick={() => void refreshProcessingStatus()} disabled={isRefreshingStatus}>
              {isRefreshingStatus ? "Refreshing..." : "Refresh image status"}
            </button>
          ) : null}
        </>
      ) : null}
      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Crop before save</DialogTitle>
            <DialogDescription>Position the crop region and finalize this image asset.</DialogDescription>
          </DialogHeader>
          {pendingAsset && cropGeometry ? (
            <div className="space-y-3 text-sm">
              <p>File size: {Math.round(pendingAsset.metadata.byteSize / 1024)} KB · Dimensions: {pendingAsset.metadata.width}×{pendingAsset.metadata.height}</p>
              {pendingAsset.processing?.fallbackUsed ? (
                <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  Transform runtime is unavailable ({pendingAsset.processing.runtime.reason}). Variants may be copied from the master image.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {([ ["square", "Square"], ["landscape", "Landscape / Card"], ["portrait", "Portrait"], ["hero", "Hero / Banner"] ] as Array<[CropPreset, string]>).map(([preset, labelText]) => (
                  <button
                    key={preset}
                    type="button"
                    className={`rounded border px-2 py-1 ${cropState.preset === preset ? "border-black bg-black text-white" : ""}`}
                    onClick={() => setCropState((prev) => ({ ...prev, preset }))}
                  >
                    {labelText}
                  </button>
                ))}
              </div>

              <div className="space-y-2 rounded border p-2">
                <div className="relative mx-auto w-full max-w-md overflow-hidden rounded border bg-neutral-100" style={{ aspectRatio: PRESET_RATIO[cropState.preset] }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingAsset.url}
                    alt="Crop preview"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: `${cropGeometry.focalPointX * 100}% ${cropGeometry.focalPointY * 100}%` }}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="text-xs">Zoom
                    <input type="range" min={1} max={4} step={0.05} value={cropState.zoom} onChange={(event) => setCropState((prev) => ({ ...prev, zoom: Number(event.target.value) }))} className="w-full" />
                  </label>
                  <label className="text-xs">Horizontal framing
                    <input type="range" min={0} max={1} step={0.01} value={cropState.centerX} onChange={(event) => setCropState((prev) => ({ ...prev, centerX: Number(event.target.value) }))} className="w-full" />
                  </label>
                  <label className="text-xs">Vertical framing
                    <input type="range" min={0} max={1} step={0.01} value={cropState.centerY} onChange={(event) => setCropState((prev) => ({ ...prev, centerY: Number(event.target.value) }))} className="w-full" />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">Crop region: x={cropGeometry.x}, y={cropGeometry.y}, w={cropGeometry.width}, h={cropGeometry.height}</p>
              </div>

              {pendingAsset.suggestions.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {pendingAsset.suggestions.map((suggestion) => <li key={`${suggestion.code}-${suggestion.message}`}>{suggestion.message}</li>)}
                </ul>
              ) : null}
              {processingDiagnostics.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {processingDiagnostics.map((entry) => <li key={entry}>{entry}</li>)}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <button type="button" className="rounded border px-3 py-1.5" onClick={() => setCropOpen(false)}>Cancel</button>
                <button type="button" className="rounded bg-black px-3 py-1.5 text-white" onClick={() => void finalizeCrop()} disabled={isFinalizing}>{isFinalizing ? "Finalizing..." : "Finalize image"}</button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
