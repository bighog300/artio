import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { discoverEventImageUrl } from "@/lib/ingest/image-discovery";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadArtworkImageToBlob } from "@/lib/blob/upload-image";
import { logWarn } from "@/lib/logging";
import { markArtworkImageImportOutcome, normalizeImageImportError, normalizeImageImportWarning } from "@/lib/ingest/candidate-observability";

type ImportResult = { attached: boolean; warning: string | null; imageUrl: string | null };

export async function importApprovedArtworkImage(params: {
  appDb: {
    artwork: {
      findUnique: (args: {
        where: { id: string };
        select: { featuredAssetId: true; featuredAsset: { select: { url: true } } };
      }) => Promise<{ featuredAssetId: string | null; featuredAsset: { url: string | null } | null } | null>;
      update: (args: { where: { id: string }; data: { featuredAssetId: string } }) => Promise<{ id: string }>;
    };
    artworkImage: {
      create: (args: {
        data: {
          artworkId: string;
          assetId: string;
          alt: string;
          sortOrder: number;
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
    ingestExtractedArtwork?: {
      updateMany: (args: {
        where: { id: string };
        data: { imageImportStatus: "not_attempted" | "imported" | "failed" | "no_image_found"; imageImportWarning: string | null };
      }) => Promise<unknown>;
    };
  };
  candidateId: string;
  runId: string;
  artworkId: string;
  title: string;
  sourceUrl: string | null;
  candidateImageUrl?: string | null;
  requestId: string;
}, deps: {
  fetchImageWithGuards: typeof fetchImageWithGuards;
  uploadArtworkImageToBlob: typeof uploadArtworkImageToBlob;
  fetchHtmlWithGuards: typeof fetchHtmlWithGuards;
} = {
  fetchImageWithGuards,
  uploadArtworkImageToBlob,
  fetchHtmlWithGuards,
}) : Promise<ImportResult> {
  const persistOutcome = async (status: "imported" | "failed" | "no_image_found", warning: string | null) => {
    if (!params.appDb.ingestExtractedArtwork) return;
    await markArtworkImageImportOutcome(
      { ingestExtractedArtwork: params.appDb.ingestExtractedArtwork },
      params.candidateId,
      status,
      normalizeImageImportWarning(warning),
    );
  };

  if (process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    await persistOutcome("failed", "image_import_disabled");
    return { attached: false, warning: "image_import_disabled", imageUrl: null };
  }

  const artwork = await params.appDb.artwork.findUnique({
    where: { id: params.artworkId },
    select: { featuredAssetId: true, featuredAsset: { select: { url: true } } },
  });

  if (artwork?.featuredAssetId || artwork?.featuredAsset?.url) {
    await persistOutcome("imported", "image_already_attached");
    return { attached: false, warning: "image_already_attached", imageUrl: artwork.featuredAsset?.url ?? null };
  }

  let imageUrl = params.candidateImageUrl ?? null;

  if (!imageUrl && params.sourceUrl) {
    try {
      const fetched = await deps.fetchHtmlWithGuards(params.sourceUrl, {
        maxBytes: 1_000_000,
      });
      imageUrl = discoverEventImageUrl({
        sourceUrl: params.sourceUrl,
        html: fetched.html,
      });
    } catch {
      // fallback failed — continue with null imageUrl
    }
  }

  if (!imageUrl) {
    await persistOutcome("no_image_found", "no_image_found");
    return {
      attached: false,
      warning: "no_image_found",
      imageUrl: null,
    };
  }

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    await persistOutcome("failed", "image_fetch_failed");
    return { attached: false, warning: "image_fetch_failed", imageUrl: null };
  }

  try {
    const image = await deps.fetchImageWithGuards(imageUrl, {
      maxBytes: Number.parseInt(process.env.AI_INGEST_IMAGE_MAX_BYTES ?? "5000000", 10) || 5_000_000,
    });

    const uploaded = await deps.uploadArtworkImageToBlob({
      artworkId: params.artworkId,
      candidateId: params.candidateId,
      sourceUrl: params.sourceUrl ?? imageUrl,
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

    await params.appDb.artworkImage.create({
      data: {
        artworkId: params.artworkId,
        assetId: asset.id,
        alt: params.title,
        sortOrder: 0,
      },
    });

    await params.appDb.artwork.update({
      where: { id: params.artworkId },
      data: { featuredAssetId: asset.id },
    });

    await persistOutcome("imported", null);
    return { attached: true, warning: null, imageUrl: asset.url };
  } catch (error) {
    const warning = normalizeImageImportError(error);
    logWarn({ message: "ingest_approval_artwork_image_import_failed",
      requestId: params.requestId,
      runId: params.runId,
      candidateId: params.candidateId,
      artworkId: params.artworkId,
      warning,
      imageErrorCode: warning,
    });
    await persistOutcome("failed", warning);
    return { attached: false, warning, imageUrl: null };
  }
}
