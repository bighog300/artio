import { importApprovedArtistImage } from "@/lib/ingest/import-approved-artist-image";
import { getSearchProvider } from "@/lib/ingest/search";
import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";
import { logError } from "@/lib/logging";

export async function enrichArtistImage(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const artist = await args.db.artist.findUnique({
    where: { id: args.entityId },
    select: { id: true, name: true, featuredAssetId: true, websiteUrl: true, instagramUrl: true },
  });

  if (!artist) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "artist_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.ARTIST_IMAGE.queryTemplate, { name: artist.name });
  let searchUrl: string | null = null;
  try {
    if (args.settings.searchEnabled !== false && query) {
      const provider = getSearchProvider(args.searchProvider, args.settings);
      const results = await provider.search(query, 5);
      searchUrl = results[0]?.url ?? null;
    }
  } catch (searchError) {
    const errorDetail = searchError instanceof Error
      ? searchError.message
      : String(searchError);
    logError({
      message: "enrichment_search_failed",
      template: "ARTIST_IMAGE",
      entityId: args.entityId,
      provider: args.searchProvider,
      errorDetail,
    });
  }

  const before = artist.featuredAssetId;

  if (args.dryRun) {
    return {
      status: "success",
      fieldsChanged: ["featuredAssetId"],
      fieldsBefore: { featuredAssetId: before },
      fieldsAfter: { featuredAssetId: "PENDING_IMAGE" },
      confidenceBefore: before ? 100 : 0,
      confidenceAfter: 100,
      searchUrl,
    };
  }

  const result = await importApprovedArtistImage({
    appDb: args.db,
    artistId: artist.id,
    name: artist.name,
    websiteUrl: artist.websiteUrl,
    sourceUrl: searchUrl,
    instagramUrl: artist.instagramUrl,
    requestId: `enrich-artist-image-${artist.id}`,
  });

  // Reset completeness so scoring cron rescores
  await args.db.artist.update({
    where: { id: args.entityId },
    data: { completenessUpdatedAt: null },
  });

  const afterArtist = await args.db.artist.findUnique({ where: { id: artist.id }, select: { featuredAssetId: true } });
  const after = afterArtist?.featuredAssetId ?? null;

  return {
    status: result.attached ? "success" : "skipped",
    fieldsChanged: result.attached ? ["featuredAssetId"] : [],
    fieldsBefore: { featuredAssetId: before },
    fieldsAfter: { featuredAssetId: after },
    confidenceBefore: before ? 100 : 0,
    confidenceAfter: after ? 100 : 0,
    searchUrl,
    reason: result.warning ?? undefined,
  };
}
