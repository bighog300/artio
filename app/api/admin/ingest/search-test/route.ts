import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSearchProvider } from "@/lib/ingest/search";

export const runtime = "nodejs";

const querySchema = z.object({
  provider: z.enum(["google_pse", "brave"]).default("google_pse"),
  query: z.string().min(1).max(200).default("contemporary art gallery"),
  maxResults: z.coerce.number().int().min(1).max(5).default(3),
});

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();

    const parsed = querySchema.safeParse({
      provider: req.nextUrl.searchParams.get("provider") ?? undefined,
      query: req.nextUrl.searchParams.get("query") ?? undefined,
      maxResults: req.nextUrl.searchParams.get("maxResults") ?? undefined,
    });

    if (!parsed.success) return apiError(400, "invalid_request", "Invalid query params", parsed.error.flatten());

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        googlePseApiKey: true,
        googlePseCx: true,
        braveSearchApiKey: true,
      },
    });

    const startedAt = Date.now();

    try {
      const provider = getSearchProvider(
        parsed.data.provider,
        {
          googlePseApiKey: settings?.googlePseApiKey,
          googlePseCx: settings?.googlePseCx,
          braveSearchApiKey: settings?.braveSearchApiKey,
        },
      );
      const results = await provider.search(
        parsed.data.query,
        parsed.data.maxResults,
      );

      return NextResponse.json({
        ok: true,
        provider: parsed.data.provider,
        query: parsed.data.query,
        durationMs: Date.now() - startedAt,
        resultsCount: results.length,
        results: results.map((r) => ({
          url: r.url,
          title: r.title,
          snippet: r.snippet.slice(0, 120),
        })),
        keysConfigured: {
          googlePseApiKey: Boolean(settings?.googlePseApiKey),
          googlePseCx: Boolean(settings?.googlePseCx),
          braveSearchApiKey: Boolean(settings?.braveSearchApiKey),
        },
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      let suggestion: string | null = null;
      if (message.includes("accessNotConfigured") ||
        message.includes("API has not been used")) {
        suggestion =
          "Enable Custom Search API in Google Cloud " +
          "Console → APIs & Services → Library";
      } else if (message.includes("keyInvalid") ||
        message.includes("API key not valid")) {
        suggestion =
          "API key is invalid — regenerate in " +
          "Google Cloud Console → APIs & Services " +
          "→ Credentials";
      } else if (message.includes("quota") ||
        message.includes("429")) {
        suggestion =
          "Daily quota exceeded (100 queries/day " +
          "on free tier) — wait 24h or upgrade " +
          "billing in Google Cloud";
      } else if (message.includes("400")) {
        suggestion =
          "Bad request — verify the CX (Search " +
          "Engine ID) in Settings is correct. " +
          "It should look like: " +
          "123456789012345678901:abcdefghijk";
      } else if (message.includes("not set") ||
        message.includes("not configured")) {
        suggestion =
          "Keys not saved — go to Settings and " +
          "save your Google PSE API Key and " +
          "Search Engine ID (CX)";
      }

      return NextResponse.json({
        ok: false,
        provider: parsed.data.provider,
        query: parsed.data.query,
        durationMs: Date.now() - startedAt,
        errorMessage: message,
        suggestion,
        keysConfigured: {
          googlePseApiKey: Boolean(settings?.googlePseApiKey),
          googlePseCx: Boolean(settings?.googlePseCx),
          braveSearchApiKey: Boolean(settings?.braveSearchApiKey),
        },
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_ingest_search_test_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
