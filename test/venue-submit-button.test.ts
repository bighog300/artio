import test from "node:test";
import assert from "node:assert/strict";
import { deriveVenueSubmitButtonUiState, submitVenueForReviewRequest } from "../app/my/_components/VenueSubmitButton";

test("deriveVenueSubmitButtonUiState disables CTA when not ready", () => {
  const state = deriveVenueSubmitButtonUiState({
    isReady: false,
    initialStatus: "DRAFT",
    isSubmitting: false,
    locallySubmitted: false,
  });

  assert.equal(state.label, "Submit Venue for Review");
  assert.equal(state.disabled, true);
  assert.match(state.helperText, /Complete required fields/i);
});

test("submitVenueForReviewRequest posts to venue submit endpoint", async () => {
  let calledUrl = "";
  let calledInit: RequestInit | undefined;

  const result = await submitVenueForReviewRequest({
    venueId: "venue_123",
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      calledUrl = String(input);
      calledInit = init;
      return new Response(null, { status: 204 });
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calledUrl, "/api/my/venues/venue_123/submit");
  assert.equal(calledInit?.method, "POST");
  assert.equal((calledInit?.headers as Record<string, string>)?.["Content-Type"], "application/json");
});

test("deriveVenueSubmitButtonUiState shows submitted state after success", () => {
  const state = deriveVenueSubmitButtonUiState({
    isReady: true,
    initialStatus: "DRAFT",
    isSubmitting: false,
    locallySubmitted: true,
  });

  assert.equal(state.label, "Submitted (pending)");
  assert.equal(state.disabled, true);
});

test("deriveVenueSubmitButtonUiState treats null submission as not submitted", () => {
  const state = deriveVenueSubmitButtonUiState({
    isReady: false,
    initialStatus: null,
    isSubmitting: false,
    locallySubmitted: false,
  });

  assert.equal(state.label, "Submit Venue for Review");
  assert.equal(state.disabled, true);
});

test("deriveVenueSubmitButtonUiState keeps submitted CTA disabled for pending status", () => {
  const state = deriveVenueSubmitButtonUiState({
    isReady: true,
    initialStatus: "PENDING",
    isSubmitting: false,
    locallySubmitted: false,
  });

  assert.equal(state.label, "Submitted (pending)");
  assert.equal(state.disabled, true);
});
