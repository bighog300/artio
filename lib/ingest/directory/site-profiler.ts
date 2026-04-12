import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { detectPlatform } from "@/lib/ingest/detect-platform";
import { preprocessHtml } from "@/lib/ingest/preprocess-html";
import { getProvider, type ProviderName } from "@/lib/ingest/providers";
import { logInfo, logWarn } from "@/lib/logging";

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
  },
} as const;

const PROFILER_SYSTEM_PROMPT = [
  "You are analysing an art website to determine the structure of its artist directory.",
  "You will be given the HTML of the site's homepage or a likely directory page.",
  "",
  "Your task:",
  "1. Find the URL of the artists A-Z or alphabetical directory listing page.",
  "2. Determine how it is paginated — by letter (e.g. /artists/A, /artists/B), by number (e.g. /artists?page=1), or not paginated.",
  "3. Derive the URL index pattern using [letter] and [page] placeholders. Example: https://www.art.co.za/artists/[letter]",
  "4. Derive a regex linkPattern matching artist profile URL paths only — not category or listing pages. Example: /[a-z][a-z0-9]{3,}$",
  "5. Find 3-5 example artist profile URLs visible on the page.",
  "6. Note if artist profile pages have exhibition subpages (e.g. /artistname/2003.php).",
  "7. Estimate how many artists are listed in total if stated.",
  "",
  "Rules:",
  "- Only return patterns you can directly observe — do not invent.",
  "- The linkPattern regex must match profile paths specifically, excluding category pages like /artists/painting.",
  "- If you cannot find a directory return null for indexPattern and linkPattern.",
  "- Confidence 80+ means certain. 50-79 means probable. Below 50 means uncertain.",
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
    };
  }
}
