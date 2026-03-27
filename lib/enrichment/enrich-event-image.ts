import { computeConfidence } from "@/lib/ingest/confidence";
import { importApprovedEventImage } from "@/lib/ingest/import-approved-event-image";
import { getSearchProvider } from "@/lib/ingest/search";
import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";

export async function enrichEventImage(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const event = await args.db.event.findUnique({
    where: { id: args.entityId },
    select: {
      id: true,
      title: true,
      description: true,
      startAt: true,
      endAt: true,
      timezone: true,
      featuredAssetId: true,
      venueId: true,
      venue: { select: { name: true, websiteUrl: true } },
      ingestExtractedCandidate: { select: { id: true, runId: true, imageUrl: true, sourceUrl: true } },
    },
  });

  if (!event) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "event_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.EVENT_IMAGE.queryTemplate, { title: event.title });
  let searchUrl: string | null = null;
  if (args.settings.searchEnabled !== false && query) {
    const search = getSearchProvider(args.searchProvider, args.settings);
    const results = await search.search(query, 5);
    searchUrl = results[0]?.url ?? null;
  }

  const confidenceBefore = computeConfidence({
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    locationText: event.venue?.name ?? null,
    description: event.description,
    sourceUrl: event.ingestExtractedCandidate?.sourceUrl ?? searchUrl,
    artistNames: [],
    imageUrl: null,
  }, { venueName: event.venue?.name ?? null }).score;

  if (args.dryRun) {
    return {
      status: "success",
      fieldsChanged: ["featuredAssetId"],
      fieldsBefore: { featuredAssetId: event.featuredAssetId },
      fieldsAfter: { featuredAssetId: "PENDING_IMAGE" },
      confidenceBefore,
      confidenceAfter: event.featuredAssetId ? confidenceBefore : confidenceBefore + 10,
      searchUrl,
    };
  }

  const result = await importApprovedEventImage({
    appDb: args.db,
    candidateId: event.ingestExtractedCandidate?.id ?? event.id,
    runId: event.ingestExtractedCandidate?.runId ?? event.id,
    eventId: event.id,
    venueId: event.venueId ?? "",
    title: event.title,
    sourceUrl: event.ingestExtractedCandidate?.sourceUrl ?? searchUrl,
    venueWebsiteUrl: event.venue?.websiteUrl ?? null,
    candidateImageUrl: event.ingestExtractedCandidate?.imageUrl ?? null,
    requestId: `enrich-event-image-${event.id}`,
  });

  const updated = await args.db.event.findUnique({ where: { id: event.id }, select: { featuredAssetId: true } });

  return {
    status: result.attached ? "success" : "skipped",
    fieldsChanged: result.attached ? ["featuredAssetId"] : [],
    fieldsBefore: { featuredAssetId: event.featuredAssetId },
    fieldsAfter: { featuredAssetId: updated?.featuredAssetId ?? null },
    confidenceBefore,
    confidenceAfter: updated?.featuredAssetId ? confidenceBefore + 10 : confidenceBefore,
    searchUrl,
    reason: result.warning ?? undefined,
  };
}
