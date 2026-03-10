export type ExtractionParams = {
  html: string;
  sourceUrl: string;
  systemPrompt: string;
  jsonSchema: object;
  model: string;
  apiKey: string;
  maxOutputTokens?: number;
};

export type ExtractionResult = {
  raw: unknown;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model: string;
};

export interface ExtractionProvider {
  name: "openai" | "gemini" | "claude";
  extract(params: ExtractionParams): Promise<ExtractionResult>;
}
