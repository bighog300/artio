import assert from "node:assert/strict";
import test from "node:test";

import { buildModerationRequest } from "@/app/(admin)/admin/_components/SubmissionsModeration";

function makeItem(type: "EVENT" | "VENUE" | "ARTIST") {
  return {
    id: "sub_123",
    status: "SUBMITTED",
    type,
    note: null,
    decisionReason: null,
    submittedAt: null,
    decidedAt: null,
    submitter: { email: "admin@example.com", name: null },
    venue: null,
    targetEvent: null,
    targetVenue: null,
    targetArtist: null,
  } as const;
}

test("EVENT approve uses decision endpoint with APPROVED payload", () => {
  const request = buildModerationRequest(makeItem("EVENT"), "approve", null);
  assert.deepEqual(request, {
    endpoint: "/api/admin/submissions/sub_123/decision",
    payload: { decision: "APPROVED" },
  });
});

test("EVENT reject uses decision endpoint with rejectionReason payload", () => {
  const request = buildModerationRequest(makeItem("EVENT"), "reject", "Not enough detail");
  assert.deepEqual(request, {
    endpoint: "/api/admin/submissions/sub_123/decision",
    payload: { decision: "REJECTED", rejectionReason: "Not enough detail" },
  });
});

test("EVENT reject with blank reason is blocked client-side", () => {
  const request = buildModerationRequest(makeItem("EVENT"), "reject", "   ");
  assert.equal(request, null);
});

test("VENUE approve keeps approve endpoint with empty payload", () => {
  const request = buildModerationRequest(makeItem("VENUE"), "approve", null);
  assert.deepEqual(request, {
    endpoint: "/api/admin/submissions/sub_123/approve",
    payload: {},
  });
});

test("VENUE reject keeps request-changes endpoint and message payload", () => {
  const request = buildModerationRequest(makeItem("VENUE"), "reject", "Update photos");
  assert.deepEqual(request, {
    endpoint: "/api/admin/submissions/sub_123/request-changes",
    payload: { message: "Update photos" },
  });
});
