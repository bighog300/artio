import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resolveApiImageField } from "@/lib/assets/image-contract";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import { adminBrandingLogoCommitSchema, adminBrandingLogoUploadPayloadSchema, parseBody, zodDetails } from "@/lib/validators";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type BrandingLogoDeps = {
  requireAdminUser: () => Promise<{ email: string }>;
  handleUploadFn?: typeof handleUpload;
  appDb?: typeof db;
  getSiteSettingsFn?: typeof getSiteSettings;
};

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function handleAdminBrandingLogoGet(req: NextRequest, deps: BrandingLogoDeps) {
  void req;
  try {
    await deps.requireAdminUser();
    const settings = await (deps.getSiteSettingsFn ?? getSiteSettings)();
    return withNoStore(NextResponse.json({ logo: settings.logoAsset ? {
      assetId: settings.logoAsset.id,
      url: settings.logoAsset.url,
      image: resolveApiImageField({ asset: settings.logoAsset, requestedVariant: "square", allowOriginalUrl: true }),
      contentType: settings.logoAsset.mime,
      size: settings.logoAsset.sizeBytes,
    } : null }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") return withNoStore(apiError(403, "forbidden", "Admin role required"));
    if (error instanceof Error && error.message === "unauthorized") return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleAdminBrandingLogoUpload(req: NextRequest, deps: BrandingLogoDeps) {
  try {
    const handleUploadFn = deps.handleUploadFn ?? handleUpload;
    const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
    if (!body || typeof body !== "object" || !("type" in body)) {
      return withNoStore(apiError(400, "invalid_request", "Invalid upload handshake payload"));
    }

    const jsonResponse = await handleUploadFn({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        await deps.requireAdminUser();
        const parsed = adminBrandingLogoUploadPayloadSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success) throw new Error("invalid_upload_payload");

        const rawFilename = parsed.data.filename;
        const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-{2,}/g, "-");

        return {
          allowedContentTypes: [parsed.data.contentType],
          maximumSizeInBytes: 2_000_000,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...parsed.data, filename: safeFilename }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return withNoStore(NextResponse.json(jsonResponse, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") return withNoStore(apiError(403, "forbidden", "Admin role required"));
    if (error instanceof Error && error.message === "unauthorized") return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    if (error instanceof Error && error.message === "invalid_upload_payload") return withNoStore(apiError(400, "invalid_request", "Invalid payload"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleAdminBrandingLogoCommit(req: NextRequest, deps: BrandingLogoDeps) {
  try {
    const admin = await deps.requireAdminUser();
    const parsed = adminBrandingLogoCommitSchema.safeParse(await parseBody(req));
    if (!parsed.success) return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error)));

    const appDb = deps.appDb ?? db;
    const adminUser = await appDb.user.findUnique({
      where: { email: admin.email },
      select: { id: true },
    });
    const ownerUserId = adminUser?.id ?? null;

    const existingSettings = await appDb.siteSettings.findUnique({
      where: { id: "default" },
      select: { logoAssetId: true },
    });
    const previousAssetId = existingSettings?.logoAssetId ?? null;

    const asset = await appDb.asset.create({
      data: {
        ownerUserId,
        kind: "IMAGE",
        url: parsed.data.blobUrl,
        filename: parsed.data.blobPath,
        mime: parsed.data.contentType,
        sizeBytes: parsed.data.size,
      },
    });

    const settings = await appDb.siteSettings.upsert({
      where: { id: "default" },
      update: { logoAssetId: asset.id },
      create: { id: "default", logoAssetId: asset.id },
    });

    if (previousAssetId && previousAssetId !== asset.id) {
      await appDb.asset.delete({ where: { id: previousAssetId } }).catch(() => null);
    }

    return withNoStore(NextResponse.json({
      ok: true,
      logo: {
        assetId: settings.logoAssetId,
        url: asset.url,
        image: resolveApiImageField({
          asset: {
            url: asset.url,
            processingStatus: null,
            processingError: null,
            variants: null,
            originalUrl: null,
          },
          requestedVariant: "square",
        }),
      },
    }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") return withNoStore(apiError(403, "forbidden", "Admin role required"));
    if (error instanceof Error && error.message === "unauthorized") return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleAdminBrandingLogoClear(req: NextRequest, deps: BrandingLogoDeps) {
  void req;
  try {
    await deps.requireAdminUser();
    const appDb = deps.appDb ?? db;

    const existing = await appDb.siteSettings.findUnique({
      where: { id: "default" },
      select: { logoAssetId: true },
    });

    await appDb.siteSettings.upsert({
      where: { id: "default" },
      update: { logoAssetId: null },
      create: { id: "default", logoAssetId: null },
    });

    if (existing?.logoAssetId) {
      await appDb.asset.delete({ where: { id: existing.logoAssetId } }).catch(() => null);
    }

    return withNoStore(NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") return withNoStore(apiError(403, "forbidden", "Admin role required"));
    if (error instanceof Error && error.message === "unauthorized") return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}
