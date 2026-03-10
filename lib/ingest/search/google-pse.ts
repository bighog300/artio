import type { SearchProvider, SearchResult } from "./types";

let quotaDate = "";
let dailyCalls = 0;

function enforceQuota() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDate) {
    quotaDate = today;
    dailyCalls = 0;
  }

  dailyCalls += 1;
  if (dailyCalls > 100) throw new Error("Google PSE daily quota of 100 queries exceeded");
}

export function createGooglePseProvider(apiKey: string, cx: string): SearchProvider {
  return {
    name: "google_pse",
    async search(query: string, maxResults: number): Promise<SearchResult[]> {
      enforceQuota();
      const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
      endpoint.searchParams.set("key", apiKey);
      endpoint.searchParams.set("cx", cx);
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("num", String(Math.min(maxResults, 10)));

      const response = await fetch(endpoint.toString());
      if (!response.ok) {
        throw new Error(`Google PSE search failed: ${response.status}`);
      }

      const body = await response.json() as { items?: Array<{ link?: string; title?: string; snippet?: string }> };
      return (body.items ?? [])
        .filter((item): item is { link: string; title?: string; snippet?: string } => typeof item.link === "string")
        .map((item) => ({ url: item.link, title: item.title ?? "", snippet: item.snippet ?? "" }));
    },
  };
}
