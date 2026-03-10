import { IngestError } from "@/lib/ingest/errors";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import type { ExtractionParams, ExtractionProvider, ExtractionResult } from "./types";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

async function extract(params: ExtractionParams): Promise<ExtractionResult> {
  const model = params.model?.trim() || "gemini-1.5-flash-8b";
  const processedHtml = preprocessHtml(params.html);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${params.systemPrompt}\n\n${processedHtml}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: params.jsonSchema,
        maxOutputTokens: params.maxOutputTokens ?? 4096,
      },
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new IngestError("PROVIDER_ERROR", "Gemini extraction request failed", {
      status: response.status,
      responseTextPrefix: responseText.slice(0, 500),
      requestModel: model,
    });
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new IngestError("PROVIDER_ERROR", "Gemini extraction response missing candidates payload");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new IngestError("PROVIDER_ERROR", "Gemini extraction response was not valid JSON");
  }

  return {
    raw,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount,
      completionTokens: data.usageMetadata?.candidatesTokenCount,
      totalTokens: data.usageMetadata?.totalTokenCount,
    },
    model,
  };
}

export const geminiProvider: ExtractionProvider = { name: "gemini", extract };
