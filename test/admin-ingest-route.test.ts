import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  handleAdminIngestApprove,
  handleAdminIngestReject,
  handleAdminIngestRun,
  handleAdminIngestRunGet,
} from "../lib/admin-ingest-route";

type Candidate = {
  id: string;
  runId: string;
  venueId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string | null;
  locationText: string | null;
  description: string | null;
  sourceUrl: string;
  createdEventId: string | null;
  rejectionReason: string | null;
};

test("approve creates draft event + submission and updates candidate", async () => {
  const events: Array<{ id: string; isPublished: boolean; ingestSourceRunId: string | null }> = [];
  const submissions: Array<{ targetEventId: string; status: string; kind: string | null }> = [];
  const candidate: Candidate = {
    id: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    venueId: "33333333-3333-4333-8333-333333333333",
    status: "PENDING",
    title: "AI Event",
    startAt: new Date("2026-01-01T18:00:00Z"),
    endAt: null,
    timezone: "UTC",
    locationText: "Main Hall",
    description: "Test description",
    sourceUrl: "https://venue.example/events",
    createdEventId: null,
    rejectionReason: null,
  };

  let eventCounter = 0;
  const tx = {
    ingestExtractedEvent: {
      findUnique: async () => ({ ...candidate, run: { id: candidate.runId, venueId: candidate.venueId } }),
      update: async ({ data }: { data: Partial<Candidate> }) => {
        Object.assign(candidate, data);
        return { id: candidate.id, createdEventId: candidate.createdEventId, runId: candidate.runId, venueId: candidate.venueId };
      },
    },
    event: {
      findUnique: async ({ where }: { where: { slug: string } }) => events.find((event) => event.id === where.slug) ? { id: where.slug } : null,
      create: async ({ data }: { data: { isPublished: boolean; ingestSourceRunId: string | null } }) => {
        eventCounter += 1;
        const id = `event-${eventCounter}`;
        events.push({ id, isPublished: data.isPublished, ingestSourceRunId: data.ingestSourceRunId });
        return { id };
      },
    },
    submission: {
      create: async ({ data }: { data: { targetEventId: string; status: string; kind: string | null } }) => {
        submissions.push({ targetEventId: data.targetEventId, status: data.status, kind: data.kind });
        return { id: `submission-${submissions.length}` };
      },
    },
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/extracted-events/11111111-1111-4111-8111-111111111111/approve", { method: "POST" });
  const res = await handleAdminIngestApprove(req, { id: candidate.id }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: { $transaction: async (cb: (trx: typeof tx) => Promise<unknown>) => cb(tx) } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.isPublished, false);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0]?.targetEventId, body.createdEventId);
  assert.equal(submissions[0]?.status, "SUBMITTED");
  assert.equal(candidate.status, "APPROVED");
  assert.equal(candidate.createdEventId, body.createdEventId);
});

test("approve is idempotent and does not duplicate event/submission", async () => {
  const candidate: Candidate = {
    id: "11111111-1111-4111-8111-111111111112",
    runId: "22222222-2222-4222-8222-222222222222",
    venueId: "33333333-3333-4333-8333-333333333333",
    status: "APPROVED",
    title: "AI Event",
    startAt: new Date("2026-01-01T18:00:00Z"),
    endAt: null,
    timezone: "UTC",
    locationText: "Main Hall",
    description: "Test description",
    sourceUrl: "https://venue.example/events",
    createdEventId: "event-1",
    rejectionReason: null,
  };

  let submissionCreates = 0;
  let eventCreates = 0;
  const tx = {
    ingestExtractedEvent: {
      findUnique: async () => ({ ...candidate, run: { id: candidate.runId, venueId: candidate.venueId } }),
      update: async ({ data }: { data: Partial<Candidate> }) => {
        Object.assign(candidate, data);
        return { id: candidate.id, createdEventId: candidate.createdEventId, runId: candidate.runId, venueId: candidate.venueId };
      },
    },
    event: {
      findUnique: async () => null,
      create: async () => {
        eventCreates += 1;
        return { id: "event-2" };
      },
    },
    submission: {
      create: async () => {
        submissionCreates += 1;
        return { id: "submission-2" };
      },
    },
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/extracted-events/11111111-1111-4111-8111-111111111112/approve", { method: "POST" });
  const res = await handleAdminIngestApprove(req, { id: candidate.id }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: { $transaction: async (cb: (trx: typeof tx) => Promise<unknown>) => cb(tx) } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.createdEventId, "event-1");
  assert.equal(eventCreates, 0);
  assert.equal(submissionCreates, 0);
});

test("reject marks candidate rejected and stores reason", async () => {
  const candidate = {
    id: "11111111-1111-4111-8111-111111111113",
    runId: "22222222-2222-4222-8222-222222222222",
    venueId: "33333333-3333-4333-8333-333333333333",
    status: "PENDING",
    rejectionReason: null,
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/extracted-events/11111111-1111-4111-8111-111111111113/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rejectionReason: "duplicate listing" }),
  });

  const res = await handleAdminIngestReject(req, { id: candidate.id }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      ingestExtractedEvent: {
        update: async ({ data }: { data: { status: string; rejectionReason: string } }) => {
          candidate.status = data.status as "REJECTED";
          candidate.rejectionReason = data.rejectionReason;
          return candidate;
        },
      },
    } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 200);
  assert.equal(candidate.status, "REJECTED");
  assert.equal(candidate.rejectionReason, "duplicate listing");
});

test("run endpoint requires source url when venue has no website", async () => {
  const req = new NextRequest("http://localhost/api/admin/ingest/venues/11111111-1111-4111-8111-111111111111/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  const res = await handleAdminIngestRun(req, { venueId: "11111111-1111-4111-8111-111111111111" }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: { venue: { findUnique: async () => ({ id: "11111111-1111-4111-8111-111111111111", websiteUrl: null, name: "Venue" }) } } as never,
    runExtraction: async () => ({ runId: "run-1", createdCount: 0, dedupedCount: 0 }),
    logAction: async () => undefined,
  });

  assert.equal(res.status, 400);
});


test("run detail includes error diagnostics fields", async () => {
  const req = new NextRequest("http://localhost/api/admin/ingest/runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { method: "GET" });

  const res = await handleAdminIngestRunGet(req, { runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: {
      ingestRun: {
        findUnique: async () => ({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "FAILED",
          sourceUrl: "https://example.com/events",
          fetchStatus: "200",
          fetchFinalUrl: "https://example.com/events",
          fetchContentType: "text/html",
          fetchBytes: 1024,
          errorCode: "BAD_MODEL_OUTPUT",
          errorMessage: "OpenAI output did not match expected event schema",
          errorDetail: '{"debug":{"output_item_count":1}}',
          model: "gpt-4o-mini",
          usagePromptTokens: 100,
          usageCompletionTokens: 20,
          usageTotalTokens: 120,
          startedAt: new Date("2026-01-01T00:00:00.000Z"),
          finishedAt: new Date("2026-01-01T00:00:02.000Z"),
          venue: { id: "venue-1", name: "Venue" },
          extractedEvents: [],
        }),
      },
    } as never,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.run.errorMessage, "OpenAI output did not match expected event schema");
  assert.equal(body.run.errorDetail, '{"debug":{"output_item_count":1}}');
  assert.equal(body.run.model, "gpt-4o-mini");
});


test("approve returns precise missing scheduling fields", async () => {
  const candidate: Candidate = {
    id: "11111111-1111-4111-8111-111111111114",
    runId: "22222222-2222-4222-8222-222222222222",
    venueId: "33333333-3333-4333-8333-333333333333",
    status: "PENDING",
    title: "AI Event",
    startAt: null,
    endAt: null,
    timezone: null,
    locationText: "Main Hall",
    description: "Test description",
    sourceUrl: "https://venue.example/events",
    createdEventId: null,
    rejectionReason: null,
  };

  const tx = {
    ingestExtractedEvent: {
      findUnique: async () => ({ ...candidate, run: { id: candidate.runId, venueId: candidate.venueId } }),
      update: async () => ({ id: candidate.id, createdEventId: null, runId: candidate.runId, venueId: candidate.venueId }),
    },
    event: {
      findUnique: async () => null,
      create: async () => ({ id: "event-1" }),
    },
    submission: {
      create: async () => ({ id: "submission-1" }),
    },
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/extracted-events/11111111-1111-4111-8111-111111111114/approve", { method: "POST" });
  const res = await handleAdminIngestApprove(req, { id: candidate.id }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: { $transaction: async (cb: (trx: typeof tx) => Promise<unknown>) => cb(tx) } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error.message, "Extracted event is missing required scheduling fields");
  assert.deepEqual(body.error.details?.missingFields, ["startAt", "timezone"]);
});


test("approve missing timezone only reports timezone", async () => {
  const candidate: Candidate = {
    id: "11111111-1111-4111-8111-111111111115",
    runId: "22222222-2222-4222-8222-222222222222",
    venueId: "33333333-3333-4333-8333-333333333333",
    status: "PENDING",
    title: "AI Event",
    startAt: new Date("2026-01-01T18:00:00Z"),
    endAt: new Date("2026-01-01T20:00:00Z"),
    timezone: null,
    locationText: "Main Hall",
    description: "Test description",
    sourceUrl: "https://venue.example/events",
    createdEventId: null,
    rejectionReason: null,
  };

  const tx = {
    ingestExtractedEvent: {
      findUnique: async () => ({ ...candidate, run: { id: candidate.runId, venueId: candidate.venueId } }),
      update: async () => ({ id: candidate.id, createdEventId: null, runId: candidate.runId, venueId: candidate.venueId }),
    },
    event: {
      findUnique: async () => null,
      create: async () => ({ id: "event-1" }),
    },
    submission: {
      create: async () => ({ id: "submission-1" }),
    },
  };

  const req = new NextRequest("http://localhost/api/admin/ingest/extracted-events/11111111-1111-4111-8111-111111111115/approve", { method: "POST" });
  const res = await handleAdminIngestApprove(req, { id: candidate.id }, {
    requireEditorUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: { $transaction: async (cb: (trx: typeof tx) => Promise<unknown>) => cb(tx) } as never,
    logAction: async () => undefined,
  });

  assert.equal(res.status, 409);
  const body = await res.json();
  assert.deepEqual(body.error.details?.missingFields, ["timezone"]);
});
