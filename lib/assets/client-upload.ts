"use client";

type ProcessingStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
type CropPreset = "square" | "landscape" | "portrait" | "hero";

type ProcessResponse = {
  ok: boolean;
  asset: { id: string; url: string; processingStatus?: ProcessingStatus; processingError?: string | null };
  validation?: { metadata?: { width: number; height: number } | null };
};

type CropResponse = {
  ok: boolean;
  asset: { id: string; url: string; processingStatus: ProcessingStatus; processingError?: string | null };
};

export async function uploadImageAssetWithAutoFinalize(
  file: File,
  options?: {
    alt?: string | null;
    preset?: CropPreset;
    onStatusChange?: (status: "uploading" | "processing" | "ready" | "failed") => void;
  },
) {
  options?.onStatusChange?.("uploading");
  const formData = new FormData();
  formData.set("file", file);
  if (options?.alt) formData.set("alt", options.alt);

  const processRes = await fetch("/api/assets/upload/process", { method: "POST", body: formData });
  const processBody = await processRes.json().catch(() => ({})) as Partial<ProcessResponse> & { error?: { message?: string } };
  if (!processRes.ok || !processBody.ok || !processBody.asset?.id) {
    options?.onStatusChange?.("failed");
    throw new Error(processBody?.error?.message ?? "Upload failed");
  }

  const width = Math.max(1, processBody.validation?.metadata?.width ?? 1);
  const height = Math.max(1, processBody.validation?.metadata?.height ?? 1);
  options?.onStatusChange?.("processing");

  const cropRes = await fetch(`/api/assets/${processBody.asset.id}/crop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      x: 0,
      y: 0,
      width,
      height,
      aspectRatio: width / height,
      focalPointX: 0.5,
      focalPointY: 0.5,
      zoom: 1,
      preset: options?.preset ?? "landscape",
    }),
  });
  const cropBody = await cropRes.json().catch(() => ({})) as Partial<CropResponse> & { error?: { message?: string } };
  if (!cropRes.ok || !cropBody.ok || !cropBody.asset?.id) {
    options?.onStatusChange?.("failed");
    throw new Error(cropBody?.error?.message ?? "Finalize failed");
  }

  if (cropBody.asset.processingStatus === "FAILED") {
    options?.onStatusChange?.("failed");
    throw new Error(cropBody.asset.processingError ?? "Asset processing failed");
  }

  options?.onStatusChange?.("ready");
  return {
    assetId: cropBody.asset.id,
    url: cropBody.asset.url,
    processingStatus: cropBody.asset.processingStatus,
    processingError: cropBody.asset.processingError ?? null,
  };
}
