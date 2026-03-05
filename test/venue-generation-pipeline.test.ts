import test from "node:test";
import assert from "node:assert/strict";
import { ForwardGeocodeError } from "../lib/geocode/forward";
import { runVenueGenerationPipeline } from "../lib/venue-generation/generation-pipeline";

function baseDb() {
  const createdItems: Array<Record<string, unknown>> = [];
  const createdVenues: Array<Record<string, unknown>> = [];
  const runs: Array<Record<string, unknown>> = [];
  const homepageCandidates: Array<Record<string, unknown>> = [];

  return {
    createdItems,
    createdVenues,
    runs,
    homepageCandidates,
    db: {
      venue: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdVenues.push(data);
          return { id: `venue-${createdVenues.length}` };
        },
        update: async () => ({ id: "venue-updated" }),
      },
      venueGenerationRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          runs.push({ phase: "create", ...data });
          return { id: "run-1" };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          runs.push({ phase: "update", ...data });
          return { id: "run-1" };
        },
      },
      venueGenerationRunItem: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdItems.push(data);
          return { id: `item-${createdItems.length}` };
        },
        update: async () => ({ id: "item-updated" }),
      },
      venueHomepageImageCandidate: {
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          homepageCandidates.push(...data);
          return { count: data.length };
        },
      },
    },
  };
}

const openAiPayload = {
  output_parsed: {
    venues: [
      {
        name: "New Museum",
        addressLine1: "2 Main",
        addressLine2: null,
        city: "Cape Town",
        region: "Western Cape",
        postcode: null,
        country: "South Africa",
        contactEmail: null,
        contactPhone: null,
        websiteUrl: null,
        instagramUrl: null,
        facebookUrl: null,
        featuredImageUrl: null,
        openingHours: null,
        venueType: "MUSEUM",
      },
    ],
  },
};

test("venue generation pipeline records geocode success/no-match/failure", async () => {
  const state = baseDb();
  const geocodeResponses = [
    { lat: -33.9, lng: 18.4 },
    null,
    new ForwardGeocodeError("provider_error", "provider failed"),
  ];

  const response = {
    output_parsed: {
      venues: [
        { ...openAiPayload.output_parsed.venues[0], name: "Success Gallery" },
        { ...openAiPayload.output_parsed.venues[0], name: "No Match Gallery", postcode: "8001" },
        { ...openAiPayload.output_parsed.venues[0], name: "Failure Gallery", city: "Durban" },
      ],
    },
  };

  const result = await runVenueGenerationPipeline({
    input: { country: "South Africa", region: "Western Cape" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: { createResponse: async () => response },
    geocode: async () => {
      const next = geocodeResponses.shift();
      if (next instanceof Error) throw next;
      return next ?? null;
    },
  });

  assert.equal(result.totalCreated, 3);
  assert.equal(result.geocodeAttempted, 3);
  assert.equal(result.geocodeSucceeded, 1);
  assert.equal(result.geocodeFailed, 1);
  assert.equal((result.geocodeFailureBreakdown as Record<string, number>).provider_error, 1);
  assert.equal(state.createdItems.length, 3);
  assert.deepEqual(state.createdItems.map((item) => item.geocodeStatus), ["succeeded", "no_match", "failed"]);
  assert.equal(state.createdVenues[1].timezone, null);
  assert.equal(state.createdItems[1].timezoneWarning, undefined);
});

test("venue generation pipeline dedupe tiering uses postcode before city", async () => {
  const state = baseDb();
  const whereClauses: Array<Record<string, unknown>> = [];

  state.db.venue.findFirst = async ({ where }: { where: Record<string, unknown> }) => {
    whereClauses.push(where);
    if ((where.postcode as { equals?: string })?.equals === "8001") {
      return { id: "dup-1", instagramUrl: null, facebookUrl: null, contactEmail: null, _count: { homepageImageCandidates: 0 } };
    }
    return null;
  };

  const result = await runVenueGenerationPipeline({
    input: { country: "South Africa", region: "Western Cape" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            { ...openAiPayload.output_parsed.venues[0], name: "Postcode Match", postcode: "8001", city: "Cape Town" },
            { ...openAiPayload.output_parsed.venues[0], name: "City Match", postcode: null, city: "Cape Town" },
            { ...openAiPayload.output_parsed.venues[0], name: "Name Country Only", postcode: null, city: null },
          ],
        },
      }),
    },
    geocode: async () => null,
  });

  assert.equal(result.totalSkipped, 1);
  assert.equal(state.createdVenues.length, 2);
  assert.equal((whereClauses[0].postcode as { equals?: string }).equals, "8001");
  assert.equal((whereClauses[1].city as { equals?: string }).equals, "Cape Town");
  assert.ok(!("city" in whereClauses[2]));
});


test("venue generation pipeline sets timezone from geocoded coordinates", async () => {
  const state = baseDb();

  await runVenueGenerationPipeline({
    input: { country: "United Kingdom", region: "England" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            { ...openAiPayload.output_parsed.venues[0], name: "London Venue", city: "London", country: "United Kingdom" },
          ],
        },
      }),
    },
    geocode: async () => ({ lat: 51.5074, lng: -0.1278 }),
  });

  assert.equal(state.createdVenues[0].timezone, "Europe/London");
  assert.equal(state.createdItems[0].timezoneWarning, undefined);
});

test("venue generation pipeline records timezone warning when lookup fails", async () => {
  const state = baseDb();

  await runVenueGenerationPipeline({
    input: { country: "United Kingdom", region: "England" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            { ...openAiPayload.output_parsed.venues[0], name: "Bad Coords Venue", city: "London", country: "United Kingdom" },
          ],
        },
      }),
    },
    geocode: async () => ({ lat: 999, lng: -0.1278 }),
  });

  assert.equal(state.createdVenues[0].timezone, null);
  assert.equal(state.createdItems[0].timezoneWarning, "timezone_lookup_failed");
});


test("venue generation pipeline normalizes and persists social fields", async () => {
  const state = baseDb();

  await runVenueGenerationPipeline({
    input: { country: "United Kingdom", region: "England" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            {
              ...openAiPayload.output_parsed.venues[0],
              name: "Social Venue",
              country: "United Kingdom",
              instagramUrl: "https://instagram.com/socialvenue/?hl=en",
              facebookUrl: "https://www.facebook.com/socialvenue/posts/1?ref=foo",
              contactEmail: "hello@socialvenue.com",
            },
          ],
        },
      }),
    },
    geocode: async () => null,
  });

  assert.equal(state.createdVenues[0].instagramUrl, "https://www.instagram.com/socialvenue");
  assert.equal(state.createdVenues[0].facebookUrl, "https://www.facebook.com/socialvenue");
  assert.equal(state.createdVenues[0].contactEmail, "hello@socialvenue.com");
  assert.equal(state.createdItems[0].socialWarning, undefined);
});

test("venue generation pipeline records warnings and preserves existing social fields on duplicates", async () => {
  const state = baseDb();
  const updates: Array<Record<string, unknown>> = [];

  state.db.venue.findFirst = async () => ({
    id: "venue-existing",
    instagramUrl: "https://www.instagram.com/existing",
    facebookUrl: null,
    contactEmail: null,
    _count: { homepageImageCandidates: 0 },
  });
  state.db.venue.update = async ({ data }: { data: Record<string, unknown> }) => {
    updates.push(data);
    return { id: "venue-existing" };
  };

  await runVenueGenerationPipeline({
    input: { country: "United Kingdom", region: "England" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    extractHomepageImagesFn: async () => ({
      candidates: [{ url: "https://img.example.com/home.jpg", source: "og", sortOrder: 0 }],
    }),
    fetchHtmlFn: async () => null as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            {
              ...openAiPayload.output_parsed.venues[0],
              name: "Existing Venue",
              country: "United Kingdom",
              instagramUrl: "https://bad.example/social",
              facebookUrl: "https://facebook.com/newpage",
              contactEmail: "not-an-email",
              websiteUrl: "https://existing.example.com",
            },
          ],
        },
      }),
    },
    geocode: async () => null,
  });

  assert.equal(state.createdVenues.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].instagramUrl, undefined);
  assert.equal(updates[0].facebookUrl, "https://www.facebook.com/newpage");
  assert.equal(updates[0].contactEmail, null);
  assert.equal(state.createdItems[0].socialWarning, "invalid_instagram_url,invalid_contact_email");
  assert.equal(state.homepageCandidates.filter((candidate) => candidate.venueId === "venue-existing").length, 1);
});



test("venue generation pipeline skips duplicate homepage extraction when pending candidates already exist", async () => {
  const state = baseDb();

  state.db.venue.findFirst = async () => ({
    id: "venue-existing",
    instagramUrl: null,
    facebookUrl: null,
    contactEmail: null,
    _count: { homepageImageCandidates: 2 },
  });

  await runVenueGenerationPipeline({
    input: { country: "United Kingdom", region: "England" },
    triggeredById: "11111111-1111-4111-8111-111111111111",
    db: state.db as never,
    extractHomepageImagesFn: async () => ({
      candidates: [{ url: "https://img.example.com/should-not-run.jpg", source: "og", sortOrder: 0 }],
    }),
    fetchHtmlFn: async () => null as never,
    openai: {
      createResponse: async () => ({
        output_parsed: {
          venues: [
            {
              ...openAiPayload.output_parsed.venues[0],
              name: "Existing Venue With Pending Candidates",
              country: "United Kingdom",
              websiteUrl: "https://existing.example.com",
            },
          ],
        },
      }),
    },
    geocode: async () => null,
  });

  assert.equal(state.homepageCandidates.filter((candidate) => candidate.venueId === "venue-existing").length, 0);
});
