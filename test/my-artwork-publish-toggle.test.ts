import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requestArtworkPublishToggle } from "../app/my/_components/MyArtworkPublishToggleButton";

test("my artwork page uses ArtworkCardActions for card actions", () => {
  const source = readFileSync("app/my/artwork/page.tsx", "utf8");
  assert.doesNotMatch(source, /href=\{`\/api\/my\/artwork\/\$\{item\.id\}\/publish`\}/);
  assert.match(source, /ArtworkCardActions/);
});

test("publish toggle request uses PATCH with JSON body", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };

  await requestArtworkPublishToggle("art_123", false, mockFetch);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/my/artwork/art_123/publish");
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.deepEqual(calls[0]?.init?.headers, { "content-type": "application/json" });
  assert.equal(calls[0]?.init?.body, JSON.stringify({ isPublished: true }));
});
