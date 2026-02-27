import { IngestError } from "@/lib/ingest/errors";

export type ExtractedEvent = {
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string | null;
  locationText?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
};

export type ExtractUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export async function extractEventsWithOpenAI(params: {
  html: string;
  sourceUrl: string;
  model?: string;
}): Promise<{ model: string; events: ExtractedEvent[]; raw: unknown; usage?: ExtractUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new IngestError("FETCH_FAILED", "OPENAI_API_KEY is required for extraction");
  }

  const model = params.model ?? "gpt-4o-mini";
  const prompt = [
    "Extract event candidates from the provided venue HTML.",
    "Respond with JSON only.",
    "Return an array of objects with keys: title, startAt, endAt, timezone, locationText, description, sourceUrl.",
    "Use null when unknown.",
    `Source URL: ${params.sourceUrl}`,
    "HTML:",
    params.html.slice(0, 120_000),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new IngestError("FETCH_FAILED", "OpenAI extraction request failed", {
      status: response.status,
    });
  }

  const raw = (await response.json()) as {
    output_text?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  const outputText = raw.output_text;
  if (!outputText) {
    throw new IngestError("BAD_MODEL_OUTPUT", "OpenAI response did not include output_text");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new IngestError("BAD_MODEL_OUTPUT", "OpenAI output was not valid JSON");
  }

  const events = Array.isArray(parsed)
    ? (parsed as ExtractedEvent[])
    : (parsed as { events?: ExtractedEvent[] }).events;

  if (!Array.isArray(events)) {
    throw new IngestError("BAD_MODEL_OUTPUT", "OpenAI output must be an event array");
  }

  const usage = raw.usage
    ? {
      promptTokens: raw.usage.input_tokens,
      completionTokens: raw.usage.output_tokens,
      totalTokens: raw.usage.total_tokens,
    }
    : undefined;

  return { model, events, raw: parsed, usage };
}
