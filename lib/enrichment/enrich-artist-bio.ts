import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { scoreArtistCandidate } from "@/lib/ingest/artist-confidence";
import { getSearchProvider } from "@/lib/ingest/search";
import { ENRICHMENT_TEMPLATE_BY_KEY } from "@/lib/enrichment/templates";
import { buildTemplateQuery, shouldApply, type EnrichItemResult, type EnrichmentFnArgs } from "@/lib/enrichment/types";

export async function enrichArtistBio(
  args: EnrichmentFnArgs & { entityId: string },
): Promise<EnrichItemResult> {
  const artist = await args.db.artist.findUnique({
    where: { id: args.entityId },
    select: {
      id: true,
      name: true,
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      mediums: true,
      eventArtists: { select: { eventId: true }, take: 1 },
    },
  });

  if (!artist) {
    return { status: "failed", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl: null, reason: "artist_not_found" };
  }

  const query = buildTemplateQuery(ENRICHMENT_TEMPLATE_BY_KEY.ARTIST_BIO.queryTemplate, { name: artist.name });
  let searchUrl: string | null = null;
  if (args.settings.searchEnabled !== false && query) {
    const provider = getSearchProvider(args.searchProvider, args.settings);
    const results = await provider.search(query, 5);
    searchUrl = results[0]?.url ?? null;
  }

  const eventId = artist.eventArtists[0]?.eventId;
  if (!eventId) {
    return { status: "skipped", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: null, confidenceAfter: null, searchUrl, reason: "artist_has_no_event_context" };
  }

  const beforeConfidence = scoreArtistCandidate({
    name: artist.name,
    bio: artist.bio,
    websiteUrl: artist.websiteUrl,
    instagramUrl: artist.instagramUrl,
    twitterUrl: artist.twitterUrl,
    mediums: artist.mediums,
    searchQuery: query,
    wikipediaMatch: !!searchUrl?.includes("wikipedia.org"),
  }).score;

  const discovered = await discoverArtist({
    db: args.db,
    artistName: artist.name,
    eventId,
    settings: {
      ...args.settings,
      googlePseApiKey: args.settings.googlePseApiKey,
      googlePseCx: args.settings.googlePseCx,
      artistBioProvider: args.settings.artistBioProvider,
      artistBioSystemPrompt: args.settings.artistBioSystemPrompt,
    },
  });

  const candidate = discovered.candidateId
    ? await args.db.ingestExtractedArtist.findUnique({
        where: { id: discovered.candidateId },
        select: { bio: true, websiteUrl: true, instagramUrl: true, twitterUrl: true, mediums: true },
      })
    : null;

  const patch: { bio?: string; websiteUrl?: string; instagramUrl?: string; twitterUrl?: string; mediums?: string[] } = {};
  if (candidate && shouldApply(artist.bio, candidate.bio, args.settings.gapFilter)) patch.bio = candidate.bio ?? undefined;
  if (candidate && shouldApply(artist.websiteUrl, candidate.websiteUrl, args.settings.gapFilter)) patch.websiteUrl = candidate.websiteUrl ?? undefined;
  if (candidate && shouldApply(artist.instagramUrl, candidate.instagramUrl, args.settings.gapFilter)) patch.instagramUrl = candidate.instagramUrl ?? undefined;
  if (candidate && shouldApply(artist.twitterUrl, candidate.twitterUrl, args.settings.gapFilter)) patch.twitterUrl = candidate.twitterUrl ?? undefined;
  if (candidate?.mediums?.length && (artist.mediums.length === 0 || args.settings.gapFilter === "ALL")) patch.mediums = candidate.mediums;

  if (Object.keys(patch).length === 0) {
    return { status: "skipped", fieldsChanged: [], fieldsBefore: {}, fieldsAfter: {}, confidenceBefore: beforeConfidence, confidenceAfter: beforeConfidence, searchUrl, reason: "no_missing_fields" };
  }

  const updated = await args.db.artist.update({
    where: { id: artist.id },
    data: patch,
    select: { bio: true, websiteUrl: true, instagramUrl: true, twitterUrl: true, mediums: true, name: true },
  });

  const afterConfidence = scoreArtistCandidate({
    name: updated.name,
    bio: updated.bio,
    websiteUrl: updated.websiteUrl,
    instagramUrl: updated.instagramUrl,
    twitterUrl: updated.twitterUrl,
    mediums: updated.mediums,
    searchQuery: query,
    wikipediaMatch: !!searchUrl?.includes("wikipedia.org"),
  }).score;

  return {
    status: "success",
    fieldsChanged: Object.keys(patch),
    fieldsBefore: { bio: artist.bio, websiteUrl: artist.websiteUrl, instagramUrl: artist.instagramUrl, twitterUrl: artist.twitterUrl, mediums: artist.mediums },
    fieldsAfter: { bio: updated.bio, websiteUrl: updated.websiteUrl, instagramUrl: updated.instagramUrl, twitterUrl: updated.twitterUrl, mediums: updated.mediums },
    confidenceBefore: beforeConfidence,
    confidenceAfter: afterConfidence,
    searchUrl,
  };
}
