import { getImageTransformRuntimeStatus } from "@/lib/assets/transform-runtime";
import { logInfo, logWarn } from "@/lib/logging";

let didLogRuntimeStatus = false;

export async function logImageTransformRuntimeStatusOnce(context: string) {
  if (didLogRuntimeStatus) return;
  didLogRuntimeStatus = true;

  const status = await getImageTransformRuntimeStatus();
  if (status.available) {
    logInfo({ message: "asset_transform_runtime_available", context, runtime: status });
    return;
  }

  logWarn({ message: "asset_transform_runtime_unavailable", context, runtime: status });
}
