import { IngestError } from "@/lib/ingest/errors";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import type { ExtractionParams, ExtractionProvider, ExtractionResult } from "./types";

type ClaudeResponse = {
  content?: Array<{
    type?: string;
    name?: string;
    input?: unknown;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

async function extract(params: ExtractionParams): Promise<ExtractionResult> {
  const model = params.model?.trim() || "claude-haiku-4-5-20251001";
  const processedHtml = preprocessHtml(params.html);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: params.maxOutputTokens ?? 4096,
      system: params.systemPrompt,
      tools: [{
        name: "extract",
        description: "Extract structured data from the provided HTML content.",
        input_schema: params.jsonSchema,
      }],
      tool_choice: { type: "tool", name: "extract" },
      messages: [{ role: "user", content: processedHtml }],
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new IngestError("PROVIDER_ERROR", "Claude extraction request failed", {
      status: response.status,
      responseTextPrefix: responseText.slice(0, 500),
      requestModel: model,
    });
  }

  const data = (await response.json()) as ClaudeResponse;
  const toolUseBlock = data.content?.find((block) => block.type === "tool_use" && block.name === "extract");

  if (!toolUseBlock || toolUseBlock.input === undefined) {
    throw new IngestError("PROVIDER_ERROR", "Claude extraction response missing extract tool_use payload");
  }

  const promptTokens = data.usage?.input_tokens;
  const completionTokens = data.usage?.output_tokens;
  const totalTokens = (promptTokens ?? 0) + (completionTokens ?? 0);

  return {
    raw: toolUseBlock.input,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
    model,
  };
}

export const claudeProvider: ExtractionProvider = { name: "claude", extract };
