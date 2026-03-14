import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { fetchImageWithGuards } from "@/lib/ingest/fetch-image";
import { uploadArtistImageToBlob } from "@/lib/blob/upload-image";

type ImportResult = { attached: boolean; warning: string | null; imageUrl: string | null };

const MAX_WARNING_DETAIL = 400;

function truncateWarning(input: string): string {
  return input.length > MAX_WARNING_DETAIL ? `${input.slice(0, MAX_WARNING_DETAIL - 1)}…` : input;
}

function extractOgImageUrl(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const property = /\bproperty\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]?.trim()?.toLowerCase();
    if (property !== "og:image") continue;

    const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]?.trim();
    if (content) return content;
  }

  return null;
}

function toAbsoluteUrl(raw: string | null | undefined, baseUrl?: string | null): string | null {
  if (!raw) return null;
  try {
    return baseUrl ? new URL(raw, baseUrl).toString() : new URL(raw).toString();
  } catch {
    return null;
  }
}

export async function importApprovedArtistImage(params: {
  appDb: {
    artist: {
      findUnique: (args: {
        where: { id: string };
        select: { featuredAssetId: true; featuredAsset: { select: { url: true } } };
      }) => Promise<{ featuredAssetId: string | null; featuredAsset: { url: string | null } | null } | null>;
      update: (args: { where: { id: string }; data: { featuredAssetId: string } }) => Promise<{ id: string }>;
    };
    artistImage: {
      create: (args: {
        data: {
          artistId: string;
          assetId: string;
          url: string;
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
  artistId: string;
  candidateId: string;
  name: string;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  sourceUrl?: string | null;
  requestId: string;
}, deps: {
  fetchHtmlWithGuards: typeof fetchHtmlWithGuards;
  fetchImageWithGuards: typeof fetchImageWithGuards;
  uploadArtistImageToBlob: typeof uploadArtistImageToBlob;
} = {
  fetchHtmlWithGuards,
  fetchImageWithGuards,
  uploadArtistImageToBlob,
}): Promise<ImportResult> {
  if (process.env.AI_INGEST_IMAGE_ENABLED !== "1") {
    return { attached: false, warning: "image-import disabled: set AI_INGEST_IMAGE_ENABLED=1 to enable", imageUrl: null };
  }

  const artist = await params.appDb.artist.findUnique({
    where: { id: params.artistId },
    select: { featuredAssetId: true, featuredAsset: { select: { url: true } } },
  });

  if (artist?.featuredAssetId || artist?.featuredAsset?.url) {
    return { attached: false, warning: null, imageUrl: artist.featuredAsset?.url ?? null };
  }

  const websiteUrl = params.websiteUrl?.trim() ?? null;
  const sourceUrl = params.sourceUrl?.trim() ?? null;
  const sourceCandidates = [
    { pageUrl: websiteUrl, baseUrl: websiteUrl },
    { pageUrl: sourceUrl && sourceUrl !== websiteUrl ? sourceUrl : null, baseUrl: sourceUrl },
  ];

  let resolvedImageUrl: string | null = null;
  let resolvedSourceUrl: string | null = null;

  for (const candidate of sourceCandidates) {
    if (!candidate.pageUrl) continue;
    try {
      const page = await deps.fetchHtmlWithGuards(candidate.pageUrl, {
        maxBytes: Number.parseInt(process.env.AI_INGEST_HTML_MAX_BYTES ?? "1000000", 10) || 1_000_000,
      });
      const ogImage = extractOgImageUrl(page.html);
      const absolute = toAbsoluteUrl(ogImage, page.finalUrl || candidate.baseUrl);
      if (absolute && (absolute.startsWith("http://") || absolute.startsWith("https://"))) {
        resolvedImageUrl = absolute;
        resolvedSourceUrl = candidate.pageUrl;
        break;
      }
    } catch {
      // continue to next source candidate
    }
  }

  if (!resolvedImageUrl) {
    return { attached: false, warning: null, imageUrl: null };
  }

  try {
    const image = await deps.fetchImageWithGuards(resolvedImageUrl, {
      maxBytes: Number.parseInt(process.env.AI_INGEST_IMAGE_MAX_BYTES ?? "5000000", 10) || 5_000_000,
    });

    const uploaded = await deps.uploadArtistImageToBlob({
      artistId: params.artistId,
      candidateId: params.candidateId,
      sourceUrl: resolvedSourceUrl ?? resolvedImageUrl,
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

    return { attached: true, warning: null, imageUrl: asset.url };
  } catch (error) {
    const warning = truncateWarning(`image-import failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("ingest_approval_artist_image_import_failed", {
      requestId: params.requestId,
      candidateId: params.candidateId,
      artistId: params.artistId,
      warning,
    });
    return { attached: false, warning, imageUrl: null };
  }
}
