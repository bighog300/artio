import test from "node:test";
import assert from "node:assert/strict";
import { validateModerationTransition, ModerationDecisionError } from "../lib/moderation-decision-service";

test("validateModerationTransition allows configured transitions", () => {
  assert.doesNotThrow(() => validateModerationTransition("DRAFT", "IN_REVIEW"));
  assert.doesNotThrow(() => validateModerationTransition("APPROVED", "PUBLISHED"));
});

test("validateModerationTransition throws 400 for invalid transitions", () => {
  assert.throws(
    () => validateModerationTransition("DRAFT", "PUBLISHED"),
    (error: unknown) => error instanceof ModerationDecisionError && error.status === 400 && error.code === "invalid_transition",
  );
});
