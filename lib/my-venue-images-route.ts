import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { Asset } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/assets";
import { imageIdParamSchema, parseBody, venueCoverPatchSchema, venueIdParamSchema, venueImageCreateSchema, venueImageReorderSchema, venueImageUpdateSchema, venueUploadUrlRequestSchema, zodDetails } from "@/lib/validators";
import {
  RATE_LIMITS,
  enforceRateLimit,
  isRateLimitError,
  principalRateLimitKey,
  rateLimitErrorResponse,
} from "@/lib/rate-limit";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type SessionUser = { id: string };
type VenueImageRecord = {
  id: string;
  venueId: string;
  assetId?: string | null;
  url: string;
  alt: string | null;
  sortOrder: number;
  createdAt?: Date;
};

type HandleDeps = {
  requireAuth: () => Promise<SessionUser>;
  requireVenueMembership: (userId: string, venueId: string) => Promise<void>;
  findMaxSortOrder: (venueId: string) => Promise<number | null>;
  findAssetById?: (assetId: string) => Promise<Pick<Asset, "id" | "url" | "width" | "height" | "mime" | "mimeType" | "sizeBytes" | "byteSize"> | null>;
  createVenueImage: (input: { venueId: string; assetId: string | null; url: string; alt: string | null; sortOrder: number; width?: number | null; height?: number | null; contentType?: string | null; sizeBytes?: number | null }) => Promise<VenueImageRecord>;
  findVenueImageForUser: (imageId: string, userId: string) => Promise<VenueImageRecord | null>;
  updateVenueImageAlt: (imageId: string, alt: string | null) => Promise<VenueImageRecord>;
  findVenueImageIds: (venueId: string, imageIds: string[]) => Promise<string[]>;
  reorderVenueImages: (venueId: string, orderedIds: string[]) => Promise<void>;
  deleteVenueImage: (imageId: string) => Promise<VenueImageRecord>;
  deleteBlobByUrl?: (url: string) => Promise<void>;
  findVenueImageById: (venueId: string, imageId: string) => Promise<Pick<VenueImageRecord, "id" | "url"> & { assetId: string | null } | null>;
  updateVenueCover: (venueId: string, payload: { featuredAssetId: string | null; featuredImageUrl: string | null }) => Promise<{ featuredAssetId: string | null; featuredImageUrl: string | null }>;
};

function mapImage(image: VenueImageRecord) {
  return { id: image.id, assetId: image.assetId ?? null, url: image.url, alt: image.alt, sortOrder: image.sortOrder };
}

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function parseVenueId(params: Promise<{ id: string }>): Promise<{ venueId: string } | { error: NextResponse }> {
  const parsed = venueIdParamSchema.safeParse(await params);
  if (!parsed.success) return { error: apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsed.error)) as NextResponse };
  return { venueId: parsed.data.id };
}

export async function handleVenueImageUploadUrl(
  req: NextRequest,
  params: Promise<{ id: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "requireVenueMembership">,
) {
  try {
    const parsedId = await parseVenueId(params);
    if ("error" in parsedId) return withNoStore(parsedId.error);

    const user = await deps.requireAuth();
    await deps.requireVenueMembership(user.id, parsedId.venueId);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `venue-images:upload-url:${parsedId.venueId}`, user.id),
      limit: RATE_LIMITS.venueImagesWrite.limit,
      windowMs: RATE_LIMITS.venueImagesWrite.windowMs,
    });

    const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
    if (!body || typeof body !== "object" || !("type" in body)) {
      return withNoStore(apiError(400, "invalid_request", "Invalid upload handshake payload"));
    }

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const parsedClientPayload = venueUploadUrlRequestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsedClientPayload.success) throw new Error("invalid_upload_payload");

        return {
          allowedContentTypes: [parsedClientPayload.data.contentType],
          maximumSizeInBytes: MAX_IMAGE_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, venueId: parsedId.venueId }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return withNoStore(NextResponse.json(jsonResponse, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (error instanceof Error && error.message === "unauthorized") {
      return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    }
    if (error instanceof Error && error.message === "forbidden") {
      return withNoStore(apiError(403, "forbidden", "Venue membership required"));
    }
    if (error instanceof Error && error.message === "invalid_upload_payload") {
      return withNoStore(apiError(400, "invalid_request", "Invalid payload"));
    }
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleCreateVenueImage(
  req: NextRequest,
  params: Promise<{ id: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "requireVenueMembership" | "findMaxSortOrder" | "findAssetById" | "createVenueImage">,
) {
  try {
    const parsedId = await parseVenueId(params);
    if ("error" in parsedId) return withNoStore(parsedId.error);

    const user = await deps.requireAuth();
    await deps.requireVenueMembership(user.id, parsedId.venueId);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `venue-images:create:${parsedId.venueId}`, user.id),
      limit: RATE_LIMITS.venueImagesWrite.limit,
      windowMs: RATE_LIMITS.venueImagesWrite.windowMs,
    });

    const parsedBody = venueImageCreateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) {
      return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));
    }

    const maxSortOrder = await deps.findMaxSortOrder(parsedId.venueId);
    let resolvedAsset: Awaited<ReturnType<NonNullable<HandleDeps["findAssetById"]>>> | null = null;
    if (parsedBody.data.assetId) {
      resolvedAsset = await deps.findAssetById?.(parsedBody.data.assetId) ?? null;
      if (!resolvedAsset) {
        return withNoStore(apiError(400, "invalid_request", "Asset not found"));
      }
    }
    const image = await deps.createVenueImage({
      venueId: parsedId.venueId,
      assetId: parsedBody.data.assetId ?? null,
      url: resolvedAsset?.url ?? parsedBody.data.url ?? "",
      alt: parsedBody.data.alt ?? null,
      sortOrder: (maxSortOrder ?? -1) + 1,
      width: resolvedAsset?.width ?? null,
      height: resolvedAsset?.height ?? null,
      contentType: resolvedAsset?.mime ?? resolvedAsset?.mimeType ?? null,
      sizeBytes: resolvedAsset?.sizeBytes ?? resolvedAsset?.byteSize ?? null,
    });

    return withNoStore(NextResponse.json({ image: mapImage(image) }, { status: 201, headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (error instanceof Error && error.message === "unauthorized") {
      return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    }
    if (error instanceof Error && error.message === "forbidden") {
      return withNoStore(apiError(403, "forbidden", "Venue membership required"));
    }
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleReorderVenueImages(
  req: NextRequest,
  params: Promise<{ id: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "requireVenueMembership" | "findVenueImageIds" | "reorderVenueImages">,
) {
  try {
    const parsedId = await parseVenueId(params);
    if ("error" in parsedId) return withNoStore(parsedId.error);

    const user = await deps.requireAuth();
    await deps.requireVenueMembership(user.id, parsedId.venueId);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `venue-images:reorder:${parsedId.venueId}`, user.id),
      limit: RATE_LIMITS.venueImagesWrite.limit,
      windowMs: RATE_LIMITS.venueImagesWrite.windowMs,
    });

    const parsedBody = venueImageReorderSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) {
      return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));
    }

    const foundIds = await deps.findVenueImageIds(parsedId.venueId, parsedBody.data.orderedIds);
    if (foundIds.length !== parsedBody.data.orderedIds.length) {
      return withNoStore(apiError(400, "invalid_request", "One or more images do not belong to this venue"));
    }

    await deps.reorderVenueImages(parsedId.venueId, parsedBody.data.orderedIds);
    return withNoStore(NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (error instanceof Error && error.message === "unauthorized") {
      return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    }
    if (error instanceof Error && error.message === "forbidden") {
      return withNoStore(apiError(403, "forbidden", "Venue membership required"));
    }
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handlePatchVenueImage(
  req: NextRequest,
  params: Promise<{ imageId: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "findVenueImageForUser" | "updateVenueImageAlt">,
) {
  try {
    const parsedId = imageIdParamSchema.safeParse(await params);
    if (!parsedId.success) return withNoStore(apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error)));

    const user = await deps.requireAuth();

    await enforceRateLimit({
      key: principalRateLimitKey(req, `venue-images:patch:${parsedId.data.imageId}`, user.id),
      limit: RATE_LIMITS.venueImagesWrite.limit,
      windowMs: RATE_LIMITS.venueImagesWrite.windowMs,
    });

    const existing = await deps.findVenueImageForUser(parsedId.data.imageId, user.id);
    if (!existing) return withNoStore(apiError(403, "forbidden", "Venue membership required"));

    const parsedBody = venueImageUpdateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));

    const image = await deps.updateVenueImageAlt(parsedId.data.imageId, parsedBody.data.alt ?? null);
    return withNoStore(NextResponse.json({ image: mapImage(image) }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (error instanceof Error && error.message === "unauthorized") {
      return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    }
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleDeleteVenueImage(
  req: NextRequest,
  params: Promise<{ imageId: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "findVenueImageForUser" | "deleteVenueImage" | "deleteBlobByUrl">,
) {
  try {
    const parsedId = imageIdParamSchema.safeParse(await params);
    if (!parsedId.success) return withNoStore(apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error)));

    const user = await deps.requireAuth();

    await enforceRateLimit({
      key: principalRateLimitKey(req, `venue-images:delete:${parsedId.data.imageId}`, user.id),
      limit: RATE_LIMITS.venueImagesWrite.limit,
      windowMs: RATE_LIMITS.venueImagesWrite.windowMs,
    });

    const existing = await deps.findVenueImageForUser(parsedId.data.imageId, user.id);
    if (!existing) return withNoStore(apiError(403, "forbidden", "Venue membership required"));

    const deleted = await deps.deleteVenueImage(parsedId.data.imageId);
    if (deps.deleteBlobByUrl) await deps.deleteBlobByUrl(deleted.url).catch(() => undefined);

    return withNoStore(NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (error instanceof Error && error.message === "unauthorized") {
      return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    }
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleSetVenueCover(
  req: NextRequest,
  params: Promise<{ id: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "requireVenueMembership" | "findVenueImageById" | "updateVenueCover">,
) {
  try {
    const parsedId = await parseVenueId(params);
    if ("error" in parsedId) return withNoStore(parsedId.error);

    const user = await deps.requireAuth();
    await deps.requireVenueMembership(user.id, parsedId.venueId);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `venue-images:cover:${parsedId.venueId}`, user.id),
      limit: RATE_LIMITS.venueImagesWrite.limit,
      windowMs: RATE_LIMITS.venueImagesWrite.windowMs,
    });

    const parsedBody = venueCoverPatchSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) {
      return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));
    }

    const imageId = parsedBody.data.imageId !== undefined ? parsedBody.data.imageId : parsedBody.data.venueImageId;
    if (imageId === null) {
      const cover = await deps.updateVenueCover(parsedId.venueId, {
        featuredAssetId: null,
        featuredImageUrl: null,
      });
      return withNoStore(NextResponse.json({ cover }, { headers: NO_STORE_HEADERS }));
    }

    const image = await deps.findVenueImageById(parsedId.venueId, imageId!);
    if (!image) {
      return withNoStore(apiError(400, "invalid_request", "Image does not belong to this venue"));
    }

    const cover = await deps.updateVenueCover(parsedId.venueId, {
      featuredAssetId: image.assetId,
      featuredImageUrl: image.assetId ? null : image.url,
    });

    return withNoStore(NextResponse.json({ cover }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (error instanceof Error && error.message === "unauthorized") {
      return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    }
    if (error instanceof Error && error.message === "forbidden") {
      return withNoStore(apiError(403, "forbidden", "Venue membership required"));
    }
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export const venueImageBlobDelete = async (url: string) => {
  await del(url);
};
