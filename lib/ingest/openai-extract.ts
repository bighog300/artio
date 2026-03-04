import { IngestError } from "@/lib/ingest/errors";

export type ExtractedEvent = {
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string | null;
  locationText?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  artistNames?: string[] | null;
  imageUrl?: string | null;
};

export type ExtractUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type StructuredExtractResponse = {
  events: ExtractedEvent[];
};

const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "startAt", "endAt", "timezone", "locationText", "description", "sourceUrl", "artistNames", "imageUrl"],
        properties: {
          title: { type: "string", minLength: 1 },
          startAt: { type: ["string", "null"] },
          endAt: { type: ["string", "null"] },
          timezone: { type: ["string", "null"] },
          locationText: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          sourceUrl: { type: ["string", "null"] },
          artistNames: { type: "array", items: { type: "string" } },
          imageUrl: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

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
      if (contentItem.type === "output_json" || contentItem.type === "json_schema") {
        if (contentItem.json !== undefined) return contentItem.json;
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

function buildModelOutputDebugSignature(raw: OpenAIResponsesApiResponse) {
  const outputs = getOutputItems(raw);
  const contentTypes = outputs
    .flatMap((item) => item.content ?? [])
    .map((item) => item.type)
    .filter((type): type is string => typeof type === "string")
    .slice(0, 10);

  return {
    has_output_parsed: raw.output_parsed !== undefined,
    output_item_count: outputs.length,
    content_types: contentTypes,
    has_output_text: typeof raw.output_text === "string" && raw.output_text.length > 0,
    output_text_length: typeof raw.output_text === "string" ? raw.output_text.length : null,
    output_text_prefix: typeof raw.output_text === "string" && raw.output_text.length > 0
      ? raw.output_text.slice(0, 200)
      : undefined,
  };
}

function isExtractResponse(value: unknown): value is StructuredExtractResponse {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { events?: unknown };
  if (!Array.isArray(maybe.events)) return false;

  return maybe.events.every((event) => {
    if (!event || typeof event !== "object") return false;
    const maybeEvent = event as Record<string, unknown>;
    if (typeof maybeEvent.title !== "string" || maybeEvent.title.trim().length === 0) return false;

    const optionalStringOrNull = ["startAt", "endAt", "timezone", "locationText", "description", "sourceUrl"];
    const hasValidOptionalStrings = optionalStringOrNull
      .every((key) => maybeEvent[key] === undefined || typeof maybeEvent[key] === "string" || maybeEvent[key] === null);
    const hasValidArtistNames = maybeEvent.artistNames === undefined
      || maybeEvent.artistNames === null
      || (Array.isArray(maybeEvent.artistNames) && maybeEvent.artistNames.every((name) => typeof name === "string"));
    const hasValidImageUrl = maybeEvent.imageUrl === undefined || typeof maybeEvent.imageUrl === "string" || maybeEvent.imageUrl === null;

    return hasValidOptionalStrings && hasValidArtistNames && hasValidImageUrl;
  });
}

export async function extractEventsWithOpenAI(params: {
  html: string;
  sourceUrl: string;
  model?: string;
  venueContext?: {
    name: string;
    address: string | null;
  };
}): Promise<{ model: string; events: ExtractedEvent[]; raw: unknown; usage?: ExtractUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new IngestError("FETCH_FAILED", "OPENAI_API_KEY is required for extraction");
  }

  const model = params.model?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const maxOutputTokens = 4000;
  const today = new Date().toISOString().slice(0, 10);
  const venueLine = params.venueContext
    ? `Venue name: ${params.venueContext.name}${params.venueContext.address ? `\nVenue address: ${params.venueContext.address}` : ""}`
    : "";

  const systemPrompt = [
    "You are extracting upcoming art events from a venue website.",
    venueLine,
    `Today's date: ${today}`,
    "",
    "Extract ONLY upcoming events (startAt in the future). Ignore navigation links,",
    "past events, and page furniture. For artistNames return only names clearly",
    "attributed to this event — do not include venue staff or sponsors.",
    "For imageUrl return the full absolute URL of the primary event image if",
    "present in the HTML, otherwise null.",
    "Return results in the provided schema.",
  ].filter(Boolean).join("\n");

  const input = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: [
        `Source URL: ${params.sourceUrl}`,
        "HTML:",
        params.html.slice(0, 120_000),
      ].join("\n"),
    },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_output_tokens: maxOutputTokens,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "event_extraction",
          strict: true,
          schema: extractionJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new IngestError("FETCH_FAILED", "OpenAI extraction request failed", {
      status: response.status,
      responseTextPrefix: responseText.slice(0, 500),
      requestModel: model,
      requestMaxOutputTokens: maxOutputTokens,
      requestHasTextFormat: true,
    });
  }

  const raw = (await response.json()) as OpenAIResponsesApiResponse;
  const parsed = getStructuredPayload(raw);
  if (!isExtractResponse(parsed)) {
    throw new IngestError("BAD_MODEL_OUTPUT", "OpenAI output did not match expected event schema", {
      debug: buildModelOutputDebugSignature(raw),
    });
  }

  const events = parsed.events;

  const usage = raw.usage
    ? {
      promptTokens: raw.usage.input_tokens,
      completionTokens: raw.usage.output_tokens,
      totalTokens: raw.usage.total_tokens,
    }
    : undefined;

  return { model, events, raw: parsed, usage };
}
