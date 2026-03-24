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
