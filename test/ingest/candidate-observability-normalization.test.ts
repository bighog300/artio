import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApprovalError, normalizeImageImportError, normalizeImageImportWarning } from "@/lib/ingest/candidate-observability";

test("normalizeApprovalError maps slug collisions", () => {
  const code = normalizeApprovalError(new Error("Unique constraint failed on the fields: (`slug`)"));
  assert.equal(code, "slug_collision");
});

test("normalizeApprovalError maps generic transaction/db failures", () => {
  const code = normalizeApprovalError(new Error("Transaction API error: deadlock detected"));
  assert.equal(code, "db_transaction_failed");
});

test("normalizeImageImportWarning maps no image found", () => {
  assert.equal(normalizeImageImportWarning("no image found on source page"), "no_image_found");
});

test("normalizeImageImportError maps fetch/download failures", () => {
  assert.equal(normalizeImageImportError(new Error("fetch timeout while downloading")), "image_download_failed");
  assert.equal(normalizeImageImportError(new Error("network fetch failed")), "image_fetch_failed");
});

test("normalizeImageImportWarning keeps image_already_attached stable", () => {
  assert.equal(normalizeImageImportWarning("image_already_attached"), "image_already_attached");
});
