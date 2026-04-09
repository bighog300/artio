import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/ingest/providers";

export const runtime = "nodejs";

const querySchema = z.object({
  provider: z.enum(["openai", "gemini", "claude"]),
});

function resolveKey(
  provider: "openai" | "gemini" | "claude",
  s: {
    openAiApiKey?: string | null;
    anthropicApiKey?: string | null;
    geminiApiKey?: string | null;
  },
): string {
  if (provider === "claude") {
    return s.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  }
  if (provider === "gemini") {
    return s.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "";
  }
  return s.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "";
}

export async function GET(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();

    const parsed = querySchema.safeParse({
      provider: req.nextUrl.searchParams.get("provider") ?? undefined,
    });

    if (!parsed.success) {
      return apiError(
        400,
        "invalid_request",
        "Invalid query params",
        parsed.error.flatten(),
      );
    }

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        openAiApiKey: true,
        anthropicApiKey: true,
        geminiApiKey: true,
        ingestModel: true,
      },
    });

    const apiKey = resolveKey(parsed.data.provider, settings ?? {});
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        provider: parsed.data.provider,
        errorMessage: "No API key configured for this provider",
        keyConfigured: false,
      });
    }

    const provider = getProvider(parsed.data.provider);
    const startedAt = Date.now();

    try {
      const result = await provider.extract({
        html: "Reply with the single word: OK",
        sourceUrl: "",
        systemPrompt:
          "You are a connectivity test. " +
          "Reply with only the word OK.",
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            reply: { type: "string" },
          },
          required: ["reply"],
        },
        model: settings?.ingestModel ?? "",
        apiKey,
        maxOutputTokens: 100,
      });

      return NextResponse.json(
        {
          ok: true,
          provider: parsed.data.provider,
          durationMs: Date.now() - startedAt,
          keyConfigured: true,
          model: result.model,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          provider: parsed.data.provider,
          durationMs: Date.now() - startedAt,
          keyConfigured: true,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Forbidden");
    }
    console.error("admin_ai_test_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
