import type { PrismaClient } from "@prisma/client";
import { resolveRelativeHttpUrl } from "@/lib/ingest/url-utils";
import { logWarn } from "@/lib/logging";

export async function importArtistAvatarImage(args: {
  db: PrismaClient;
  artistId: string;
  imageUrl: string;
}): Promise<void> {
  const resolvedUrl = resolveRelativeHttpUrl(args.imageUrl, args.imageUrl);
  if (!resolvedUrl) return;

  try {
    const response = await fetch(resolvedUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ArtioBot/2.0; +https://artio.co)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return;

    const asset = await args.db.asset.create({
      data: {
        kind: "IMAGE",
        url: resolvedUrl,
        mimeType: contentType,
        altText: null,
        sourceType: "AI_EXTRACTED",
      },
      select: { id: true },
    });

    await args.db.artist.update({
      where: { id: args.artistId },
      data: { featuredAssetId: asset.id },
    });
  } catch (err) {
    logWarn({
      message: "import_artist_avatar_image_failed",
      artistId: args.artistId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
