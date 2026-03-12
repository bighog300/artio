import test from "node:test";
import assert from "node:assert/strict";
import { decideSubmission } from "../lib/moderation-decision-service";

type SubmissionType = "ARTIST" | "VENUE" | "EVENT" | "ARTWORK";

function makeSubmission(type: SubmissionType) {
  return {
    id: `sub-${type.toLowerCase()}`,
    type,
    status: "IN_REVIEW" as const,
    submitterUserId: "submitter-1",
    targetArtistId: type === "ARTIST" ? "artist-1" : null,
    targetVenueId: type === "VENUE" ? "venue-1" : null,
    targetEventId: type === "EVENT" ? "event-1" : null,
    note: type === "ARTWORK" ? "artworkId:artwork-1" : null,
    submitter: { id: "submitter-1", email: "submitter@example.com" },
    targetVenue: type === "VENUE" ? { id: "venue-1", slug: "venue-one" } : null,
    targetEvent: type === "EVENT" ? { id: "event-1", slug: "event-one" } : null,
  };
}

function makeHarness(submission: ReturnType<typeof makeSubmission>) {
  const calls: Record<string, { where: { id: string }; data: Record<string, unknown> } | null> = {
    artist: null,
    venue: null,
    event: null,
    artwork: null,
  };
  let submissionUpdate: { decidedAt?: Date; status?: string } | null = null;

  const dbHarness = {
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      submission: {
        findUnique: async () => submission,
        update: async ({ data }: { data: { decidedAt: Date; status: string } }) => {
          submissionUpdate = data;
          return { ...submission, ...data };
        },
      },
      artist: { update: async (payload: { where: { id: string }; data: Record<string, unknown> }) => { calls.artist = payload; } },
      venue: { update: async (payload: { where: { id: string }; data: Record<string, unknown> }) => { calls.venue = payload; } },
      event: { update: async (payload: { where: { id: string }; data: Record<string, unknown> }) => { calls.event = payload; } },
      artwork: { update: async (payload: { where: { id: string }; data: Record<string, unknown> }) => { calls.artwork = payload; } },
      adminAuditLog: { create: async () => undefined },
      notification: { create: async () => undefined },
    }),
  };

  return { dbHarness, calls, getSubmissionUpdate: () => submissionUpdate };
}

function assertPublishedData(data: Record<string, unknown>, decidedAt: Date) {
  assert.equal(data.isPublished, true);
  assert.equal(data.status, "PUBLISHED");
  assert.equal(data.publishedAt, decidedAt);
}

test("artist approval sets isPublished, status, and publishedAt", async () => {
  const submission = makeSubmission("ARTIST");
  const { dbHarness, calls, getSubmissionUpdate } = makeHarness(submission);

  await decideSubmission({ submissionId: submission.id, actor: { id: "admin-1", role: "ADMIN" }, decision: "APPROVE" }, dbHarness as never);

  const decidedAt = getSubmissionUpdate()?.decidedAt;
  assert.ok(decidedAt);
  assert.ok(calls.artist);
  assertPublishedData(calls.artist.data, decidedAt);
});

test("venue approval sets isPublished, status, and publishedAt", async () => {
  const submission = makeSubmission("VENUE");
  const { dbHarness, calls, getSubmissionUpdate } = makeHarness(submission);

  await decideSubmission({ submissionId: submission.id, actor: { id: "admin-1", role: "ADMIN" }, decision: "APPROVE" }, dbHarness as never);

  const decidedAt = getSubmissionUpdate()?.decidedAt;
  assert.ok(decidedAt);
  assert.ok(calls.venue);
  assertPublishedData(calls.venue.data, decidedAt);
});

test("event approval still sets isPublished, status, and publishedAt", async () => {
  const submission = makeSubmission("EVENT");
  const { dbHarness, calls, getSubmissionUpdate } = makeHarness(submission);

  await decideSubmission({ submissionId: submission.id, actor: { id: "admin-1", role: "ADMIN" }, decision: "APPROVE" }, dbHarness as never);

  const decidedAt = getSubmissionUpdate()?.decidedAt;
  assert.ok(decidedAt);
  assert.ok(calls.event);
  assertPublishedData(calls.event.data, decidedAt);
});

test("artwork approval sets isPublished, status, and publishedAt", async () => {
  const submission = makeSubmission("ARTWORK");
  const { dbHarness, calls, getSubmissionUpdate } = makeHarness(submission);

  await decideSubmission({ submissionId: submission.id, actor: { id: "admin-1", role: "ADMIN" }, decision: "APPROVE" }, dbHarness as never);

  const decidedAt = getSubmissionUpdate()?.decidedAt;
  assert.ok(decidedAt);
  assert.ok(calls.artwork);
  assertPublishedData(calls.artwork.data, decidedAt);
});
