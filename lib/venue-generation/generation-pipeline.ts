import { type Prisma, type PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { ForwardGeocodeError, type ForwardGeocodeErrorCode, forwardGeocodeVenueAddressToLatLng } from "@/lib/geocode/forward";
import { buildVenueGeocodeQueries, normalizeCountryCode } from "@/lib/venues/format-venue-address";
import { generatedVenuesResponseSchema, type GeneratedVenue, type VenueGenerationInput } from "@/lib/venue-generation/schemas";
import { normalizeEmail, normalizeFacebookUrl, normalizeInstagramUrl } from "@/lib/venues/normalize-social";
import { extractHomepageImagesFromHtml, fetchHomepage } from "@/lib/venue-generation/extract-homepage-images";
import { extractHomepageDetails, type HomepageDetails } from "@/lib/venue-generation/extract-homepage-details";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { autoSelectVenueCover, type AutoSelectDb, type AutoSelectDeps } from "@/lib/venue-generation/auto-select-venue-cover";

type ResponseOutputContentItem = {
  type?: string;
  json?: unknown;
  text?: string;
};

type ResponseOutputItem = {
  content?: ResponseOutputContentItem[];
};

type OpenAIResponse = {
  output?: ResponseOutputItem[];
  response?: { output?: ResponseOutputItem[] };
  output_parsed?: unknown;
  output_text?: string;
};



export class VenueGenerationError extends Error {
  constructor(
    public code: "OPENAI_HTTP_ERROR" | "OPENAI_BAD_OUTPUT" | "OPENAI_SCHEMA_MISMATCH",
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type PipelineDb = {
  venue: {
    findFirst: PrismaClient["venue"]["findFirst"];
    findUnique: (args: { where: { slug: string }; select: { id: true } }) => Promise<{ id: string } | null>;
    create: (args: { data: Prisma.VenueCreateInput }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: Prisma.VenueUpdateInput }) => Promise<{ id: string }>;
  };
  venueGenerationRun: {
    create: (args: {
      data: {
        country: string;
        region: string;
        status: string;
        totalReturned: number;
        totalCreated: number;
        totalSkipped: number;
        totalFailed: number;
        geocodeAttempted: number;
        geocodeSucceeded: number;
        geocodeFailed: number;
        geocodeFailureBreakdown: Record<string, number>;
        triggeredById: string;
      };
    }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: {
        status?: string;
        totalReturned?: number;
        totalCreated?: number;
        totalSkipped?: number;
        totalFailed?: number;
        geocodeAttempted?: number;
        geocodeSucceeded?: number;
        geocodeFailed?: number;
        geocodeFailureBreakdown?: Record<string, number>;
        autoPublishedCount?: number;
      };
    }) => Promise<{ id: string }>;
  };
  venueGenerationRunItem: {
    create: (args: {
      data: {
        runId: string;
        name: string;
        city: string | null;
        postcode: string | null;
        country: string;
        status: string;
        reason?: string;
        venueId?: string;
        instagramUrl?: string | null;
        facebookUrl?: string | null;
        contactEmail?: string | null;
        websiteUrl?: string | null;
        openingHours?: string | null;
        contactPhone?: string | null;
        addressLine1?: string | null;
        addressLine2?: string | null;
        region?: string | null;
        socialWarning?: string;
        geocodeStatus: string;
        geocodeErrorCode?: string;
        timezoneWarning?: string;
        homepageImageStatus: string;
        homepageImageCandidateCount: number;
      };
    }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: { homepageImageStatus: string; homepageImageCandidateCount: number } }) => Promise<{ id: string }>;
  };
  venueHomepageImageCandidate: {
    createMany: (args: {
      data: Array<{
        venueId: string;
        runItemId: string;
        url: string;
        source: string;
        sortOrder: number;
        status: string;
      }>;
    }) => Promise<{ count: number }>;
    findFirst: (args: {
      where: {
        venueId: string;
        runItemId: string;
        url: string;
        source: string;
        sortOrder: number;
        status: string;
      };
      orderBy: { createdAt: "desc" };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
    update: AutoSelectDb["venueHomepageImageCandidate"]["update"];
  };
  venueImage: AutoSelectDb["venueImage"];
  asset: AutoSelectDb["asset"];
  siteSettings?: {
    findUnique: (args: {
      where: { id: string };
      select: { venueGenerationModel: true };
    }) => Promise<{ venueGenerationModel: string | null } | null>;
  };
};

type OpenAIClient = {
  createResponse: (args: { model: string; input: Array<{ role: "system" | "user"; content: string }>; schema: object }) => Promise<OpenAIResponse>;
};

export function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function toJsonOpeningHours(value: string | null): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return { raw: value };
}

function getOutputItems(raw: OpenAIResponse): ResponseOutputItem[] {
  return [...(raw.output ?? []), ...(raw.response?.output ?? [])];
}

export function normalizeGeneratedVenue(venue: GeneratedVenue): GeneratedVenue {
  return {
    ...venue,
    name: venue.name.trim(),
    city: venue.city?.trim() || null,
    region: venue.region?.trim() || null,
    postcode: venue.postcode?.trim() || null,
    country: venue.country.trim(),
    addressLine1: venue.addressLine1?.trim() || null,
    addressLine2: venue.addressLine2?.trim() || null,
    contactEmail: venue.contactEmail?.trim() || null,
    instagramUrl: venue.instagramUrl?.trim() || null,
    facebookUrl: venue.facebookUrl?.trim() || null,
  };
}

export function normalizeSocialsAndEmail(venue: GeneratedVenue) {
  const warnings: string[] = [];
  const instagram = normalizeInstagramUrl(venue.instagramUrl);
  const facebook = normalizeFacebookUrl(venue.facebookUrl);
  const email = normalizeEmail(venue.contactEmail);

  for (const warning of [instagram.warning, facebook.warning, email.warning]) {
    if (warning) warnings.push(warning);
  }

  return {
    instagramUrl: instagram.value,
    facebookUrl: facebook.value,
    contactEmail: email.value,
    warnings,
  };
}

export function incrementBreakdown(map: Record<string, number>, code: ForwardGeocodeErrorCode) {
  map[code] = (map[code] ?? 0) + 1;
}

export function dedupeWhereForVenue(venue: GeneratedVenue): { where: Prisma.VenueWhereInput; reason: string } {
  const name = venue.name.trim();
  const country = venue.country.trim();
  const postcode = venue.postcode?.trim();
  const city = venue.city?.trim();

  if (postcode) {
    return {
      where: {
        name: { equals: name, mode: "insensitive" },
        postcode: { equals: postcode, mode: "insensitive" },
        country: { equals: country, mode: "insensitive" },
      },
      reason: "duplicate(postcode-tier)",
    };
  }

  if (city) {
    return {
      where: {
        name: { equals: name, mode: "insensitive" },
        city: { equals: city, mode: "insensitive" },
        country: { equals: country, mode: "insensitive" },
      },
      reason: "duplicate(city-tier)",
    };
  }

  return {
    where: {
      name: { equals: name, mode: "insensitive" },
      country: { equals: country, mode: "insensitive" },
    },
    reason: "duplicate(name-country-tier)",
  };
}

export async function geocodeVenue(venue: GeneratedVenue, geocodeFn: typeof forwardGeocodeVenueAddressToLatLng) {
  const queryTexts = buildVenueGeocodeQueries(venue);
  if (queryTexts.length === 0) {
    return { status: "not_attempted" as const, geocoded: null, geocodeErrorCode: undefined };
  }

  try {
    const geocoded = await geocodeFn({
      queryTexts,
      countryCode: normalizeCountryCode(venue.country),
    });

    if (!geocoded) return { status: "no_match" as const, geocoded: null, geocodeErrorCode: undefined };
    return { status: "succeeded" as const, geocoded, geocodeErrorCode: undefined };
  } catch (error) {
    if (error instanceof ForwardGeocodeError) {
      return { status: "failed" as const, geocoded: null, geocodeErrorCode: error.code };
    }
    throw error;
  }
}

export async function runHomepageExtraction(args: {
  venueId: string;
  runItemId: string;
  websiteUrl: string | null;
  fetchHtmlFn: typeof fetchHtmlWithGuards;
  db: Pick<PipelineDb, "venueHomepageImageCandidate" | "venueImage" | "venue" | "asset">;
  autoSelectDeps?: Partial<AutoSelectDeps>;
  autoPublish?: boolean;
}): Promise<{
  homepageImageStatus: string;
  homepageImageCandidateCount: number;
  details: HomepageDetails | null;
  autoSelectedCandidateId: string | null;
  autoPublished: boolean;
}> {
  let homepageImageStatus = "no_url";
  let homepageImageCandidateCount = 0;
  let autoSelectedCandidateId: string | null = null;

  if (!args.websiteUrl) return { homepageImageStatus, homepageImageCandidateCount, details: null, autoSelectedCandidateId, autoPublished: false };

  const fetched = await fetchHomepage({
    websiteUrl: args.websiteUrl,
    fetchHtml: args.fetchHtmlFn,
    assertUrl: assertSafeUrl,
  });

  if (!fetched) return { homepageImageStatus: "fetch_failed", homepageImageCandidateCount, details: null, autoSelectedCandidateId, autoPublished: false };

  const [imageResult, details] = await Promise.all([
    extractHomepageImagesFromHtml(fetched, assertSafeUrl),
    extractHomepageDetails(fetched),
  ]);

  if (imageResult.candidates.length === 0) {
    homepageImageStatus = "none_found";
  } else {
    await args.db.venueHomepageImageCandidate.createMany({
      data: imageResult.candidates.map((candidate) => ({
        venueId: args.venueId,
        runItemId: args.runItemId,
        url: candidate.url,
        source: candidate.source,
        sortOrder: candidate.sortOrder,
        status: "pending",
      })),
    });

    homepageImageStatus = "candidates_extracted";
    homepageImageCandidateCount = imageResult.candidates.length;

    if (args.autoPublish === true) {
      const sorted = imageResult.candidates
        .map((candidate, index) => ({ candidate, index }))
        .sort((a, b) => {
          const aGroup = a.candidate.source === "og_image" ? 0 : 1;
          const bGroup = b.candidate.source === "og_image" ? 0 : 1;
          if (aGroup !== bGroup) return aGroup - bGroup;
          if (a.candidate.sortOrder !== b.candidate.sortOrder) return a.candidate.sortOrder - b.candidate.sortOrder;
          return a.index - b.index;
        });
      const bestCandidate = sorted[0]?.candidate;

      if (bestCandidate) {
        const persistedCandidate = await args.db.venueHomepageImageCandidate.findFirst({
          where: {
            venueId: args.venueId,
            runItemId: args.runItemId,
            url: bestCandidate.url,
            source: bestCandidate.source,
            sortOrder: bestCandidate.sortOrder,
            status: "pending",
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (persistedCandidate) {
          const selectResult = await autoSelectVenueCover({
            venueId: args.venueId,
            candidateId: persistedCandidate.id,
            candidateUrl: bestCandidate.url,
            db: args.db,
            deps: args.autoSelectDeps,
          });

          if (selectResult.ok) {
            autoSelectedCandidateId = persistedCandidate.id;
          } else {
            console.warn("venue_cover_auto_select_failed", {
              venueId: args.venueId,
              runItemId: args.runItemId,
              candidateId: persistedCandidate.id,
              reason: selectResult.reason,
            });
          }
        }
      }
    }
  }

  return { homepageImageStatus, homepageImageCandidateCount, details, autoSelectedCandidateId, autoPublished: false };
}


export function getStructuredPayloadFromResponses(raw: OpenAIResponse): unknown {
  if (raw.output_parsed !== undefined) return raw.output_parsed;

  for (const item of getOutputItems(raw)) {
    for (const contentItem of item.content ?? []) {
      if ((contentItem.type === "output_json" || contentItem.type === "json_schema") && contentItem.json !== undefined) {
        return contentItem.json;
      }
    }
  }

  if (typeof raw.output_text === "string" && raw.output_text.trim().length > 0) {
    try {
      return JSON.parse(raw.output_text);
    } catch {
      // Continue to other payload locations.
    }
  }

  for (const item of getOutputItems(raw)) {
    for (const contentItem of item.content ?? []) {
      if (contentItem.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim().length > 0) {
        try {
          return JSON.parse(contentItem.text);
        } catch {
          // Continue scanning output_text items.
        }
      }
    }
  }

  throw new VenueGenerationError("OPENAI_BAD_OUTPUT", "OpenAI response did not include structured JSON output", {
    hasOutputParsed: raw.output_parsed !== undefined,
    hasOutputText: typeof raw.output_text === "string" && raw.output_text.length > 0,
    outputItems: getOutputItems(raw).length,
    contentTypes: getOutputItems(raw)
      .flatMap((item) => item.content ?? [])
      .map((item) => item.type)
      .filter((type): type is string => typeof type === "string")
      .slice(0, 20),
  });
}

function venuePrompt(input: VenueGenerationInput) {
  return [
    "Return a comprehensive list of real visual-art venues for the specified geography.",
    "Include galleries, museums, art centres, artist-run spaces, sculpture parks, and foundations.",
    "Only return official venue social profiles.",
    "Instagram/Facebook must be full URLs beginning with https://.",
    "If not confident in any social URL or email, return null and do not invent values.",
    "contactEmail must be a real email address; otherwise null.",
    "Output ONLY JSON matching schema.",
    `Country: ${input.country}`,
    `Region: ${input.region}`,
  ].join("\n");
}

export async function runVenueGenerationPhase1(args: {
  input: VenueGenerationInput;
  triggeredById: string;
  db: PipelineDb;
  openai: OpenAIClient;
  model?: string;
}) {
  const run = await args.db.venueGenerationRun.create({
    data: {
      country: args.input.country,
      region: args.input.region,
      status: "PENDING",
      totalReturned: 0,
      totalCreated: 0,
      totalSkipped: 0,
      totalFailed: 0,
      geocodeAttempted: 0,
      geocodeSucceeded: 0,
      geocodeFailed: 0,
      geocodeFailureBreakdown: {},
      triggeredById: args.triggeredById,
    },
  });

  try {
    const settings = await args.db.siteSettings?.findUnique({
      where: { id: "default" },
      select: { venueGenerationModel: true },
    });

    const response = await args.openai.createResponse({
      model: args.model?.trim() || settings?.venueGenerationModel?.trim() || process.env.VENUE_GENERATION_MODEL?.trim() || "gpt-4o-mini",
      input: [
        { role: "system", content: "You are a cultural directory researcher. Return strict JSON only." },
        { role: "user", content: venuePrompt(args.input) },
      ],
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["venues"],
        properties: {
          venues: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "addressLine1", "addressLine2", "city", "region", "postcode", "country", "contactEmail", "contactPhone", "websiteUrl", "instagramUrl", "facebookUrl", "openingHours", "venueType"],
              properties: {
                name: { type: "string" },
                addressLine1: { type: ["string", "null"] },
                addressLine2: { type: ["string", "null"] },
                city: { type: ["string", "null"] },
                region: { type: ["string", "null"] },
                postcode: { type: ["string", "null"] },
                country: { type: "string" },
                contactEmail: { type: ["string", "null"] },
                contactPhone: { type: ["string", "null"] },
                websiteUrl: { type: ["string", "null"] },
                instagramUrl: { type: ["string", "null"] },
                facebookUrl: { type: ["string", "null"] },
                openingHours: { type: ["string", "null"] },
                venueType: { type: "string", enum: ["GALLERY", "MUSEUM", "ART_CENTRE", "FOUNDATION", "OTHER"] },
              },
            },
          },
        },
      },
    });

    const payload = getStructuredPayloadFromResponses(response);

    let parsed: ReturnType<typeof generatedVenuesResponseSchema.parse>;
    try {
      parsed = generatedVenuesResponseSchema.parse(payload);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new VenueGenerationError("OPENAI_SCHEMA_MISMATCH", "OpenAI output did not match venue schema", {
          issues: error.issues,
        });
      }
      throw error;
    }

    let totalSkipped = 0;
    let totalQueued = 0;
    const seen = new Set<string>();

    for (const rawVenue of parsed.venues) {
      const venue = normalizeGeneratedVenue(rawVenue);
      const normalizedSocials = normalizeSocialsAndEmail(venue);
      const socialWarning = normalizedSocials.warnings.length > 0 ? normalizedSocials.warnings.join(",") : undefined;
      const memoryDedupeKey = `${normalize(venue.name)}|${normalize(venue.postcode)}|${normalize(venue.city)}|${normalize(venue.country)}`;

      if (seen.has(memoryDedupeKey)) {
        totalSkipped += 1;
        await args.db.venueGenerationRunItem.create({
          data: {
            runId: run.id,
            name: venue.name,
            city: venue.city,
            postcode: venue.postcode,
            country: venue.country,
            region: venue.region,
            addressLine1: venue.addressLine1,
            addressLine2: venue.addressLine2,
            websiteUrl: venue.websiteUrl,
            openingHours: venue.openingHours,
            contactPhone: venue.contactPhone,
            instagramUrl: venue.instagramUrl,
            facebookUrl: venue.facebookUrl,
            contactEmail: venue.contactEmail,
            socialWarning,
            status: "skipped",
            reason: "duplicate(in-run)",
            geocodeStatus: "not_attempted",
            homepageImageStatus: "skipped",
            homepageImageCandidateCount: 0,
          },
        });
        continue;
      }

      const dedupe = dedupeWhereForVenue(venue);
      const duplicate = await args.db.venue.findFirst({ where: dedupe.where, select: { id: true } });
      if (duplicate) {
        totalSkipped += 1;
        seen.add(memoryDedupeKey);
        await args.db.venueGenerationRunItem.create({
          data: {
            runId: run.id,
            name: venue.name,
            city: venue.city,
            postcode: venue.postcode,
            country: venue.country,
            region: venue.region,
            addressLine1: venue.addressLine1,
            addressLine2: venue.addressLine2,
            websiteUrl: venue.websiteUrl,
            openingHours: venue.openingHours,
            contactPhone: venue.contactPhone,
            instagramUrl: venue.instagramUrl,
            facebookUrl: venue.facebookUrl,
            contactEmail: venue.contactEmail,
            socialWarning,
            status: "skipped",
            reason: dedupe.reason,
            venueId: duplicate.id,
            geocodeStatus: "not_attempted",
            homepageImageStatus: "skipped",
            homepageImageCandidateCount: 0,
          },
        });
        continue;
      }

      totalQueued += 1;
      seen.add(memoryDedupeKey);
      await args.db.venueGenerationRunItem.create({
        data: {
          runId: run.id,
          name: venue.name,
          city: venue.city,
          postcode: venue.postcode,
          country: venue.country,
          region: venue.region,
          addressLine1: venue.addressLine1,
          addressLine2: venue.addressLine2,
          websiteUrl: venue.websiteUrl,
          openingHours: venue.openingHours,
          contactPhone: venue.contactPhone,
          instagramUrl: normalizedSocials.instagramUrl,
          facebookUrl: normalizedSocials.facebookUrl,
          contactEmail: normalizedSocials.contactEmail,
          socialWarning,
          status: "pending_processing",
          geocodeStatus: "not_attempted",
          homepageImageStatus: "skipped",
          homepageImageCandidateCount: 0,
        },
      });
    }

    await args.db.venueGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "PENDING",
        totalReturned: parsed.venues.length,
        totalSkipped,
      },
    });

    return {
      runId: run.id,
      totalReturned: parsed.venues.length,
      totalQueued,
      totalSkipped,
      totalCreated: 0,
      totalFailed: 0,
    };
  } catch (error) {
    await args.db.venueGenerationRun.update({ where: { id: run.id }, data: { status: "FAILED" } }).catch(() => undefined);
    throw error;
  }
}

export async function runVenueGenerationPipeline(args: {
  input: VenueGenerationInput;
  triggeredById: string;
  db: PipelineDb;
  openai: OpenAIClient;
  model?: string;
}) {
  return runVenueGenerationPhase1(args);
}


export async function createOpenAIResponsesClient(args: { apiKey: string }) {
  return {
    async createResponse(params: { model: string; input: Array<{ role: "system" | "user"; content: string }>; schema: object }) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${args.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          input: params.input,
          text: {
            format: {
              type: "json_schema",
              name: "venue_generation",
              strict: true,
              schema: params.schema,
            },
          },
        }),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new VenueGenerationError("OPENAI_HTTP_ERROR", "OpenAI venue generation request failed", {
          status: response.status,
          responseTextPrefix: responseText.slice(0, 500),
        });
      }

      return (await response.json()) as OpenAIResponse;
    },
  };
}
