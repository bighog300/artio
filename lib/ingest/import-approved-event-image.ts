import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { discoverEventImageUrl } from "@/lib/ingest/image-discovery";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadEventImageToBlob } from "@/lib/blob/upload-image";
import { logWarn } from "@/lib/logging";
import { normalizeImageImportError } from "@/lib/ingest/candidate-observability";

type ImportResult = { attached: boolean; warning: string | null; imageUrl: string | null };

export async function importApprovedEventImage(params: {
  appDb: {
    event: {
      findUnique: (args: {
        where: { id: string };
        select: { featuredAssetId: true; featuredAsset: { select: { url: true } } };
      }) => Promise<{ featuredAssetId: string | null; featuredAsset: { url: string | null } | null } | null>;
    };
    eventImage: {
      create: (args: {
        data: {
          eventId: string;
          assetId: string;
          url: string;
          alt: string;
          contentType: string;
          sizeBytes: number;
          sortOrder: number;
          isPrimary: boolean;
        };
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
  candidateImageUrl?: string | null;
  requestId: string;
  skipIngestGate?: boolean;
}, deps: {
  fetchHtmlWithGuards: typeof fetchHtmlWithGuards;
  fetchImageWithGuards: typeof fetchImageWithGuards;
  uploadEventImageToBlob: typeof uploadEventImageToBlob;
} = {
  fetchHtmlWithGuards,
  fetchImageWithGuards,
  uploadEventImageToBlob,
}) : Promise<ImportResult> {
  if (!params.skipIngestGate && process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    return { attached: false, warning: "image_import_disabled", imageUrl: null };
  }

  const event = await params.appDb.event.findUnique({
    where: { id: params.eventId },
    select: { featuredAssetId: true, featuredAsset: { select: { url: true } } },
  });

  if (event?.featuredAssetId || event?.featuredAsset?.url) {
    return { attached: false, warning: "image_already_attached", imageUrl: event.featuredAsset?.url ?? null };
  }

  const pageUrl = params.sourceUrl ?? params.venueWebsiteUrl;
  if (!pageUrl) {
    return { attached: false, warning: "no_image_found", imageUrl: null };
  }

  try {
    const quickUrl = discoverEventImageUrl({
      candidateImageUrl: params.candidateImageUrl ?? null,
      sourceUrl: pageUrl,
      venueWebsiteUrl: params.venueWebsiteUrl,
    });

    const resolvedUrl = quickUrl
      ?? await deps.fetchHtmlWithGuards(pageUrl, { maxBytes: 1_000_000 }).then((htmlResponse) => discoverEventImageUrl({
        sourceUrl: pageUrl,
        venueWebsiteUrl: params.venueWebsiteUrl,
        html: htmlResponse.html,
      }));

    if (!resolvedUrl) {
      return { attached: false, warning: "no_image_found", imageUrl: null };
    }

    if (!resolvedUrl.startsWith("http://") && !resolvedUrl.startsWith("https://")) {
      return { attached: false, warning: "image_fetch_failed", imageUrl: null };
    }

    const image = await deps.fetchImageWithGuards(resolvedUrl, {
      maxBytes: Number.parseInt(process.env.AI_INGEST_IMAGE_MAX_BYTES ?? "5000000", 10) || 5_000_000,
    });

    const uploaded = await deps.uploadEventImageToBlob({
      venueId: params.venueId,
      candidateId: params.candidateId,
      sourceUrl: pageUrl,
      contentType: image.contentType,
      bytes: image.bytes,
    });

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

    await params.appDb.eventImage.create({
      data: {
        eventId: params.eventId,
        assetId: asset.id,
        url: uploaded.url,
        alt: params.title,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
        sortOrder: 0,
        isPrimary: true,
      },
    });

    return { attached: true, warning: null, imageUrl: asset.url };
  } catch (error) {
    console.error("import_approved_event_image_failed", {
      eventId: params.eventId,
      candidateId: params.candidateId,
      requestId: params.requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const warning = normalizeImageImportError(error);
    logWarn({ message: "ingest_approval_image_import_failed",
      requestId: params.requestId,
      runId: params.runId,
      candidateId: params.candidateId,
      eventId: params.eventId,
      warning,
      imageErrorCode: warning,
    });
    return { attached: false, warning, imageUrl: null };
  }
}
