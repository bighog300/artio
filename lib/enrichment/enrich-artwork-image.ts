import { computeArtworkCompleteness } from "@/lib/artwork-completeness";
import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { getSearchProvider } from "@/lib/ingest/search";

export async function enrichArtworkImage(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const artwork = await args.db.artwork.findUnique({
    where: { id: args.entityId },
    select: {
      id: true,
      title: true,
      featuredAssetId: true,
      description: true,
      medium: true,
      year: true,
      dimensions: true,
      provenance: true,
      _count: { select: { images: true } },
      ingestCandidate: { select: { id: true, sourceUrl: true, imageUrl: true } },
    },
  });

  if (!artwork) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "artwork_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.ARTWORK_IMAGE.queryTemplate, { title: artwork.title });
  let searchUrl: string | null = null;
  if (args.settings.searchEnabled !== false && query) {
    const provider = getSearchProvider(args.searchProvider, args.settings);
    const results = await provider.search(query, 5);
    searchUrl = results[0]?.url ?? null;
  }

  const confidenceBefore = computeArtworkCompleteness({
    title: artwork.title,
    description: artwork.description,
    medium: artwork.medium,
    year: artwork.year,
    featuredAssetId: artwork.featuredAssetId,
    dimensions: artwork.dimensions,
    provenance: artwork.provenance,
  }, artwork._count.images).scorePct;

  const result = await importApprovedArtworkImage({
    appDb: args.db,
    candidateId: artwork.ingestCandidate?.id ?? artwork.id,
    runId: artwork.ingestCandidate?.id ?? artwork.id,
    artworkId: artwork.id,
    title: artwork.title,
    sourceUrl: artwork.ingestCandidate?.sourceUrl ?? searchUrl,
    candidateImageUrl: artwork.ingestCandidate?.imageUrl ?? null,
    requestId: `enrich-artwork-image-${artwork.id}`,
  });

  const updated = await args.db.artwork.update({
    where: { id: artwork.id },
    data: { completenessUpdatedAt: null },
    select: {
      featuredAssetId: true,
      title: true,
      description: true,
      medium: true,
      year: true,
      dimensions: true,
      provenance: true,
      _count: { select: { images: true } },
    },
  });

  const confidenceAfter = computeArtworkCompleteness({
    title: updated.title,
    description: updated.description,
    medium: updated.medium,
    year: updated.year,
    featuredAssetId: updated.featuredAssetId,
    dimensions: updated.dimensions,
    provenance: updated.provenance,
  }, updated._count.images).scorePct;

  return {
    status: result.attached ? "success" : "skipped",
    fieldsChanged: result.attached ? ["featuredAssetId"] : [],
    fieldsBefore: { featuredAssetId: artwork.featuredAssetId },
    fieldsAfter: { featuredAssetId: updated.featuredAssetId },
    confidenceBefore,
    confidenceAfter,
    searchUrl,
    reason: result.warning ?? undefined,
  };
}
