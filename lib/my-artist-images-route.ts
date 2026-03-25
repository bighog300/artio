import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/assets";
import {
  artistCoverPatchSchema,
  artistImageCreateSchema,
  artistImageReorderSchema,
  artistImageUpdateSchema,
  artistUploadRequestSchema,
  imageIdParamSchema,
  parseBody,
  zodDetails,
} from "@/lib/validators";
import {
  RATE_LIMITS,
  enforceRateLimit,
  isRateLimitError,
  principalRateLimitKey,
  rateLimitErrorResponse,
} from "@/lib/rate-limit";
import { ForbiddenError, isForbiddenError, isUnauthorizedError } from "@/lib/http-errors";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
// Transitional compatibility helper: preserves artist self-serve handshake routes while uploads converge on asset pipeline.

type SessionUser = { id: string };
type ArtistImageRecord = {
  id: string;
  artistId: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  assetId: string | null;
  createdAt?: Date;
};

type HandleDeps = {
  requireAuth: () => Promise<SessionUser>;
  getOwnedArtistId: (userId: string) => Promise<string | null>;
  findMaxSortOrder: (artistId: string) => Promise<number | null>;
  createArtistImage: (input: { artistId: string; url: string; alt: string | null; sortOrder: number; assetId: string | null }) => Promise<ArtistImageRecord>;
  findArtistImageByOwner: (imageId: string, userId: string) => Promise<ArtistImageRecord | null>;
  updateArtistImageAlt: (imageId: string, alt: string | null) => Promise<ArtistImageRecord>;
  findArtistImageIds: (artistId: string, imageIds: string[]) => Promise<string[]>;
  reorderArtistImages: (artistId: string, orderedIds: string[]) => Promise<void>;
  deleteArtistImage: (imageId: string) => Promise<ArtistImageRecord>;
  deleteBlobByUrl?: (url: string) => Promise<void>;
  findArtistImageById: (artistId: string, imageId: string) => Promise<Pick<ArtistImageRecord, "id" | "url" | "assetId"> | null>;
  updateArtistCover: (artistId: string, payload: { featuredAssetId: string | null; featuredImageUrl: string | null }) => Promise<{ featuredAssetId: string | null; featuredImageUrl: string | null }>;
};

function mapImage(image: ArtistImageRecord) {
  return { id: image.id, url: image.url, alt: image.alt, sortOrder: image.sortOrder, assetId: image.assetId };
}

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireOwnedArtistId(deps: Pick<HandleDeps, "getOwnedArtistId">, userId: string) {
  const artistId = await deps.getOwnedArtistId(userId);
  if (!artistId) throw new ForbiddenError();
  return artistId;
}

export async function handleArtistImageUpload(
  req: NextRequest,
  deps: Pick<HandleDeps, "requireAuth" | "getOwnedArtistId">,
) {
  try {
    const user = await deps.requireAuth();
    const artistId = await requireOwnedArtistId(deps, user.id);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-images:upload:${artistId}`, user.id),
      limit: RATE_LIMITS.artistImagesWrite.limit,
      windowMs: RATE_LIMITS.artistImagesWrite.windowMs,
    });

    const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
    if (!body || typeof body !== "object" || !("type" in body)) {
      return withNoStore(apiError(400, "invalid_request", "Invalid upload handshake payload"));
    }

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const parsedClientPayload = artistUploadRequestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsedClientPayload.success) throw new Error("invalid_upload_payload");

        return {
          allowedContentTypes: [parsedClientPayload.data.contentType],
          maximumSizeInBytes: MAX_IMAGE_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, artistId }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return withNoStore(NextResponse.json(jsonResponse, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (isUnauthorizedError(error)) return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    if (isForbiddenError(error)) return withNoStore(apiError(403, "forbidden", "Artist ownership required"));
    if (error instanceof Error && error.message === "invalid_upload_payload") return withNoStore(apiError(400, "invalid_request", "Invalid payload"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleCreateArtistImage(
  req: NextRequest,
  deps: Pick<HandleDeps, "requireAuth" | "getOwnedArtistId" | "findMaxSortOrder" | "createArtistImage">,
) {
  try {
    const user = await deps.requireAuth();
    const artistId = await requireOwnedArtistId(deps, user.id);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-images:create:${artistId}`, user.id),
      limit: RATE_LIMITS.artistImagesWrite.limit,
      windowMs: RATE_LIMITS.artistImagesWrite.windowMs,
    });

    const parsedBody = artistImageCreateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));

    const maxSortOrder = await deps.findMaxSortOrder(artistId);
    const image = await deps.createArtistImage({
      artistId,
      url: parsedBody.data.url,
      alt: parsedBody.data.alt ?? null,
      assetId: parsedBody.data.assetId ?? null,
      sortOrder: (maxSortOrder ?? -1) + 1,
    });

    return withNoStore(NextResponse.json({ image: mapImage(image) }, { status: 201, headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (isUnauthorizedError(error)) return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    if (isForbiddenError(error)) return withNoStore(apiError(403, "forbidden", "Artist ownership required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleReorderArtistImages(
  req: NextRequest,
  deps: Pick<HandleDeps, "requireAuth" | "getOwnedArtistId" | "findArtistImageIds" | "reorderArtistImages">,
) {
  try {
    const user = await deps.requireAuth();
    const artistId = await requireOwnedArtistId(deps, user.id);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-images:reorder:${artistId}`, user.id),
      limit: RATE_LIMITS.artistImagesWrite.limit,
      windowMs: RATE_LIMITS.artistImagesWrite.windowMs,
    });

    const parsedBody = artistImageReorderSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));

    const foundIds = await deps.findArtistImageIds(artistId, parsedBody.data.orderedIds);
    if (foundIds.length !== parsedBody.data.orderedIds.length) {
      return withNoStore(apiError(400, "invalid_request", "One or more images do not belong to this artist"));
    }

    await deps.reorderArtistImages(artistId, parsedBody.data.orderedIds);
    return withNoStore(NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (isUnauthorizedError(error)) return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    if (isForbiddenError(error)) return withNoStore(apiError(403, "forbidden", "Artist ownership required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handlePatchArtistImage(
  req: NextRequest,
  params: Promise<{ imageId: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "findArtistImageByOwner" | "updateArtistImageAlt">,
) {
  try {
    const parsedId = imageIdParamSchema.safeParse(await params);
    if (!parsedId.success) return withNoStore(apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error)));

    const user = await deps.requireAuth();

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-images:patch:${parsedId.data.imageId}`, user.id),
      limit: RATE_LIMITS.artistImagesWrite.limit,
      windowMs: RATE_LIMITS.artistImagesWrite.windowMs,
    });

    const existing = await deps.findArtistImageByOwner(parsedId.data.imageId, user.id);
    if (!existing) return withNoStore(apiError(403, "forbidden", "Artist ownership required"));

    const parsedBody = artistImageUpdateSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));

    const image = await deps.updateArtistImageAlt(parsedId.data.imageId, parsedBody.data.alt ?? null);
    return withNoStore(NextResponse.json({ image: mapImage(image) }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (isUnauthorizedError(error)) return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleDeleteArtistImage(
  req: NextRequest,
  params: Promise<{ imageId: string }>,
  deps: Pick<HandleDeps, "requireAuth" | "findArtistImageByOwner" | "deleteArtistImage" | "deleteBlobByUrl">,
) {
  try {
    const parsedId = imageIdParamSchema.safeParse(await params);
    if (!parsedId.success) return withNoStore(apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error)));

    const user = await deps.requireAuth();

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-images:delete:${parsedId.data.imageId}`, user.id),
      limit: RATE_LIMITS.artistImagesWrite.limit,
      windowMs: RATE_LIMITS.artistImagesWrite.windowMs,
    });

    const existing = await deps.findArtistImageByOwner(parsedId.data.imageId, user.id);
    if (!existing) return withNoStore(apiError(403, "forbidden", "Artist ownership required"));

    const deleted = await deps.deleteArtistImage(parsedId.data.imageId);
    if (deps.deleteBlobByUrl) await deps.deleteBlobByUrl(deleted.url).catch(() => undefined);

    return withNoStore(NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (isUnauthorizedError(error)) return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export async function handleSetArtistCover(
  req: NextRequest,
  deps: Pick<HandleDeps, "requireAuth" | "getOwnedArtistId" | "findArtistImageById" | "updateArtistCover">,
) {
  try {
    const user = await deps.requireAuth();
    const artistId = await requireOwnedArtistId(deps, user.id);

    await enforceRateLimit({
      key: principalRateLimitKey(req, `artist-images:cover:${artistId}`, user.id),
      limit: RATE_LIMITS.artistImagesWrite.limit,
      windowMs: RATE_LIMITS.artistImagesWrite.windowMs,
    });

    const parsedBody = artistCoverPatchSchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return withNoStore(apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error)));

    if (parsedBody.data.imageId === null) {
      const cover = await deps.updateArtistCover(artistId, {
        featuredAssetId: null,
        featuredImageUrl: null,
      });
      return withNoStore(NextResponse.json({ cover }, { headers: NO_STORE_HEADERS }));
    }

    const image = await deps.findArtistImageById(artistId, parsedBody.data.imageId);
    if (!image) return withNoStore(apiError(400, "invalid_request", "Image does not belong to this artist"));

    const cover = await deps.updateArtistCover(artistId, {
      featuredAssetId: image.assetId,
      featuredImageUrl: image.assetId ? null : image.url,
    });

    return withNoStore(NextResponse.json({ cover }, { headers: NO_STORE_HEADERS }));
  } catch (error) {
    if (isRateLimitError(error)) return withNoStore(rateLimitErrorResponse(error));
    if (isUnauthorizedError(error)) return withNoStore(apiError(401, "unauthorized", "Authentication required"));
    if (isForbiddenError(error)) return withNoStore(apiError(403, "forbidden", "Artist ownership required"));
    return withNoStore(apiError(500, "internal_error", "Unexpected server error"));
  }
}

export const artistImageBlobDelete = async (url: string) => {
  await del(url);
};
