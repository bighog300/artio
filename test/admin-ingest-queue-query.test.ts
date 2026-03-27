import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArtistQueueWhere,
  buildArtworkQueueWhere,
  getQueueOrderBy,
  parseQueueQueryParams,
} from "../lib/admin-ingest-queue-query.ts";

test("parseQueueQueryParams normalizes ingest queue filters", () => {
  const query = parseQueueQueryParams(new URLSearchParams({
    approval: "failed",
    image: "imported",
    reason: "slug_collision",
    status: "PENDING",
    sort: "approval_attempt_desc",
    page: "3",
  }));

  assert.equal(query.approval, "failed");
  assert.equal(query.image, "imported");
  assert.equal(query.reason, "slug_collision");
  assert.equal(query.sort, "approval_attempt_desc");
  assert.equal(query.page, 3);
  assert.equal(query.status, "PENDING");
});

test("build queue where supports approval and image observability isolation", () => {
  const failedApproval = buildArtistQueueWhere({
    status: "PENDING",
    band: null,
    approval: "failed",
    image: "all",
    reason: "",
    sort: "updated_desc",
    page: 1,
  });
  assert.deepEqual(failedApproval, {
    status: "PENDING",
    AND: [{ lastApprovalError: { not: null } }],
  });

  const attemptedApproval = buildArtistQueueWhere({
    status: "PENDING",
    band: null,
    approval: "attempted",
    image: "all",
    reason: "",
    sort: "updated_desc",
    page: 1,
  });
  assert.deepEqual(attemptedApproval, {
    status: "PENDING",
    AND: [{ lastApprovalAttemptAt: { not: null } }, { lastApprovalError: null }],
  });

  const imageNotAttempted = buildArtworkQueueWhere({
    status: "PENDING",
    band: null,
    approval: "all",
    image: "not_attempted",
    reason: "",
    sort: "updated_desc",
    page: 1,
  });
  assert.deepEqual(imageNotAttempted, {
    status: "PENDING",
    AND: [
      {
        OR: [{ imageImportStatus: null }, { imageImportStatus: "not_attempted" }],
      },
    ],
  });
});

test("getQueueOrderBy supports default and approval attempt recency sort", () => {
  assert.deepEqual(getQueueOrderBy("updated_desc"), [{ updatedAt: "desc" }]);
  assert.deepEqual(getQueueOrderBy("approval_attempt_desc"), [
    { lastApprovalAttemptAt: "desc" },
    { updatedAt: "desc" },
  ]);
});
