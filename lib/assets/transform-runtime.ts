import "server-only";

export type SharpLikeInstance = {
  rotate: () => SharpLikeInstance;
  resize: (options: {
    width?: number;
    height?: number;
    fit?: "inside" | "cover";
    withoutEnlargement?: boolean;
  }) => SharpLikeInstance;
  extract: (options: { left: number; top: number; width: number; height: number }) => SharpLikeInstance;
  jpeg: (options: { quality: number; mozjpeg?: boolean }) => SharpLikeInstance;
  toBuffer: () => Promise<Buffer>;
};

type SharpLikeModule = (input: Buffer, options: { failOn: "none" }) => SharpLikeInstance;

export type ImageTransformRuntimeStatus = {
  available: boolean;
  provider: "sharp" | "none";
  mode: "transform" | "passthrough";
  reason: "ok" | "sharp_not_installed" | "sharp_load_failed";
};

let sharpPromise: Promise<SharpLikeModule | null> | null = null;
let statusPromise: Promise<ImageTransformRuntimeStatus> | undefined;

function resolveSharpLikeModule(required: { default?: unknown } | ((...args: unknown[]) => unknown)): SharpLikeModule | null {
  if (typeof required === "function") {
    return required as SharpLikeModule;
  }
  if (required && typeof required === "object" && typeof required.default === "function") {
    return required.default as SharpLikeModule;
  }
  return null;
}

export async function getSharpModule() {
  if (!sharpPromise) {
    sharpPromise = Promise.resolve().then(() => {
      try {
        const required = (Function("return require")() as (id: string) => { default?: unknown } | ((...args: unknown[]) => unknown))("sharp");
        return resolveSharpLikeModule(required);
      } catch {
        return null;
      }
    });
  }
  return sharpPromise;
}

export async function getImageTransformRuntimeStatus(): Promise<ImageTransformRuntimeStatus> {
  if (!statusPromise) {
    statusPromise = getSharpModule()
      .then((sharp): ImageTransformRuntimeStatus => {
        if (sharp) {
          return { available: true, provider: "sharp", mode: "transform", reason: "ok" };
        }
        return { available: false, provider: "none", mode: "passthrough", reason: "sharp_not_installed" };
      })
      .catch((): ImageTransformRuntimeStatus => ({
        available: false,
        provider: "none",
        mode: "passthrough",
        reason: "sharp_load_failed",
      }));
  }

  return statusPromise;
}

export async function isImageTransformAvailable() {
  const status = await getImageTransformRuntimeStatus();
  return status.available;
}
