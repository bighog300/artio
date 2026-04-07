import { IngestError } from "@/lib/ingest/errors";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import type { ExtractionParams, ExtractionProvider, ExtractionResult } from "./types";

type ResponseOutputContentItem = {
  type?: string;
  json?: unknown;
  text?: string;
};

type ResponseOutputItem = {
  content?: ResponseOutputContentItem[];
};

type OpenAIResponsesApiResponse = {
  output?: ResponseOutputItem[];
  response?: { output?: ResponseOutputItem[] };
  output_parsed?: unknown;
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

function getOutputItems(raw: OpenAIResponsesApiResponse): ResponseOutputItem[] {
  const primary = raw.output ?? [];
  const nested = raw.response?.output ?? [];
  return [...primary, ...nested];
}

function getStructuredPayload(raw: OpenAIResponsesApiResponse): unknown {
  if (raw.output_parsed !== undefined) return raw.output_parsed;

  const outputs = getOutputItems(raw);
  for (const item of outputs) {
    for (const contentItem of item.content ?? []) {
      if ((contentItem.type === "output_json" || contentItem.type === "json_schema") && contentItem.json !== undefined) {
        return contentItem.json;
      }
    }
  }

  if (typeof raw.output_text === "string" && raw.output_text.trim().length > 0) {
    try {
      return JSON.parse(raw.output_text);
    } catch {
      // Ignore and continue fallback order.
    }
  }

  for (const item of outputs) {
    for (const contentItem of item.content ?? []) {
      if (contentItem.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim().length > 0) {
        try {
          return JSON.parse(contentItem.text);
        } catch {
          // Ignore and continue scanning output_text items.
        }
      }
    }
  }

  return undefined;
}

async function extract(params: ExtractionParams): Promise<ExtractionResult> {
  const model = params.model?.trim() || "gpt-4o";
  const maxOutputTokens = params.maxOutputTokens ?? 4000;
  const processedHtml = preprocessHtml(params.html);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_output_tokens: maxOutputTokens,
      input: [
        {
          role: "system",
          content: params.systemPrompt,
        },
        {
          role: "user",
          content: [
            `Source URL: ${params.sourceUrl}`,
            "HTML:",
            processedHtml.slice(0, 120_000),
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "event_extraction",
          strict: true,
          schema: params.jsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new IngestError("PROVIDER_ERROR", "OpenAI extraction request failed", {
      status: response.status,
      responseTextPrefix: responseText.slice(0, 500),
      requestModel: model,
    });
  }

  const responseJson = (await response.json()) as OpenAIResponsesApiResponse;
  const raw = getStructuredPayload(responseJson);
  if (raw === undefined) {
    throw new IngestError("PROVIDER_ERROR", "OpenAI extraction response missing structured output");
  }

  return {
    raw,
    usage: {
      promptTokens: responseJson.usage?.input_tokens,
      completionTokens: responseJson.usage?.output_tokens,
      totalTokens: responseJson.usage?.total_tokens,
    },
    model,
  };
}

export const openAIProvider: ExtractionProvider = { name: "openai", extract };
