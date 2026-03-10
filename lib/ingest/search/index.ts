import { createBraveProvider } from "./brave";
import { createGooglePseProvider } from "./google-pse";

export type { SearchProvider, SearchResult } from "./types";

export function getSearchProvider(
  name: string,
  env: {
    googlePseApiKey?: string | null;
    googlePseCx?: string | null;
    braveSearchApiKey?: string | null;
  },
) {
  if (name === "brave") {
    const key = env.braveSearchApiKey ?? process.env.BRAVE_SEARCH_API_KEY;
    if (!key) throw new Error("Brave Search provider selected but BRAVE_SEARCH_API_KEY is not set");
    return createBraveProvider(key);
  }

  const key = env.googlePseApiKey ?? process.env.GOOGLE_PSE_API_KEY;
  const cx = env.googlePseCx ?? process.env.GOOGLE_PSE_CX;
  if (!key || !cx) {
    throw new Error("Google PSE provider selected but GOOGLE_PSE_API_KEY or GOOGLE_PSE_CX is not set");
  }

  return createGooglePseProvider(key, cx);
}
