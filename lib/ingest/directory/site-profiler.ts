import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { detectPlatform } from "@/lib/ingest/detect-platform";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { logInfo, logWarn } from "@/lib/logging";

export type DetectedSection = {
  name: string;
  url: string;
  contentType: "artist" | "event" | "exhibition" | "artwork" | "unknown";
  indexPattern: string | null;
  linkPattern: string | null;
  paginationType: "letter" | "numbered" | "none";
  confidence: number;
};

export type SiteProfileResult = {
  hostname: string;
  platform: string | null;
  directoryUrl: string | null;
  indexPattern: string | null;
  linkPattern: string | null;
  paginationType: "letter" | "numbered" | "none";
  exhibitionPattern: string | null;
  sampleProfileUrls: string[];
  estimatedArtistCount: number | null;
  confidence: number;
  reasoning: string;
  analysisError: string | null;
  detectedSections: DetectedSection[];
};

const siteProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "directoryUrl",
    "indexPattern",
    "linkPattern",
    "paginationType",
    "exhibitionPattern",
    "sampleProfileUrls",
    "estimatedArtistCount",
    "confidence",
    "reasoning",
    "detectedSections",
  ],
  properties: {
    directoryUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    indexPattern: { anyOf: [{ type: "string" }, { type: "null" }] },
    linkPattern: { anyOf: [{ type: "string" }, { type: "null" }] },
    paginationType: { type: "string", enum: ["letter", "numbered", "none"] },
    exhibitionPattern: { anyOf: [{ type: "string" }, { type: "null" }] },
    sampleProfileUrls: { type: "array", items: { type: "string" } },
    estimatedArtistCount: { anyOf: [{ type: "integer" }, { type: "null" }] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    reasoning: { type: "string" },
    detectedSections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url", "contentType", "indexPattern", "linkPattern", "paginationType", "confidence"],
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          contentType: { type: "string", enum: ["artist", "event", "exhibition", "artwork", "unknown"] },
          indexPattern: { anyOf: [{ type: "string" }, { type: "null" }] },
          linkPattern: { anyOf: [{ type: "string" }, { type: "null" }] },
          paginationType: { type: "string", enum: ["letter", "numbered", "none"] },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
} as const;

const PROFILER_SYSTEM_PROMPT = [
  "You are analysing an art website to determine the structure of its content sections.",
  "You will be given the HTML of the site's homepage or a likely directory page.",
  "",
  "Your task:",
  "1. Find ALL content sections of the site — not just the artist directory.",
  "   Look for sections covering: artists, exhibitions, events, what's-on, artworks, training.",
  "2. For each section, determine:",
  "   - name: human-readable label (e.g. 'Artists A-Z', 'Exhibitions', 'What's On')",
  "   - url: the section's base URL",
  "   - contentType: artist | event | exhibition | artwork | unknown",
  "   - indexPattern: URL pattern with [letter] or [page] placeholders if paginated",
  "   - linkPattern: regex matching individual item URLs within the section",
  "   - paginationType: letter | numbered | none",
  "   - confidence: 0-100 for how certain you are about this section",
  "3. Also identify the primary artist directory specifically for the top-level fields.",
  "4. Find 3-5 sample artist profile URLs.",
  "",
  "Rules:",
  "- Only return sections you can directly observe navigation links for.",
  "- Do not invent sections that are not linked from the page.",
  "- Confidence 80+ means certain. 50-79 means probable. Below 50 means uncertain.",
  "- Return empty array for detectedSections if no clear sections are found.",
].join("\n");

function findCandidateDirectoryUrl(baseUrl: string, html: string): string | null {
  const hostname = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return "";
    }
  })();
  const patterns = [
    /<a\b[^>]*href=["']([^"']*\/artists?\/?[^"'#?]*)["']/gi,
    /<a\b[^>]*href=["']([^"']*\/directory\/?[^"'#?]*)["']/gi,
  ];
  for (const rx of patterns) {
    let match: RegExpExecArray | null;
    while ((match = rx.exec(html)) !== null) {
      try {
        const resolved = new URL(match[1] ?? "", baseUrl);
        if (
          resolved.hostname === hostname
          || resolved.hostname === `www.${hostname}`
          || `www.${resolved.hostname}` === hostname
        ) {
          return resolved.toString();
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function analyseSite(args: {
  url: string;
  aiApiKey: string;
  aiProviderName?: ProviderName;
}): Promise<SiteProfileResult> {
  const normalizedUrl = /^https?:\/\//i.test(args.url) ? args.url : `https://${args.url}`;
  const hostname = (() => {
    try {
      return new URL(normalizedUrl).hostname.replace(/^www\./, "");
    } catch {
      return args.url;
    }
  })();

  logInfo({ message: "site_profiler_start", hostname });

  let homepageHtml = "";
  let homepageFinalUrl = normalizedUrl;
  try {
    const fetched = await fetchHtmlWithGuards(normalizedUrl);
    homepageHtml = fetched.html;
    homepageFinalUrl = fetched.finalUrl;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logWarn({ message: "site_profiler_homepage_fetch_failed", hostname, error });
    return {
      hostname,
      platform: null,
      directoryUrl: null,
      indexPattern: null,
      linkPattern: null,
      paginationType: "letter",
      exhibitionPattern: null,
      sampleProfileUrls: [],
      estimatedArtistCount: null,
      confidence: 0,
      reasoning: "",
      analysisError: error,
      detectedSections: [],
    };
  }

  const platform = detectPlatform(homepageHtml, homepageFinalUrl);
  const candidateDirectoryUrl = findCandidateDirectoryUrl(homepageFinalUrl, homepageHtml);

  let directoryHtml = homepageHtml;
  let directoryFinalUrl = homepageFinalUrl;
  if (candidateDirectoryUrl && candidateDirectoryUrl !== homepageFinalUrl) {
    try {
      const fetched = await fetchHtmlWithGuards(candidateDirectoryUrl);
      directoryHtml = fetched.html;
      directoryFinalUrl = fetched.finalUrl;
    } catch {
      // fall back to homepage
    }
  }

  const provider = getProvider(args.aiProviderName ?? "claude");
  try {
    const result = await provider.extract({
      html: `Page URL: ${directoryFinalUrl}\n\n${preprocessHtml(directoryHtml)}`,
      sourceUrl: directoryFinalUrl,
      systemPrompt: PROFILER_SYSTEM_PROMPT,
      jsonSchema: siteProfileSchema,
      model: "",
      apiKey: args.aiApiKey,
    });

    if (!result.raw || typeof result.raw !== "object") {
      throw new Error("AI returned no structured data");
    }

    const raw = result.raw as Record<string, unknown>;
    return {
      hostname,
      platform: platform !== "unknown" ? platform : null,
      directoryUrl: (raw.directoryUrl as string | null) ?? candidateDirectoryUrl,
      indexPattern: (raw.indexPattern as string | null) ?? null,
      linkPattern: (raw.linkPattern as string | null) ?? null,
      paginationType: (raw.paginationType as "letter" | "numbered" | "none") ?? "letter",
      exhibitionPattern: (raw.exhibitionPattern as string | null) ?? null,
      sampleProfileUrls: ((raw.sampleProfileUrls as string[] | null) ?? []).slice(0, 5),
      estimatedArtistCount: (raw.estimatedArtistCount as number | null) ?? null,
      confidence: (raw.confidence as number) ?? 0,
      reasoning: (raw.reasoning as string) ?? "",
      analysisError: null,
      detectedSections: Array.isArray(raw.detectedSections)
        ? (raw.detectedSections as DetectedSection[]).filter(
          (section) => section.url && section.contentType && section.name
        )
        : [],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logWarn({ message: "site_profiler_ai_failed", hostname, error });
    return {
      hostname,
      platform: platform !== "unknown" ? platform : null,
      directoryUrl: candidateDirectoryUrl,
      indexPattern: null,
      linkPattern: null,
      paginationType: "letter",
      exhibitionPattern: null,
      sampleProfileUrls: [],
      estimatedArtistCount: null,
      confidence: 0,
      reasoning: "",
      analysisError: error,
      detectedSections: [],
    };
  }
}
