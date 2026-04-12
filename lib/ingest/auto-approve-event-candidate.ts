import type { PrismaClient } from "@prisma/client";
import { inferTimezoneFromLatLng } from "@/lib/timezone";
import { slugifyEventTitle, ensureUniqueEventSlugWithDeps } from "@/lib/event-slug";
import { importApprovedEventImage } from "@/lib/ingest/import-approved-event-image";
import { discoverArtist } from "@/lib/ingest/artist-discovery";
import { extractArtworksForEvent } from "@/lib/ingest/artwork-extraction";
import { autoTagEvent } from "@/lib/ingest/auto-tag-event";
import { logWarn } from "@/lib/logging";

export async function autoApproveEventCandidate(args: {
  candidateId: string;
  db: PrismaClient;
  autoPublish: boolean;
}): Promise<{ eventId: string; published: boolean } | null> {
  try {
    const candidate = await args.db.ingestExtractedEvent.findUnique({
      where: { id: args.candidateId },
      select: {
        id: true,
        runId: true,
        venueId: true,
        sourceUrl: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        timezone: true,
        locationText: true,
        imageUrl: true,
        blobImageUrl: true,
        artistNames: true,
        status: true,
        createdEventId: true,
        run: { select: { id: true, venueId: true, sourceUrl: true, errorDetail: true } },
        venue: { select: { id: true, timezone: true, lat: true, lng: true, websiteUrl: true } },
      },
    });

    if (!candidate || candidate.status !== "PENDING") return null;

    if (candidate.createdEventId) {
      await args.db.ingestExtractedEvent.update({
        where: { id: candidate.id },
        data: { status: "APPROVED" },
      });
      return { eventId: candidate.createdEventId, published: false };
    }

    let resolvedTimezone = candidate.timezone ?? candidate.venue?.timezone;
    if (!resolvedTimezone && candidate.venue?.lat != null && candidate.venue?.lng != null) {
      resolvedTimezone = inferTimezoneFromLatLng(candidate.venue.lat, candidate.venue.lng);
      await args.db.venue.update({ where: { id: candidate.venue.id }, data: { timezone: resolvedTimezone } });
    }

    if (!candidate.startAt || !resolvedTimezone) return null;

    const requiredStartAt = candidate.startAt;
    const requiredTimezone = resolvedTimezone;

    const approved = await args.db.$transaction(async (tx) => {
      const baseSlug = slugifyEventTitle(candidate.title);
      const slug = await ensureUniqueEventSlugWithDeps(
        { findBySlug: (value) => tx.event.findUnique({ where: { slug: value }, select: { id: true } }) },
        baseSlug,
      );

      const createdEvent = await tx.event.create({
        data: {
          venueId: candidate.venueId,
          title: candidate.title,
          description: candidate.description,
          startAt: requiredStartAt,
          endAt: candidate.endAt,
          timezone: requiredTimezone,
          slug,
          isPublished: false,
          isAiExtracted: true,
          ingestSourceRunId: candidate.runId,
        },
        select: { id: true, title: true, description: true },
      });

      let matchedArtists: Array<{ id: string; name: string }> = [];
      matchedArtists = candidate.artistNames.length > 0
        ? await tx.artist.findMany({
          where: {
            isPublished: true,
            deletedAt: null,
            OR: candidate.artistNames.map((name) => ({
              name: { equals: name, mode: "insensitive" as const },
            })),
          },
          select: { id: true, name: true },
        })
        : [];

      if (matchedArtists.length > 0) {
        await tx.eventArtist.createMany({
          data: matchedArtists.map((artist) => ({ eventId: createdEvent.id, artistId: artist.id })),
          skipDuplicates: true,
        });
      }

      const unmatchedNames = (candidate.artistNames ?? []).filter(
        (name) => !matchedArtists.some((artist) => artist.name.toLowerCase() === name.toLowerCase()),
      );

      const settings = await tx.siteSettings.findUnique({
        where: { id: "default" },
        select: {
          artworkExtractionProvider: true,
          braveSearchApiKey: true,
          googlePseApiKey: true,
          googlePseCx: true,
          artistLookupProvider: true,
          artistBioProvider: true,
          artistBioSystemPrompt: true,
          autoTagEnabled: true,
          autoTagProvider: true,
          autoTagModel: true,
          geminiApiKey: true,
          anthropicApiKey: true,
          openAiApiKey: true,
        },
      });

      await tx.ingestExtractedEvent.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", createdEventId: createdEvent.id },
      });

      return {
        createdEvent,
        unmatchedNames,
        artistSettings: {
          braveSearchApiKey: settings?.braveSearchApiKey ?? process.env.BRAVE_SEARCH_API_KEY,
          googlePseApiKey: settings?.googlePseApiKey ?? process.env.GOOGLE_PSE_API_KEY,
          googlePseCx: settings?.googlePseCx ?? process.env.GOOGLE_PSE_CX,
          artistLookupProvider: settings?.artistLookupProvider,
          artistBioProvider: settings?.artistBioProvider,
          geminiApiKey: settings?.geminiApiKey,
          anthropicApiKey: settings?.anthropicApiKey,
          openAiApiKey: settings?.openAiApiKey,
          artistBioSystemPrompt: settings?.artistBioSystemPrompt ?? null,
        },
        artworkSettings: {
          artworkExtractionProvider: settings?.artworkExtractionProvider,
          anthropicApiKey: settings?.anthropicApiKey,
          geminiApiKey: settings?.geminiApiKey,
          openAiApiKey: settings?.openAiApiKey,
        },
        autoTagSettings: {
          autoTagEnabled: settings?.autoTagEnabled ?? false,
          autoTagProvider: settings?.autoTagProvider ?? null,
          autoTagModel: settings?.autoTagModel ?? null,
          geminiApiKey: settings?.geminiApiKey ?? null,
          anthropicApiKey: settings?.anthropicApiKey ?? null,
          openAiApiKey: settings?.openAiApiKey ?? null,
        },
      };
    });

    if (process.env.AI_ARTIST_INGEST_ENABLED === "1" && approved.unmatchedNames.length > 0) {
      Promise.all(
        approved.unmatchedNames.map((name) =>
          discoverArtist({
            db: args.db,
            artistName: name,
            eventId: approved.createdEvent.id,
            settings: {
              ...approved.artistSettings,
              artistBioSystemPrompt: approved.artistSettings.artistBioSystemPrompt,
            },
          }).catch((err) => logWarn({ message: "auto_approve_event_artist_discovery_failed", candidateId: candidate.id, name, err })),
        ),
      ).catch(() => {});
    }

    if (process.env.AI_ARTWORK_INGEST_ENABLED === "1") {
      extractArtworksForEvent({
        db: args.db,
        eventId: approved.createdEvent.id,
        sourceUrl: candidate.sourceUrl ?? candidate.run?.sourceUrl ?? "",
        settings: {
          artworkExtractionProvider: approved.artworkSettings.artworkExtractionProvider,
          claudeApiKey: approved.artworkSettings.anthropicApiKey,
          geminiApiKey: approved.artworkSettings.geminiApiKey,
          openAiApiKey: approved.artworkSettings.openAiApiKey,
        },
      }).catch((err) => logWarn({ message: "auto_approve_event_artwork_extraction_failed", candidateId: candidate.id, err }));
    }

    if (process.env.AI_AUTO_TAG_ENABLED === "1" && approved.autoTagSettings.autoTagEnabled) {
      autoTagEvent({
        db: args.db,
        eventId: approved.createdEvent.id,
        title: approved.createdEvent.title,
        description: approved.createdEvent.description,
        settings: {
          autoTagProvider: approved.autoTagSettings.autoTagProvider,
          autoTagModel: approved.autoTagSettings.autoTagModel,
          geminiApiKey: approved.autoTagSettings.geminiApiKey,
          anthropicApiKey: approved.autoTagSettings.anthropicApiKey,
          openAiApiKey: approved.autoTagSettings.openAiApiKey,
        },
      }).catch((err) => logWarn({ message: "auto_approve_event_auto_tag_failed", candidateId: candidate.id, err }));
    }

    await importApprovedEventImage({
      appDb: args.db,
      candidateId: candidate.id,
      runId: candidate.runId,
      eventId: approved.createdEvent.id,
      venueId: candidate.venueId,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl ?? candidate.run?.sourceUrl ?? "",
      venueWebsiteUrl: candidate.venue?.websiteUrl ?? null,
      candidateImageUrl: candidate.blobImageUrl ?? candidate.imageUrl ?? null,
      requestId: `auto-approve-event-${candidate.id}`,
    }).catch((err) => logWarn({ message: "auto_approve_image_import_failed", candidateId: candidate.id, err }));

    if (args.autoPublish) {
      await args.db.event.update({
        where: { id: approved.createdEvent.id },
        data: { isPublished: true, status: "PUBLISHED" },
      });
      return { eventId: approved.createdEvent.id, published: true };
    }

    return { eventId: approved.createdEvent.id, published: false };
  } catch (error) {
    logWarn({ message: "auto_approve_event_failed", candidateId: args.candidateId, error });
    return null;
  }
}
