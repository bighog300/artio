import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleVenueGenerationPost } from "../lib/venue-generation/admin-venue-generation-handler";
import { VenueGenerationError } from "../lib/venue-generation/generation-pipeline";

test("POST /api/admin/venue-generation returns 502 with stable code when model output is missing", async () => {
  const req = new NextRequest("http://localhost/api/admin/venue-generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ country: "South Africa", region: "Western Cape" }),
  });

  const res = await handleVenueGenerationPost(req, {
    requireAdminFn: async () => ({ id: "11111111-1111-4111-8111-111111111111" }) as never,
    createOpenAiClientFn: async () => ({}) as never,
    runVenueGenerationPhase1Fn: async () => {
      throw new VenueGenerationError("OPENAI_BAD_OUTPUT", "OpenAI response did not include structured JSON output", {
        outputItems: 1,
      });
    },
    dbClient: {} as never,
    openAiApiKey: "test-key",
  });

  assert.equal(res.status, 502);
  const payload = await res.json();
  assert.equal(payload.error?.code, "OPENAI_BAD_OUTPUT");
  assert.match(payload.error?.message ?? "", /structured JSON output/i);
});
