import { logError, logInfo, logWarn } from "@/lib/logging";

export function logAssetValidationFailure(payload: { ownerUserId?: string | null; errors: string[]; warnings?: string[] }) {
  logWarn({ message: "asset_validation_failed", ownerUserId: payload.ownerUserId ?? null, errors: payload.errors, warnings: payload.warnings ?? [] });
}

export function logAssetProcessingStatus(payload: { assetId: string; status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED"; detail?: string }) {
  logInfo({ message: "asset_processing_status", assetId: payload.assetId, status: payload.status, detail: payload.detail ?? null });
}

export function logAssetProcessingFailure(payload: { assetId?: string; stage: "processing" | "storage" | "crop"; error: unknown }) {
  logError({ message: "asset_processing_failed", assetId: payload.assetId ?? null, stage: payload.stage, error: payload.error instanceof Error ? payload.error.message : String(payload.error) });
}

export function logAssetTransformRuntime(payload: { available: boolean; mode: "transform" | "passthrough"; reason: string; provider: string }) {
  if (payload.available) {
    logInfo({ message: "asset_transform_runtime_available", ...payload });
    return;
  }
  logWarn({ message: "asset_transform_runtime_unavailable", ...payload });
}

export function logAssetTransformDecision(payload: {
  assetId?: string;
  optimizationAttempted: boolean;
  optimizationStatus: string;
  fallbackUsed: boolean;
  transformed: boolean;
  transformedVariants: number;
  totalVariants: number;
  diagnostics: string[];
}) {
  logInfo({
    message: "asset_transform_decision",
    assetId: payload.assetId ?? null,
    optimizationAttempted: payload.optimizationAttempted,
    optimizationStatus: payload.optimizationStatus,
    fallbackUsed: payload.fallbackUsed,
    transformed: payload.transformed,
    transformedVariants: payload.transformedVariants,
    totalVariants: payload.totalVariants,
    diagnostics: payload.diagnostics,
  });
}

export function logAssetTransformDegraded(payload: { assetId?: string; context: "upload" | "crop"; diagnostics: string[] }) {
  logWarn({
    message: "asset_transform_degraded",
    assetId: payload.assetId ?? null,
    context: payload.context,
    diagnostics: payload.diagnostics,
  });
}
