import test from "node:test";
import assert from "node:assert/strict";
import {
  canEditSubmission,
  canManageVenueMembers,
  canRemoveOwnerMember,
  hasMinimumVenueRole,
  nextSubmissionStatusForSubmit,
} from "../lib/ownership.ts";

test("venue membership authz role precedence", () => {
  assert.equal(hasMinimumVenueRole("OWNER", "EDITOR"), true);
  assert.equal(hasMinimumVenueRole("OWNER", "OWNER"), true);
  assert.equal(hasMinimumVenueRole("EDITOR", "OWNER"), false);
});

test("cannot remove last OWNER", () => {
  assert.equal(canRemoveOwnerMember(1, "OWNER"), false);
  assert.equal(canRemoveOwnerMember(2, "OWNER"), true);
  assert.equal(canRemoveOwnerMember(1, "EDITOR"), true);
});

test("only OWNER or global ADMIN can manage members", () => {
  assert.equal(canManageVenueMembers("EDITOR", false), false);
  assert.equal(canManageVenueMembers("OWNER", false), true);
  assert.equal(canManageVenueMembers("EDITOR", true), true);
});

test("rejected submission can be resubmitted", () => {
  assert.equal(canEditSubmission("REJECTED"), true);
  assert.equal(nextSubmissionStatusForSubmit("REJECTED"), "IN_REVIEW");
  assert.equal(nextSubmissionStatusForSubmit("DRAFT"), "IN_REVIEW");
  assert.equal(nextSubmissionStatusForSubmit("APPROVED"), null);
  assert.equal(nextSubmissionStatusForSubmit("IN_REVIEW"), null);
});
