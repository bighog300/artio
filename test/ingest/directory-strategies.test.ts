import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyChain } from "@/lib/ingest/directory/auto-detect";
import { AnchorDirectoryStrategy } from "@/lib/ingest/directory/strategies/anchor";
import type { DirectoryEntity, DirectoryExtractionStrategy } from "@/lib/ingest/directory/strategies/base";
import { JsonLdDirectoryStrategy } from "@/lib/ingest/directory/strategies/jsonld";
import { SitemapDirectoryStrategy } from "@/lib/ingest/directory/strategies/sitemap";

function mockHtmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

test("AnchorDirectoryStrategy finds profile links, rejects nav labels and letter index paths", async () => {
  const html = `
    <a href="/artists/alice-smith">Alice Smith</a>
    <a href="/artists/bob-jones">Bob Jones</a>
    <a href="/artists/a">A</a>
    <a href="/artists/c">C</a>
    <a href="/artists/page/2">Next Page</a>
    <a href="/artists/contact">Contact</a>
    <a href="https://other.com/artists/external">External Artist</a>
  `;

  const strategy = new AnchorDirectoryStrategy();
  const entities = await strategy.extractEntities({
    html,
    pageUrl: "https://example.com/artists",
    baseUrl: "https://example.com/artists",
    linkPattern: null,
  });

  assert.deepEqual(entities, [
    { entityUrl: "https://example.com/artists/alice-smith", entityName: "Alice Smith" },
    { entityUrl: "https://example.com/artists/bob-jones", entityName: "Bob Jones" },
  ]);
});

test("JsonLdDirectoryStrategy extracts person nodes and ignores non-person nodes", async () => {
  const html = `
    <script type="application/ld+json">{
      "@context": "https://schema.org",
      "@graph": [
        {"@type":"Organization", "name":"Gallery", "url":"/org"},
        {"@type":"Person", "name":"Alice", "url":"/artists/alice"},
        {"@type":"Event", "name":"Show"}
      ]
    }</script>
  `;

  const strategy = new JsonLdDirectoryStrategy();
  const entities = await strategy.extractEntities({
    html,
    pageUrl: "https://example.com/list",
    baseUrl: "https://example.com/list",
  });

  assert.deepEqual(entities, [{ entityUrl: "https://example.com/artists/alice", entityName: "Alice" }]);
});

test("SitemapDirectoryStrategy filters sitemap URLs by linkPattern", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/sitemap.xml")) {
      return mockHtmlResponse(`
        <urlset>
          <url><loc>https://example.com/artists/alice</loc></url>
          <url><loc>https://example.com/events/2024</loc></url>
          <url><loc>https://example.com/venues/space</loc></url>
        </urlset>
      `);
    }
    return mockHtmlResponse("<html></html>", 404);
  }) as typeof global.fetch;

  try {
    const strategy = new SitemapDirectoryStrategy();
    const entities = await strategy.extractEntities({
      html: "",
      pageUrl: "https://example.com/directory",
      baseUrl: "https://example.com",
      linkPattern: "^/artists/",
    });

    assert.deepEqual(entities, [{ entityUrl: "https://example.com/artists/alice", entityName: null }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildStrategyChain returns JSON-LD first and AI last only when key provided", () => {
  const html = '<script type="application/ld+json">{"@type":"Person","name":"A","url":"/a"}</script>';
  const withAi = buildStrategyChain({ html, aiApiKey: "secret" });
  assert.equal(withAi[0]?.name, "jsonld");
  assert.equal(withAi.at(-1)?.name, "ai");

  const noAi = buildStrategyChain({ html: "<html><body>no jsonld</body></html>", aiApiKey: null });
  assert.deepEqual(noAi.map((s) => s.name), ["sitemap", "anchor"]);
});

test("strategy chain runner stops at first non-empty strategy and falls through empties", async () => {
  class StubStrategy implements DirectoryExtractionStrategy {
    readonly name: string;
    private result: DirectoryEntity[];

    constructor(name: string, result: DirectoryEntity[]) {
      this.name = name;
      this.result = result;
    }

    async extractEntities(): Promise<DirectoryEntity[]> {
      return this.result;
    }
  }

  const calls: string[] = [];
  async function runChain(chain: DirectoryExtractionStrategy[]) {
    for (const strategy of chain) {
      calls.push(strategy.name);
      const found = await strategy.extractEntities({ html: "", pageUrl: "", baseUrl: "" });
      if (found.length > 0) return { used: strategy.name, found };
    }
    return { used: "none", found: [] as DirectoryEntity[] };
  }

  const chain = [
    new StubStrategy("jsonld", []),
    new StubStrategy("sitemap", []),
    new StubStrategy("anchor", [{ entityUrl: "https://example.com/a", entityName: "A" }]),
    new StubStrategy("ai", [{ entityUrl: "https://example.com/b", entityName: "B" }]),
  ];

  const result = await runChain(chain);
  assert.equal(result.used, "anchor");
  assert.deepEqual(calls, ["jsonld", "sitemap", "anchor"]);
});
