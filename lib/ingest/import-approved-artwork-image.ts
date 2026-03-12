import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadArtworkImageToBlob } from "@/lib/blob/upload-image";

type ImportResult = { attached: boolean; warning: string | null; imageUrl: string | null };

const MAX_WARNING_DETAIL = 400;

function truncateWarning(input: string): string {
  return input.length > MAX_WARNING_DETAIL ? `${input.slice(0, MAX_WARNING_DETAIL - 1)}…` : input;
}

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
} = {
  fetchImageWithGuards,
  uploadArtworkImageToBlob,
}) : Promise<ImportResult> {
  if (process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    return { attached: false, warning: "image-import disabled: set AI_INGEST_IMAGE_ENABLED=1 to enable", imageUrl: null };
  }

  const artwork = await params.appDb.artwork.findUnique({
    where: { id: params.artworkId },
    select: { featuredAssetId: true, featuredAsset: { select: { url: true } } },
  });

  if (artwork?.featuredAssetId || artwork?.featuredAsset?.url) {
    return { attached: false, warning: null, imageUrl: artwork.featuredAsset?.url ?? null };
  }

  const imageUrl = params.candidateImageUrl ?? null;
  if (!imageUrl) {
    return { attached: false, warning: null, imageUrl: null };
  }

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return { attached: false, warning: "image-import skipped: resolved image URL is not absolute", imageUrl: null };
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

    return { attached: true, warning: null, imageUrl: asset.url };
  } catch (error) {
    const warning = truncateWarning(`image-import failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("ingest_approval_artwork_image_import_failed", {
      requestId: params.requestId,
      runId: params.runId,
      candidateId: params.candidateId,
      artworkId: params.artworkId,
      warning,
    });
    return { attached: false, warning, imageUrl: null };
  }
}
