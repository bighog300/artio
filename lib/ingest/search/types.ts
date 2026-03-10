export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

export interface SearchProvider {
  name: "google_pse" | "brave";
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}
