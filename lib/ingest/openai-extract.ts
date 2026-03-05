import { IngestError } from "@/lib/ingest/errors";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";

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

export type VenueSnapshot = {
  venueDescription?: string | null;
  venueCoverImageUrl?: string | null;
  venueOpeningHours?: string | null;
  venueContactEmail?: string | null;
  venueInstagramUrl?: string | null;
  venueFacebookUrl?: string | null;
};

export type ExtractUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type StructuredExtractResponse = {
  events: ExtractedEvent[];
  venueDescription?: string | null;
  venueCoverImageUrl?: string | null;
  venueOpeningHours?: string | null;
  venueContactEmail?: string | null;
  venueInstagramUrl?: string | null;
  venueFacebookUrl?: string | null;
};

const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events", "venueDescription", "venueCoverImageUrl", "venueOpeningHours", "venueContactEmail", "venueInstagramUrl", "venueFacebookUrl"],
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
    venueDescription: { type: ["string", "null"] },
    venueCoverImageUrl: { type: ["string", "null"] },
    venueOpeningHours: { type: ["string", "null"] },
    venueContactEmail: { type: ["string", "null"] },
    venueInstagramUrl: { type: ["string", "null"] },
    venueFacebookUrl: { type: ["string", "null"] },
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

export function isExtractResponse(value: unknown): value is StructuredExtractResponse {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Record<string, unknown>;
  if (!Array.isArray(maybe.events)) return false;

  const topLevelOptional = ["venueDescription", "venueCoverImageUrl", "venueOpeningHours", "venueContactEmail", "venueInstagramUrl", "venueFacebookUrl"];
  const hasValidTopLevel = topLevelOptional.every(
    (key) => maybe[key] === undefined || typeof maybe[key] === "string" || maybe[key] === null,
  );
  if (!hasValidTopLevel) return false;

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
  systemPromptOverride?: string | null;
  modelOverride?: string | null;
  maxOutputTokensOverride?: number | null;
  venueContext?: {
    name: string;
    address: string | null;
  };
  _preprocessHtml?: (html: string) => string;
}): Promise<{ model: string; events: ExtractedEvent[]; venueSnapshot: VenueSnapshot; raw: unknown; usage?: ExtractUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new IngestError("FETCH_FAILED", "OPENAI_API_KEY is required for extraction");
  }

  const model = params.modelOverride?.trim()
    || params.model?.trim()
    || process.env.OPENAI_MODEL?.trim()
    || "gpt-4o-mini";
  const maxOutputTokens = params.maxOutputTokensOverride ?? 4000;
  const preprocess = params._preprocessHtml ?? preprocessHtml;
  const processedHtml = preprocess(params.html);
  const today = new Date().toISOString().slice(0, 10);
  const venueLine = params.venueContext
    ? `Venue name: ${params.venueContext.name}${params.venueContext.address ? `\nVenue address: ${params.venueContext.address}` : ""}`
    : "";

  const staticPromptLines = params.systemPromptOverride?.trim()
    ? [params.systemPromptOverride.trim()]
    : [
      "You are extracting structured data from a venue website. Your output must contain",
      "two things: a list of upcoming events, and venue profile data observed from the same page.",
      "",
      "EVENTS",
      "Extract ONLY upcoming events (startAt in the future). Ignore navigation links,",
      "past events, and page furniture. For artistNames return only names clearly",
      "attributed to this event — do not include venue staff or sponsors.",
      "For imageUrl: find the image specific to THIS event — look first in any",
      "application/ld+json script blocks for an Event or ExhibitionEvent 'image'",
      "property, then in <img> tags adjacent to the event title or description,",
      "then in og:image meta tags only if the page covers a single event.",
      "Do NOT return the venue's global hero, banner, or logo image.",
      "If the src is relative, return it as-is — do not attempt to resolve it.",
      "If no event-specific image is found, return null.",
      "",
      "VENUE PROFILE",
      "Extract the following from the page. Only return values you are confident about —",
      "if unsure, return null. Do not invent values.",
      "venueDescription: A factual 1-3 sentence description of the venue. Null if insufficient.",
      "venueCoverImageUrl: Primary image of the venue itself — exterior, interior, or official",
      "venue image. Use og:image only if clearly a venue image not event-specific.",
      "Do not return event artwork. Return relative src as-is. Null if not found.",
      "venueOpeningHours: Opening hours as a plain string if present. Null if not found.",
      "venueContactEmail: General contact email visible on the page. Null if not found.",
      "venueInstagramUrl: Full https:// URL of the venue Instagram profile. Null if not found.",
      "venueFacebookUrl: Full https:// URL of the venue Facebook page. Null if not found.",
      "Return results in the provided schema.",
    ];

  const systemPrompt = [
    "You are extracting upcoming art events from a venue website.",
    venueLine,
    `Today's date: ${today}`,
    "",
    ...staticPromptLines,
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
        processedHtml.slice(0, 120_000),
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
  const venueSnapshot: VenueSnapshot = {
    venueDescription: typeof parsed.venueDescription === "string" ? parsed.venueDescription.trim() || null : null,
    venueCoverImageUrl: typeof parsed.venueCoverImageUrl === "string" ? parsed.venueCoverImageUrl.trim() || null : null,
    venueOpeningHours: typeof parsed.venueOpeningHours === "string" ? parsed.venueOpeningHours.trim() || null : null,
    venueContactEmail: typeof parsed.venueContactEmail === "string" ? parsed.venueContactEmail.trim() || null : null,
    venueInstagramUrl: typeof parsed.venueInstagramUrl === "string" ? parsed.venueInstagramUrl.trim() || null : null,
    venueFacebookUrl: typeof parsed.venueFacebookUrl === "string" ? parsed.venueFacebookUrl.trim() || null : null,
  };

  const usage = raw.usage
    ? {
      promptTokens: raw.usage.input_tokens,
      completionTokens: raw.usage.output_tokens,
      totalTokens: raw.usage.total_tokens,
    }
    : undefined;

  return { model, events, venueSnapshot, raw: parsed, usage };
}
