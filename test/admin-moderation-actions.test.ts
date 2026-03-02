import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminModerationApprove, handleAdminModerationReject } from "../lib/admin-moderation-route";
import { ModerationDecisionError } from "../lib/moderation-decision-service";

const params = { submissionId: "11111111-1111-4111-8111-111111111111" };

test("approve transitions submitted and publishes entity", async () => {
  let approved = false;
  const res = await handleAdminModerationApprove("VENUE", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: "venue-1", targetEventId: null }),
    approveSubmission: async (_type, _submissionId, admin) => {
      approved = admin.id === "admin-1";
    },
  });

  assert.equal(res.status, 200);
  assert.equal(approved, true);
});


test("approve accepts editor role", async () => {
  let actorRole = "";
  const res = await handleAdminModerationApprove("EVENT", params, {
    requireAdminUser: async () => ({ id: "editor-1", email: "editor@example.com", role: "EDITOR" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: null, targetEventId: "event-1" }),
    approveSubmission: async (_type, _submissionId, admin) => {
      actorRole = admin.role;
    },
  });

  assert.equal(res.status, 200);
  assert.equal(actorRole, "EDITOR");
});

test("reject transitions submitted and does not publish", async () => {
  let rejectionReason = "";
  const req = new NextRequest("http://localhost/api/admin/moderation/venue/11111111-1111-4111-8111-111111111111/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rejectionReason: "Please add better photography and details." }),
  });

  const res = await handleAdminModerationReject(req, "VENUE", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: "venue-1", targetEventId: null }),
    rejectSubmission: async (_type, _submissionId, _admin, reason) => {
      rejectionReason = reason;
    },
  });

  assert.equal(res.status, 200);
  assert.equal(rejectionReason.length >= 5, true);
});

test("already decided returns 409", async () => {
  const res = await handleAdminModerationApprove("ARTIST", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "APPROVED", targetArtistId: "artist-1", targetVenueId: null, targetEventId: null }),
    approveSubmission: async () => undefined,
  });

  assert.equal(res.status, 409);
});

test("approve maps moderation decision errors to api responses", async () => {
  const res = await handleAdminModerationApprove("EVENT", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: null, targetEventId: "event-1" }),
    approveSubmission: async () => {
      throw new ModerationDecisionError(403, "forbidden", "Editors cannot decide their own submissions");
    },
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error?.code, "forbidden");
});

test("reject maps moderation decision errors to api responses", async () => {
  const rejectReq = new NextRequest("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rejectionReason: "Need updates before publishing." }),
  });

  const res = await handleAdminModerationReject(rejectReq, "EVENT", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: null, targetEventId: "event-1" }),
    rejectSubmission: async () => {
      throw new ModerationDecisionError(403, "forbidden", "Editors cannot decide their own submissions");
    },
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error?.code, "forbidden");
});

test("approve/reject invoke audit-capable deps", async () => {
  const actions: string[] = [];
  await handleAdminModerationApprove("EVENT", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: null, targetEventId: "event-1" }),
    approveSubmission: async () => { actions.push("ADMIN_SUBMISSION_APPROVED"); },
  });

  const rejectReq = new NextRequest("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rejectionReason: "Need updates before publishing." }),
  });
  await handleAdminModerationReject(rejectReq, "EVENT", params, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    findSubmission: async () => ({ id: params.submissionId, status: "IN_REVIEW", targetArtistId: null, targetVenueId: null, targetEventId: "event-1" }),
    rejectSubmission: async () => { actions.push("ADMIN_SUBMISSION_REJECTED"); },
  });

  assert.deepEqual(actions, ["ADMIN_SUBMISSION_APPROVED", "ADMIN_SUBMISSION_REJECTED"]);
});
