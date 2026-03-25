import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { deleteBlobByUrl } from "@/lib/blob-delete";
import { isAdminImageAltRequired } from "@/lib/admin-policy";

export type AdminImageItem = {
  id: string;
  assetId?: string | null;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  contentType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
  isPrimary: boolean;
};

export type AdminEntityType = "event" | "venue" | "artist";

type Tx = Prisma.TransactionClient;

const PRIMARY_UNIQUE_INDEXES = [
  "event_image_one_primary_per_event",
  "venue_image_one_primary_per_venue",
  "artist_image_one_primary_per_artist",
] as const;

const entityConfig = {
  event: {
    targetType: "event",
    parentNotFoundMessage: "Event not found",
  },
  venue: {
    targetType: "venue",
    parentNotFoundMessage: "Venue not found",
  },
  artist: {
    targetType: "artist",
    parentNotFoundMessage: "Artist not found",
  },
} as const;

async function ensureEntityExists(tx: Tx, entityType: AdminEntityType, entityId: string) {
  if (entityType === "event") {
    return tx.event.findUnique({ where: { id: entityId }, select: { id: true } });
  }
  if (entityType === "venue") {
    return tx.venue.findUnique({ where: { id: entityId }, select: { id: true } });
  }
  return tx.artist.findUnique({ where: { id: entityId }, select: { id: true } });
}

function mapImage(row: { id: string; assetId?: string | null; url: string; alt: string | null; width?: number | null; height?: number | null; contentType?: string | null; sizeBytes?: number | null; sortOrder: number; isPrimary: boolean }): AdminImageItem {
  return { id: row.id, assetId: row.assetId ?? null, url: row.url, alt: row.alt, width: row.width ?? null, height: row.height ?? null, contentType: row.contentType ?? null, sizeBytes: row.sizeBytes ?? null, sortOrder: row.sortOrder, isPrimary: row.isPrimary };
}

async function listImages(tx: Tx, entityType: AdminEntityType, entityId: string) {
  if (entityType === "event") return tx.eventImage.findMany({ where: { eventId: entityId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (entityType === "venue") return tx.venueImage.findMany({ where: { venueId: entityId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return tx.artistImage.findMany({ where: { artistId: entityId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

async function updateFeaturedImage(tx: Tx, entityType: AdminEntityType, entityId: string, payload: { featuredAssetId: string | null; featuredImageUrl: string | null }) {
  if (entityType === "event") return;
  if (entityType === "venue") {
    await tx.venue.update({ where: { id: entityId }, data: payload });
    return;
  }
  await tx.artist.update({ where: { id: entityId }, data: payload });
}

async function setAllPrimaryFalse(tx: Tx, entityType: AdminEntityType, entityId: string) {
  if (entityType === "event") return tx.eventImage.updateMany({ where: { eventId: entityId }, data: { isPrimary: false } });
  if (entityType === "venue") return tx.venueImage.updateMany({ where: { venueId: entityId }, data: { isPrimary: false } });
  return tx.artistImage.updateMany({ where: { artistId: entityId }, data: { isPrimary: false } });
}

async function setPrimaryImageById(tx: Tx, entityType: AdminEntityType, imageId: string) {
  if (entityType === "event") return tx.eventImage.update({ where: { id: imageId }, data: { isPrimary: true } });
  if (entityType === "venue") return tx.venueImage.update({ where: { id: imageId }, data: { isPrimary: true } });
  return tx.artistImage.update({ where: { id: imageId }, data: { isPrimary: true } });
}

async function normalizeSortOrder(tx: Tx, entityType: AdminEntityType, entityId: string) {
  const images = await listImages(tx, entityType, entityId);
  await Promise.all(images.map((entry, index) => {
    if (entry.sortOrder === index) return Promise.resolve();
    if (entityType === "event") return tx.eventImage.update({ where: { id: entry.id }, data: { sortOrder: index } });
    if (entityType === "venue") return tx.venueImage.update({ where: { id: entry.id }, data: { sortOrder: index } });
    return tx.artistImage.update({ where: { id: entry.id }, data: { sortOrder: index } });
  }));
}

function isPrimaryUniquenessConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  const values = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  return values.some((value) => PRIMARY_UNIQUE_INDEXES.includes(value as (typeof PRIMARY_UNIQUE_INDEXES)[number]));
}

export async function getAdminEntityImages(entityType: AdminEntityType, entityId: string) {
  const items = await db.$transaction(async (tx) => {
    const entity = await ensureEntityExists(tx, entityType, entityId);
    if (!entity) return null;
    const images = await listImages(tx, entityType, entityId);
    return images.map(mapImage);
  });

  if (!items) return apiError(404, "not_found", entityConfig[entityType].parentNotFoundMessage);
  return NextResponse.json({ items });
}

export async function addAdminEntityImage(input: {
  entityType: AdminEntityType;
  entityId: string;
  assetId?: string | null;
  url?: string | null;
  alt?: string | null;
  makePrimary?: boolean;
  setPrimary?: boolean;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  size?: number;
  actorEmail: string;
  req: Request;
}) {
  const { entityType, entityId, url, assetId, alt, makePrimary, setPrimary, contentType, width, height, sizeBytes, size, actorEmail, req } = input;
  const created = await db.$transaction(async (tx) => {
    const entity = await ensureEntityExists(tx, entityType, entityId);
    if (!entity) return null;

    const current = await listImages(tx, entityType, entityId);
    const nextSortOrder = current.length ? Math.max(...current.map((x) => x.sortOrder)) + 1 : 0;
    const shouldBePrimary = Boolean(makePrimary ?? setPrimary) || current.length === 0;

    if (shouldBePrimary) await setAllPrimaryFalse(tx, entityType, entityId);

    const sourceAsset = assetId ? await tx.asset.findUnique({ where: { id: assetId }, select: { id: true, url: true, width: true, height: true, mime: true, mimeType: true, sizeBytes: true, byteSize: true } }) : null;
    if (assetId && !sourceAsset) return null;
    const resolvedAssetId = sourceAsset?.id ?? null;
    const resolvedUrl = sourceAsset?.url ?? url ?? null;
    if (!resolvedUrl) return null;

    const createData = { url: resolvedUrl, alt: alt ?? null, contentType: contentType ?? null, width: width ?? null, height: height ?? null, sizeBytes: sizeBytes ?? size ?? null, sortOrder: nextSortOrder, isPrimary: shouldBePrimary };
    const createDataWithAsset = {
      ...createData,
      assetId: resolvedAssetId,
      url: resolvedUrl,
      contentType: sourceAsset?.mime ?? sourceAsset?.mimeType ?? createData.contentType,
      width: sourceAsset?.width ?? createData.width,
      height: sourceAsset?.height ?? createData.height,
      sizeBytes: sourceAsset?.sizeBytes ?? sourceAsset?.byteSize ?? createData.sizeBytes,
    };
    const item = entityType === "event"
      ? await tx.eventImage.create({ data: { ...createDataWithAsset, eventId: entityId } })
      : entityType === "venue"
        ? await tx.venueImage.create({ data: { ...createDataWithAsset, venueId: entityId } })
        : await tx.artistImage.create({ data: { ...createDataWithAsset, artistId: entityId } });

    if (shouldBePrimary) await updateFeaturedImage(tx, entityType, entityId, { featuredAssetId: item.assetId ?? null, featuredImageUrl: item.assetId ? null : item.url });
    return mapImage(item);
  });

  if (!created) return apiError(404, "not_found", entityConfig[entityType].parentNotFoundMessage);

  await logAdminAction({
    actorEmail,
    action: `admin.${entityType}.image.add`,
    targetType: entityConfig[entityType].targetType,
    targetId: entityId,
    metadata: { imageId: created.id, url: created.url, makePrimary: Boolean(makePrimary ?? setPrimary), sizeBytes: sizeBytes ?? size ?? null, contentType: contentType ?? null, width: width ?? null, height: height ?? null },
    req,
  });

  return NextResponse.json({ item: created }, { status: 201 });
}

export async function patchAdminEntityImage(input: {
  entityType: AdminEntityType;
  entityId: string;
  imageId: string;
  assetId?: string | null;
  url?: string;
  alt?: string | null;
  isPrimary?: true;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  size?: number;
  actorEmail: string;
  req: Request;
}) {
  const { entityType, entityId, imageId, assetId, url, alt, isPrimary, contentType, width, height, sizeBytes, size, actorEmail, req } = input;

  const setPrimaryAttempt = async () => db.$transaction(async (tx) => {
    const entity = await ensureEntityExists(tx, entityType, entityId);
    if (!entity) return { type: "entity_not_found" as const };

    const image = entityType === "event"
      ? await tx.eventImage.findFirst({ where: { id: imageId, eventId: entityId } })
      : entityType === "venue"
        ? await tx.venueImage.findFirst({ where: { id: imageId, venueId: entityId } })
        : await tx.artistImage.findFirst({ where: { id: imageId, artistId: entityId } });

    if (!image) return { type: "image_not_found" as const };

    const oldUrl = image.url;
    const sourceAsset = assetId ? await tx.asset.findUnique({ where: { id: assetId }, select: { id: true, url: true, width: true, height: true, mime: true, mimeType: true, sizeBytes: true, byteSize: true } }) : null;
    if (assetId && !sourceAsset) return { type: "asset_not_found" as const };

    let next = image;
    if (url !== undefined || assetId !== undefined || alt !== undefined || contentType !== undefined || width !== undefined || height !== undefined || sizeBytes !== undefined || size !== undefined) {
      const data: { assetId?: string | null; url?: string; alt?: string | null; contentType?: string | null; width?: number | null; height?: number | null; sizeBytes?: number | null } = {};
      if (assetId !== undefined) data.assetId = sourceAsset?.id ?? null;
      if (sourceAsset?.url) data.url = sourceAsset.url;
      if (url !== undefined) data.url = url;
      if (alt !== undefined) data.alt = alt;
      if (contentType !== undefined || sourceAsset) data.contentType = sourceAsset?.mime ?? sourceAsset?.mimeType ?? contentType ?? null;
      if (width !== undefined || sourceAsset) data.width = sourceAsset?.width ?? width ?? null;
      if (height !== undefined || sourceAsset) data.height = sourceAsset?.height ?? height ?? null;
      if (sizeBytes !== undefined || size !== undefined || sourceAsset) data.sizeBytes = sourceAsset?.sizeBytes ?? sourceAsset?.byteSize ?? sizeBytes ?? size ?? null;

      next = entityType === "event"
        ? await tx.eventImage.update({ where: { id: imageId }, data })
        : entityType === "venue"
          ? await tx.venueImage.update({ where: { id: imageId }, data })
          : await tx.artistImage.update({ where: { id: imageId }, data });
    }

    if (isPrimary) {
      if (isAdminImageAltRequired() && !next.alt?.trim()) {
        return { type: "alt_required" as const };
      }
      await setAllPrimaryFalse(tx, entityType, entityId);
      next = await setPrimaryImageById(tx, entityType, imageId);
    }

    if (next.isPrimary) {
      await updateFeaturedImage(tx, entityType, entityId, { featuredAssetId: next.assetId ?? null, featuredImageUrl: next.assetId ? null : next.url });
    }

    return { type: "ok" as const, item: mapImage(next), oldUrl, oldAssetId: image.assetId ?? null };
  });

  let updated: Awaited<ReturnType<typeof setPrimaryAttempt>>;
  try {
    updated = await setPrimaryAttempt();
  } catch (error) {
    if (!isPrimary || !isPrimaryUniquenessConflict(error)) throw error;
    try {
      await db.$transaction(async (tx) => {
        await listImages(tx, entityType, entityId);
      });
      updated = await setPrimaryAttempt();
    } catch (retryError) {
      if (isPrimaryUniquenessConflict(retryError)) {
        return apiError(409, "conflict", "Image primary selection conflicted with another admin update. Please retry.");
      }
      throw retryError;
    }
  }

  if (updated.type === "entity_not_found") return apiError(404, "not_found", entityConfig[entityType].parentNotFoundMessage);
  if (updated.type === "image_not_found") return apiError(404, "not_found", "Image not found");
  if (updated.type === "asset_not_found") return apiError(400, "invalid_request", "Asset not found");
  if (updated.type === "alt_required") return apiError(400, "invalid_request", "alt_required");

  const action = url ? `admin.${entityType}.image.replace` : isPrimary ? `admin.${entityType}.image.set_primary` : `admin.${entityType}.image.update`;
  await logAdminAction({
    actorEmail,
    action,
    targetType: entityConfig[entityType].targetType,
    targetId: entityId,
    metadata: url ? { imageId, oldUrl: updated.oldUrl, newUrl: updated.item.url, contentType: contentType ?? null, width: width ?? null, height: height ?? null, sizeBytes: sizeBytes ?? size ?? null } : { imageId },
    req,
  });

  if ((url || assetId) && !updated.oldAssetId && updated.oldUrl !== updated.item.url) {
    await deleteBlobByUrl(updated.oldUrl).catch(() => undefined);
  }

  return NextResponse.json({ item: updated.item });
}

export async function reorderAdminEntityImages(input: {
  entityType: AdminEntityType;
  entityId: string;
  order: string[];
  actorEmail: string;
  req: Request;
}) {
  const { entityType, entityId, order, actorEmail, req } = input;

  const result = await db.$transaction(async (tx) => {
    const entity = await ensureEntityExists(tx, entityType, entityId);
    if (!entity) return { type: "entity_not_found" as const };

    const current = await listImages(tx, entityType, entityId);
    const currentIds = current.map((item) => item.id);
    const providedIds = new Set(order);

    const hasExactSet = order.length === currentIds.length
      && providedIds.size === order.length
      && currentIds.every((id) => providedIds.has(id));

    if (!hasExactSet) return { type: "invalid_order" as const };

    await Promise.all(order.map((id, index) => {
      if (entityType === "event") return tx.eventImage.update({ where: { id }, data: { sortOrder: index } });
      if (entityType === "venue") return tx.venueImage.update({ where: { id }, data: { sortOrder: index } });
      return tx.artistImage.update({ where: { id }, data: { sortOrder: index } });
    }));

    await normalizeSortOrder(tx, entityType, entityId);
    return { type: "ok" as const };
  });

  if (result.type === "entity_not_found") return apiError(404, "not_found", entityConfig[entityType].parentNotFoundMessage);
  if (result.type === "invalid_order") return apiError(400, "invalid_request", "Order payload must include every image id exactly once.");

  await logAdminAction({ actorEmail, action: `admin.${entityType}.image.reorder`, targetType: entityConfig[entityType].targetType, targetId: entityId, metadata: { order }, req });
  return NextResponse.json({ ok: true });
}

export async function deleteAdminEntityImage(input: {
  entityType: AdminEntityType;
  entityId: string;
  imageId: string;
  actorEmail: string;
  req: Request;
}) {
  const { entityType, entityId, imageId, actorEmail, req } = input;

  const result = await db.$transaction(async (tx) => {
    const entity = await ensureEntityExists(tx, entityType, entityId);
    if (!entity) return { type: "entity_not_found" as const };

    const image = entityType === "event"
      ? await tx.eventImage.findFirst({ where: { id: imageId, eventId: entityId } })
      : entityType === "venue"
        ? await tx.venueImage.findFirst({ where: { id: imageId, venueId: entityId } })
        : await tx.artistImage.findFirst({ where: { id: imageId, artistId: entityId } });

    if (!image) return { type: "image_not_found" as const };

    if (entityType === "event") await tx.eventImage.delete({ where: { id: imageId } });
    else if (entityType === "venue") await tx.venueImage.delete({ where: { id: imageId } });
    else await tx.artistImage.delete({ where: { id: imageId } });

    await normalizeSortOrder(tx, entityType, entityId);

    if (image.isPrimary) {
      const normalized = await listImages(tx, entityType, entityId);
      const nextPrimary = normalized[0] ?? null;
      await setAllPrimaryFalse(tx, entityType, entityId);
      if (nextPrimary) {
        await setPrimaryImageById(tx, entityType, nextPrimary.id);
      }
      await updateFeaturedImage(tx, entityType, entityId, { featuredAssetId: nextPrimary?.assetId ?? null, featuredImageUrl: nextPrimary?.assetId ? null : nextPrimary?.url ?? null });
    }

    return { type: "ok" as const, deletedUrl: image.url, deletedAssetId: image.assetId ?? null };
  });

  if (result.type === "entity_not_found") return apiError(404, "not_found", entityConfig[entityType].parentNotFoundMessage);
  if (result.type === "image_not_found") return apiError(404, "not_found", "Image not found");

  await logAdminAction({ actorEmail, action: `admin.${entityType}.image.delete`, targetType: entityConfig[entityType].targetType, targetId: entityId, metadata: { imageId }, req });
  if (!result.deletedAssetId) {
    await deleteBlobByUrl(result.deletedUrl).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
