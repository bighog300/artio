import type { SearchProvider, SearchResult } from "./types";

export function createBraveProvider(apiKey: string): SearchProvider {
  return {
    name: "brave",
    async search(query: string, maxResults: number): Promise<SearchResult[]> {
      const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("count", String(Math.min(maxResults, 20)));

      const response = await fetch(endpoint.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errBody = await response.json() as {
            message?: string;
            error?: string;
            type?: string;
          };
          if (errBody.message) detail = ` — ${errBody.message}`;
          if (errBody.error) detail += ` (${errBody.error})`;
          if (errBody.type) detail += ` [${errBody.type}]`;
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(
          `Brave search failed: ${response.status}${detail}`,
        );
      }

      const body = await response.json() as { web?: { results?: Array<{ url?: string; title?: string; description?: string }> } };
      return (body.web?.results ?? [])
        .filter((item): item is { url: string; title?: string; description?: string } => typeof item.url === "string")
        .map((item) => ({ url: item.url, title: item.title ?? "", snippet: item.description ?? "" }));
    },
  };
}
