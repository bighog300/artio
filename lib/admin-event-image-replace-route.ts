import { z } from "zod";
import { apiError } from "@/lib/api";
import { logAdminAction } from "@/lib/admin-audit";
import { uploadEventImageToBlob } from "@/lib/blob/upload-image";
import { db } from "@/lib/db";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { parseBody } from "@/lib/validators";

type ReplaceImageDeps = {
  appDb: Pick<typeof db, "event" | "eventImage" | "asset">;
  fetchImageFn: typeof fetchImageWithGuards;
  uploadImageFn: typeof uploadEventImageToBlob;
  assertUrlFn: typeof assertSafeUrl;
  logAction: typeof logAdminAction;
};

const defaultDeps: ReplaceImageDeps = {
  appDb: db,
  fetchImageFn: fetchImageWithGuards,
  uploadImageFn: uploadEventImageToBlob,
  assertUrlFn: assertSafeUrl,
  logAction: logAdminAction,
};

const replaceImageBodySchema = z.object({
  sourceUrl: z.string().trim().min(1),
});

export async function handleAdminEventImageReplace(
  req: Request,
  params: { id?: string },
  actorEmail: string,
  deps: Partial<ReplaceImageDeps> = {},
) {
  const resolved = { ...defaultDeps, ...deps };
  const eventId = params.id;
  if (!eventId) return apiError(400, "invalid_request", "Invalid route parameter");

  const parsedBody = replaceImageBodySchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload");

  const { sourceUrl } = parsedBody.data;

  try {
    await resolved.assertUrlFn(sourceUrl);
  } catch {
    return apiError(422, "invalid_source_url", "Image source URL is not allowed");
  }

  const event = await resolved.appDb.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, venueId: true },
  });

  if (!event) return apiError(404, "not_found", "Event not found");

  let fetched: Awaited<ReturnType<typeof fetchImageWithGuards>>;
  try {
    fetched = await resolved.fetchImageFn(sourceUrl);
  } catch {
    return apiError(422, "fetch_failed", "Could not fetch image from source URL");
  }

  let uploaded: Awaited<ReturnType<typeof uploadEventImageToBlob>>;
  try {
    uploaded = await resolved.uploadImageFn({
      venueId: event.venueId ?? "",
      candidateId: eventId,
      sourceUrl,
      contentType: fetched.contentType,
      bytes: fetched.bytes,
    });
  } catch {
    return apiError(500, "upload_failed", "Image upload failed");
  }

  const appDbWithTx = resolved.appDb as typeof db;
  const txRunner = appDbWithTx.$transaction?.bind(appDbWithTx) ?? db.$transaction.bind(db);

  const eventImage = await txRunner(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        ownerUserId: null,
        kind: "IMAGE",
        url: uploaded.url,
        filename: null,
        mime: fetched.contentType,
        sizeBytes: fetched.sizeBytes,
        alt: event.title ?? "",
      },
      select: { id: true },
    });

    await tx.eventImage.updateMany({
      where: { eventId },
      data: { isPrimary: false },
    });

    const created = await tx.eventImage.create({
      data: {
        eventId,
        assetId: asset.id,
        url: uploaded.url,
        alt: event.title ?? "",
        contentType: fetched.contentType,
        sizeBytes: fetched.sizeBytes,
        sortOrder: 0,
        isPrimary: true,
      },
      select: { id: true },
    });

    await tx.event.update({
      where: { id: eventId },
      data: { featuredAssetId: asset.id },
    });

    return created;
  });

  await resolved.logAction({
    actorEmail,
    action: "admin.event.image.replace",
    targetType: "event",
    targetId: eventId,
    req,
    metadata: { imageId: eventImage.id, sourceUrl, uploadedUrl: uploaded.url },
  });

  return Response.json({ imageId: eventImage.id, url: uploaded.url });
}
