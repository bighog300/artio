import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import { openAIProvider } from "./openai";
import type { ExtractionProvider } from "./types";

export type ProviderName = "openai" | "gemini" | "claude";

export function getProvider(name: ProviderName | null | undefined): ExtractionProvider {
  switch (name) {
    case "gemini": return geminiProvider;
    case "claude": return claudeProvider;
    default: return openAIProvider;
  }
}

export type { ExtractionProvider, ExtractionParams, ExtractionResult } from "./types";
