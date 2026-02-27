import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { discoverEventImageUrl } from "@/lib/ingest/image-discovery";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadEventImageToBlob } from "@/lib/blob/upload-image";

type ImportResult = { attached: boolean; warning: string | null; imageUrl: string | null };

const MAX_WARNING_DETAIL = 400;

function truncateWarning(input: string): string {
  return input.length > MAX_WARNING_DETAIL ? `${input.slice(0, MAX_WARNING_DETAIL - 1)}…` : input;
}

export async function importApprovedEventImage(params: {
  appDb: {
    event: {
      findUnique: (args: {
        where: { id: string };
        select: { featuredAssetId: true; featuredAsset: { select: { url: true } } };
      }) => Promise<{ featuredAssetId: string | null; featuredAsset: { url: string | null } | null } | null>;
      update: (args: {
        where: { id: string };
        data: { featuredAssetId: string };
        select: { id: true };
      }) => Promise<{ id: string }>;
    };
    asset: {
      create: (args: {
        data: {
          ownerUserId: null;
          kind: "IMAGE";
          url: string;
          filename: null;
          mime: string;
          sizeBytes: number;
          alt: string;
        };
        select: { id: true; url: true };
      }) => Promise<{ id: string; url: string }>;
    };
  };
  candidateId: string;
  runId: string;
  eventId: string;
  venueId: string;
  title: string;
  sourceUrl: string | null;
  venueWebsiteUrl: string | null;
  requestId: string;
}) : Promise<ImportResult> {
  if (process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    return { attached: false, warning: null, imageUrl: null };
  }

  const event = await params.appDb.event.findUnique({
    where: { id: params.eventId },
    select: { featuredAssetId: true, featuredAsset: { select: { url: true } } },
  });

  if (event?.featuredAssetId || event?.featuredAsset?.url) {
    return { attached: false, warning: null, imageUrl: event.featuredAsset?.url ?? null };
  }

  const pageUrl = params.sourceUrl ?? params.venueWebsiteUrl;
  if (!pageUrl) {
    return { attached: false, warning: "image-import skipped: no source URL", imageUrl: null };
  }

  try {
    const htmlResponse = await fetchHtmlWithGuards(pageUrl, { maxBytes: 1_000_000 });
    const discoveredUrl = discoverEventImageUrl({
      sourceUrl: pageUrl,
      venueWebsiteUrl: params.venueWebsiteUrl,
      html: htmlResponse.html,
    });

    if (!discoveredUrl) {
      return { attached: false, warning: "image-import skipped: no discoverable image URL", imageUrl: null };
    }

    const image = await fetchImageWithGuards(discoveredUrl, {
      maxBytes: Number.parseInt(process.env.AI_INGEST_IMAGE_MAX_BYTES ?? "5000000", 10) || 5_000_000,
    });

    const uploaded = await uploadEventImageToBlob({
      venueId: params.venueId,
      candidateId: params.candidateId,
      sourceUrl: pageUrl,
      contentType: image.contentType,
      bytes: image.bytes,
    });

    // Canonical ingest image storage follows manual featured image semantics: Asset + Event.featuredAssetId.
    const asset = await params.appDb.asset.create({
      data: {
        ownerUserId: null,
        kind: "IMAGE",
        url: uploaded.url,
        filename: null,
        mime: image.contentType,
        sizeBytes: image.sizeBytes,
        alt: params.title,
      },
      select: { id: true, url: true },
    });

    await params.appDb.event.update({
      where: { id: params.eventId },
      data: {
        featuredAssetId: asset.id,
      },
      select: { id: true },
    });

    return { attached: true, warning: null, imageUrl: asset.url };
  } catch (error) {
    const warning = truncateWarning(`image-import failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("ingest_approval_image_import_failed", {
      requestId: params.requestId,
      runId: params.runId,
      candidateId: params.candidateId,
      eventId: params.eventId,
      warning,
    });
    return { attached: false, warning, imageUrl: null };
  }
}
