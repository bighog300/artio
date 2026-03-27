import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { discoverEventImageUrl } from "@/lib/ingest/image-discovery";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadArtistImageToBlob } from "@/lib/blob/upload-image";
import { logWarn } from "@/lib/logging";
import { markArtistImageImportOutcome, normalizeImageImportError, normalizeImageImportWarning } from "@/lib/ingest/candidate-observability";

type AppDb = {
  artist: {
    findUnique: (args: { where: { id: string }; select: { featuredAssetId: true } }) => Promise<{ featuredAssetId: string | null } | null>;
    update: (args: { where: { id: string }; data: { featuredAssetId: string } }) => Promise<unknown>;
  };
  artistImage: {
    create: (args: { data: { artistId: string; assetId: string; url: string; alt: string; sortOrder: number } }) => Promise<{ id: string }>;
  };
  asset: {
    create: (args: { data: { ownerUserId: null; kind: "IMAGE"; url: string; filename: null; mime: string; sizeBytes: number; alt: string }; select: { id: true; url: true } }) => Promise<{ id: string; url: string }>;
  };
  ingestExtractedArtist?: {
    updateMany: (args: {
      where: { id: string };
      data: { imageImportStatus: "not_attempted" | "imported" | "failed" | "no_image_found"; imageImportWarning: string | null };
    }) => Promise<unknown>;
  };
};

export async function importApprovedArtistImage(params: {
  appDb: AppDb;
  artistId: string;
  name: string;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
  instagramUrl?: string | null;
  requestId: string;
  candidateId?: string;
}, deps: {
  fetchHtmlWithGuards: typeof fetchHtmlWithGuards;
  fetchImageWithGuards: typeof fetchImageWithGuards;
  uploadArtistImageToBlob: typeof uploadArtistImageToBlob;
} = {
  fetchHtmlWithGuards,
  fetchImageWithGuards,
  uploadArtistImageToBlob,
}): Promise<{ attached: boolean; warning: string | null; imageUrl: string | null }> {
  const persistOutcome = async (status: "imported" | "failed" | "no_image_found", warning: string | null) => {
    if (!params.candidateId || !params.appDb.ingestExtractedArtist) return;
    await markArtistImageImportOutcome(
      { ingestExtractedArtist: params.appDb.ingestExtractedArtist },
      params.candidateId,
      status,
      normalizeImageImportWarning(warning),
    );
  };

  if (process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    await persistOutcome("failed", "image_import_disabled");
    return { attached: false, warning: "image_import_disabled", imageUrl: null };
  }

  const existing = await params.appDb.artist.findUnique({
    where: { id: params.artistId },
    select: { featuredAssetId: true },
  });
  if (existing?.featuredAssetId) {
    await persistOutcome("imported", "image_already_attached");
    return { attached: false, warning: "image_already_attached", imageUrl: null };
  }

  // Build the URL list: personal site first, Wikipedia/source second,
  // Instagram last (unreliable — attempted silently, never warned on failure)
  const urlsToTry: string[] = [
    params.websiteUrl,
    params.sourceUrl,
    params.instagramUrl,
  ]
    .filter((url): url is string => Boolean(url?.startsWith("http")))
    .filter((url, index, arr) => arr.indexOf(url) === index);

  let imageUrl: string | null = null;
  for (const pageUrl of urlsToTry) {
    try {
      const { html } = await deps.fetchHtmlWithGuards(pageUrl, {
        maxBytes: 1_000_000,
      });
      const discovered = discoverEventImageUrl({
        sourceUrl: pageUrl,
        html,
      });
      if (discovered) {
        imageUrl = discovered;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!imageUrl) {
    await persistOutcome("no_image_found", "no_image_found");
    return { attached: false, warning: "no_image_found", imageUrl: null };
  }

  try {
    const image = await deps.fetchImageWithGuards(imageUrl, {
      maxBytes: Number.parseInt(process.env.AI_INGEST_IMAGE_MAX_BYTES ?? "5000000", 10) || 5_000_000,
    });

    const uploaded = await deps.uploadArtistImageToBlob({
      artistId: params.artistId,
      sourceUrl: imageUrl,
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
        alt: params.name,
      },
      select: { id: true, url: true },
    });

    await params.appDb.artistImage.create({
      data: {
        artistId: params.artistId,
        assetId: asset.id,
        url: asset.url,
        alt: params.name,
        sortOrder: 0,
      },
    });

    await params.appDb.artist.update({
      where: { id: params.artistId },
      data: { featuredAssetId: asset.id },
    });

    await persistOutcome("imported", null);
    return { attached: true, warning: null, imageUrl: asset.url };
  } catch (error) {
    const warning = normalizeImageImportError(error);
    logWarn({ message: "ingest_artist_image_import_failed", requestId: params.requestId, artistId: params.artistId, warning, imageErrorCode: warning });
    await persistOutcome("failed", warning);
    return { attached: false, warning, imageUrl: null };
  }
}
