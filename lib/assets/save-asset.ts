
import type { PrismaClient } from "@prisma/client";
import { logAssetProcessingFailure, logAssetProcessingStatus, logAssetTransformDecision, logAssetTransformRuntime } from "@/lib/assets/diagnostics";
import { generateImageVariants } from "@/lib/assets/generate-variants";
import { processImage } from "@/lib/assets/process-image";
import { saveAssetBinary } from "@/lib/assets/storage";
import { getImageTransformRuntimeStatus } from "@/lib/assets/transform-runtime";
import type { AssetCrop } from "@/lib/assets/types";
import type { put } from "@vercel/blob";

export async function saveImageAssetPipeline(params: {
  dbClient: PrismaClient;
  ownerUserId?: string | null;
  fileName?: string | null;
  sourceMimeType: string;
  sourceBytes: Uint8Array;
  altText?: string | null;
  crop?: AssetCrop | null;
  kind?: "IMAGE";
  uploadToBlob?: typeof put;
}) {
  const {
    dbClient,
    ownerUserId,
    fileName,
    sourceMimeType,
    sourceBytes,
    altText = null,
    crop = null,
    kind = "IMAGE",
    uploadToBlob,
  } = params;

  const originalStored = await saveAssetBinary({
    ownerUserId,
    kind: "original",
    bytes: sourceBytes,
    mimeType: sourceMimeType,
    uploadToBlob,
  });

  const baseAsset = await dbClient.asset.create({
    data: {
      ownerUserId: ownerUserId ?? null,
      kind,
      sourceType: "UPLOAD",
      originalFilename: fileName ?? null,
      mimeType: sourceMimeType,
      byteSize: sourceBytes.byteLength,
      storageKey: originalStored.storageKey,
      url: originalStored.url,
      originalUrl: originalStored.url,
      filename: fileName ?? null,
      mime: sourceMimeType,
      sizeBytes: sourceBytes.byteLength,
      altText,
      alt: altText,
      cropJson: crop ?? undefined,
      processingStatus: "PROCESSING",
    },
  });
  logAssetProcessingStatus({ assetId: baseAsset.id, status: "PROCESSING", detail: "initial_processing_started" });

  try {
    const runtimeStatus = await getImageTransformRuntimeStatus();
    logAssetTransformRuntime(runtimeStatus);

    const processed = await processImage({ bytes: sourceBytes, mimeType: sourceMimeType });
    const masterStored = await saveAssetBinary({
      ownerUserId,
      kind: "master",
      bytes: processed.bytes,
      mimeType: processed.metadata.mimeType,
      uploadToBlob,
    });

    const variants = await generateImageVariants({ master: processed, crop });
    const transformedVariants = variants.filter((variant) => variant.transformed).length;
    logAssetTransformDecision({
      assetId: baseAsset.id,
      optimizationSkipped: !processed.optimized,
      fallbackUsed: processed.fallbackUsed || transformedVariants !== variants.length,
      transformedVariants,
      totalVariants: variants.length,
      diagnostics: processed.diagnostics,
    });

    const persistedVariants = await Promise.all(variants.map(async (variant) => {
      const saved = await saveAssetBinary({
        ownerUserId,
        kind: "variant",
        variantName: variant.name,
        bytes: variant.bytes,
        mimeType: variant.metadata.mimeType,
        uploadToBlob,
      });
      return dbClient.assetVariant.create({
        data: {
          assetId: baseAsset.id,
          variantName: variant.name,
          mimeType: variant.metadata.mimeType,
          byteSize: variant.metadata.byteSize,
          width: variant.metadata.width,
          height: variant.metadata.height,
          storageKey: saved.storageKey,
          url: saved.url,
        },
      });
    }));

    const updated = await dbClient.asset.update({
      where: { id: baseAsset.id },
      data: {
        storageKey: masterStored.storageKey,
        url: masterStored.url,
        mimeType: processed.metadata.mimeType,
        byteSize: processed.metadata.byteSize,
        width: processed.metadata.width,
        height: processed.metadata.height,
        mime: processed.metadata.mimeType,
        sizeBytes: processed.metadata.byteSize,
        processingStatus: "READY",
        processingError: null,
      },
    });
    logAssetProcessingStatus({ assetId: updated.id, status: "READY", detail: "master_and_variants_saved" });

    return {
      asset: updated,
      variants: persistedVariants,
      processed,
      processing: {
        transformApplied: processed.transformApplied,
        fallbackUsed: processed.fallbackUsed || transformedVariants !== variants.length,
        processingPartial: processed.processingPartial || transformedVariants !== variants.length,
        transformedVariants,
        totalVariants: variants.length,
        diagnostics: processed.diagnostics,
        runtime: processed.runtime,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "asset_processing_failed";
    await dbClient.asset.update({
      where: { id: baseAsset.id },
      data: {
        processingStatus: "FAILED",
        processingError: message,
      },
    });
    logAssetProcessingFailure({ assetId: baseAsset.id, stage: "processing", error });
    logAssetProcessingStatus({ assetId: baseAsset.id, status: "FAILED", detail: message });
    throw error;
  }
}

export async function finalizeAssetCrop(params: {
  dbClient: PrismaClient;
  assetId: string;
  crop: AssetCrop;
  uploadToBlob?: typeof put;
}) {
  const asset = await params.dbClient.asset.findUnique({
    where: { id: params.assetId },
    select: {
      id: true,
      ownerUserId: true,
      originalUrl: true,
      mimeType: true,
    },
  });
  if (!asset?.originalUrl) {
    throw new Error("asset_original_not_found");
  }

  await params.dbClient.asset.update({
    where: { id: asset.id },
    data: {
      processingStatus: "PROCESSING",
      processingError: null,
      cropJson: params.crop,
    },
  });
  logAssetProcessingStatus({ assetId: asset.id, status: "PROCESSING", detail: "crop_finalize_started" });

  try {
    const runtimeStatus = await getImageTransformRuntimeStatus();
    logAssetTransformRuntime(runtimeStatus);

    const response = await fetch(asset.originalUrl);
    if (!response.ok) {
      throw new Error(`asset_original_fetch_failed:${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = asset.mimeType ?? response.headers.get("content-type") ?? "image/jpeg";

    const processed = await processImage({ bytes, mimeType });
    const masterStored = await saveAssetBinary({
      ownerUserId: asset.ownerUserId,
      kind: "master",
      bytes: processed.bytes,
      mimeType: processed.metadata.mimeType,
      uploadToBlob: params.uploadToBlob,
    });
    const variants = await generateImageVariants({ master: processed, crop: params.crop });
    const transformedVariants = variants.filter((variant) => variant.transformed).length;
    logAssetTransformDecision({
      assetId: asset.id,
      optimizationSkipped: !processed.optimized,
      fallbackUsed: processed.fallbackUsed || transformedVariants !== variants.length,
      transformedVariants,
      totalVariants: variants.length,
      diagnostics: processed.diagnostics,
    });

    await params.dbClient.assetVariant.deleteMany({ where: { assetId: asset.id } });
    await Promise.all(variants.map(async (variant) => {
      const saved = await saveAssetBinary({
        ownerUserId: asset.ownerUserId,
        kind: "variant",
        variantName: variant.name,
        bytes: variant.bytes,
        mimeType: variant.metadata.mimeType,
        uploadToBlob: params.uploadToBlob,
      });
      await params.dbClient.assetVariant.create({
        data: {
          assetId: asset.id,
          variantName: variant.name,
          mimeType: variant.metadata.mimeType,
          byteSize: variant.metadata.byteSize,
          width: variant.metadata.width,
          height: variant.metadata.height,
          storageKey: saved.storageKey,
          url: saved.url,
        },
      });
    }));

    const updated = await params.dbClient.asset.update({
      where: { id: asset.id },
      data: {
        processingStatus: "READY",
        processingError: null,
        storageKey: masterStored.storageKey,
        url: masterStored.url,
        mimeType: processed.metadata.mimeType,
        byteSize: processed.metadata.byteSize,
        width: processed.metadata.width,
        height: processed.metadata.height,
      },
      include: {
        variants: true,
      },
    });
    logAssetProcessingStatus({ assetId: updated.id, status: "READY", detail: "crop_finalize_ready" });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "asset_crop_finalize_failed";
    await params.dbClient.asset.update({
      where: { id: asset.id },
      data: {
        processingStatus: "FAILED",
        processingError: message,
      },
    });
    logAssetProcessingFailure({ assetId: asset.id, stage: "crop", error });
    logAssetProcessingStatus({ assetId: asset.id, status: "FAILED", detail: message });
    throw error;
  }
}
