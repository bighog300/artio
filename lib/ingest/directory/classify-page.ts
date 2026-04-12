import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { logWarn } from "@/lib/logging";

export type PageType =
  | "artist_profile"
  | "event_detail"
  | "exhibition_overview"
  | "category_listing"
  | "artwork_detail"
  | "unknown";

export type ClassifyPageResult = {
  pageType: PageType;
  confidence: number;
  reasoning: string;
};

const classifyPageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pageType", "confidence", "reasoning"],
  properties: {
    pageType: {
      type: "string",
      enum: [
        "artist_profile",
        "event_detail",
        "exhibition_overview",
        "category_listing",
        "artwork_detail",
        "unknown",
      ],
    },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
  },
} as const;

const CLASSIFY_SYSTEM_PROMPT = [
  "You are classifying a single web page from an art website.",
  "Determine which ONE of the following page types best describes this page:",
  "",
  "- artist_profile: A page dedicated to one specific artist. Has their name, bio, and/or portfolio of works.",
  "- event_detail: A page for one specific event or show with a title, date(s), venue, and description.",
  "- exhibition_overview: A listing page showing multiple exhibitions or shows, often with dates and thumbnails.",
  "- category_listing: A directory or index page listing multiple artists, galleries, or artworks.",
  "- artwork_detail: A page dedicated to one specific artwork with title, medium, dimensions, price.",
  "- unknown: Does not clearly fit any of the above types.",
  "",
  "Rules:",
  "- Return exactly one pageType.",
  "- Confidence 80+ means certain. 50-79 means probable. Below 50 means uncertain.",
  "- Base your decision only on the content provided — do not guess from the URL alone.",
  "- If the page is a 404, login wall, or clearly broken, return unknown with confidence 0.",
].join("\n");

function ruleBasedClassify(url: string, html: string): ClassifyPageResult | null {
  const lower = html.toLowerCase();
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (/"@type"\s*:\s*"(Person|Artist)"/i.test(html)) {
    return { pageType: "artist_profile", confidence: 90, reasoning: "JSON-LD @type Person or Artist detected" };
  }

  if (/"@type"\s*:\s*"(Event|ExhibitionEvent|VisualArtEvent)"/i.test(html)) {
    return { pageType: "event_detail", confidence: 90, reasoning: "JSON-LD @type Event detected" };
  }

  if (/\/artists?\/?[a-z]?\/?$/.test(path) || /\/directory\/?$/.test(path)) {
    return { pageType: "category_listing", confidence: 75, reasoning: "URL matches artist directory pattern" };
  }

  const dateMatches = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*\d{4}/g);
  if (dateMatches && dateMatches.length >= 3) {
    return {
      pageType: "exhibition_overview",
      confidence: 70,
      reasoning: `${dateMatches.length} date patterns found — likely listing`,
    };
  }

  return null;
}

export async function classifyPage(args: {
  url: string;
  html: string;
  aiApiKey?: string | null;
  aiProviderName?: ProviderName;
}): Promise<ClassifyPageResult> {
  const ruleResult = ruleBasedClassify(args.url, args.html);
  if (ruleResult && ruleResult.confidence >= 70) {
    return ruleResult;
  }

  if (!args.aiApiKey) {
    return ruleResult ?? { pageType: "unknown", confidence: 0, reasoning: "No AI key and rules inconclusive" };
  }

  try {
    const provider = getProvider(args.aiProviderName ?? "claude");
    const processed = preprocessHtml(args.html).slice(0, 6000);

    const result = await provider.extract({
      html: `URL: ${args.url}\n\n${processed}`,
      sourceUrl: args.url,
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      jsonSchema: classifyPageSchema,
      model: "",
      apiKey: args.aiApiKey,
    });

    if (!result.raw || typeof result.raw !== "object") {
      return ruleResult ?? { pageType: "unknown", confidence: 0, reasoning: "AI returned no data" };
    }

    const raw = result.raw as { pageType?: string; confidence?: number; reasoning?: string };
    return {
      pageType: (raw.pageType as PageType) ?? "unknown",
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
      reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
    };
  } catch (err) {
    logWarn({
      message: "classify_page_ai_failed",
      url: args.url,
      error: err instanceof Error ? err.message : String(err),
    });
    return ruleResult ?? { pageType: "unknown", confidence: 0, reasoning: "AI classification failed" };
  }
}
