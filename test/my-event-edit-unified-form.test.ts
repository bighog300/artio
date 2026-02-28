import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("event edit uses unified editor form with single save action", () => {
  const source = readFileSync("app/my/events/[eventId]/page-client.tsx", "utf8");
  assert.match(source, /export function EventEditorForm/);
  assert.match(source, /body: JSON\.stringify\(\{[\s\S]*eventType,[\s\S]*\}\)/);
  assert.match(source, /Save changes/);
  assert.equal((source.match(/Save changes/g) || []).length, 1);
  assert.equal((source.match(/method: "PATCH"/g) || []).length, 1);
});
