import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getResendClient } from "@/lib/email/client";
import { getGoogleAccessTokenFromServiceAccount } from "@/lib/googleapis";
import { getProvider } from "@/lib/ingest/providers";
import { getSearchProvider } from "@/lib/ingest/search";

export const runtime = "nodejs";

type ServiceResult = {
  ok: boolean;
  configured: boolean;
  durationMs: number;
  detail?: string;
};

type StripeConstructor =
  new (apiKey: string) => {
    balance: {
      retrieve: () => Promise<{
        object: string;
        available: Array<{
          amount: number;
          currency: string;
        }>;
      }>;
    };
  };

async function loadStripe(): Promise<StripeConstructor> {
  const dyn = new Function("m", "return import(m)") as (
    m: string,
  ) => Promise<{ default?: unknown }>;
  const mod = await dyn("stripe");
  if (typeof mod.default !== "function") {
    throw new Error("stripe_unavailable");
  }
  return mod.default as StripeConstructor;
}

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

export async function GET() {
  noStore();
  try {
    await requireAdmin();

    const settings =
      await db.siteSettings.findUnique({
        where: { id: "default" },
        select: {
          googlePseApiKey: true,
          googlePseCx: true,
          braveSearchApiKey: true,
          openAiApiKey: true,
          anthropicApiKey: true,
          geminiApiKey: true,
          ingestModel: true,
          resendApiKey: true,
          resendFromAddress: true,
          stripeSecretKey: true,
          googleServiceAccountJson: true,
        },
      });

    const results = await Promise.allSettled([
      (async (): Promise<ServiceResult> => {
        if (!settings?.googlePseApiKey || !settings?.googlePseCx) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key or CX not configured",
          };
        }

        const startedAt = Date.now();
        try {
          const provider = getSearchProvider("google_pse", {
            googlePseApiKey: settings.googlePseApiKey,
            googlePseCx: settings.googlePseCx,
            braveSearchApiKey: settings.braveSearchApiKey,
          });
          await provider.search("art gallery", 1);
          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: "1 result returned",
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        if (!settings?.braveSearchApiKey) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key not configured",
          };
        }

        const startedAt = Date.now();
        try {
          const provider = getSearchProvider("brave", {
            googlePseApiKey: settings.googlePseApiKey,
            googlePseCx: settings.googlePseCx,
            braveSearchApiKey: settings.braveSearchApiKey,
          });
          await provider.search("art gallery", 1);
          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: "1 result returned",
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        const apiKey = resolveKey("openai", settings ?? {});
        if (!apiKey) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key not configured",
          };
        }

        const startedAt = Date.now();
        try {
          const provider = getProvider("openai");
          const result = await provider.extract({
            html: "Reply with OK",
            sourceUrl: "",
            systemPrompt: "Reply with only OK",
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
            maxOutputTokens: 10,
          });

          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: result.model,
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        const apiKey = resolveKey("gemini", settings ?? {});
        if (!apiKey) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key not configured",
          };
        }

        const startedAt = Date.now();
        try {
          const provider = getProvider("gemini");
          const result = await provider.extract({
            html: "Reply with OK",
            sourceUrl: "",
            systemPrompt: "Reply with only OK",
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
            maxOutputTokens: 10,
          });

          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: result.model,
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        const apiKey = resolveKey("claude", settings ?? {});
        if (!apiKey) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key not configured",
          };
        }

        const startedAt = Date.now();
        try {
          const provider = getProvider("claude");
          const result = await provider.extract({
            html: "Reply with OK",
            sourceUrl: "",
            systemPrompt: "Reply with only OK",
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
            maxOutputTokens: 10,
          });

          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: result.model,
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        const apiKey = settings?.resendApiKey?.trim() ?? process.env.RESEND_API_KEY ?? "";
        if (!apiKey) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key not configured",
          };
        }

        const fromAddress = settings?.resendFromAddress?.trim()
          || process.env.EMAIL_FROM_ADDRESS
          || "noreply@artio.co";

        const startedAt = Date.now();
        try {
          const resend = getResendClient(apiKey);
          const result = await resend.emails.send({
            from: fromAddress,
            to: [fromAddress],
            subject: "Artio connectivity check",
            text: "Automated connectivity check.",
          });

          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: result.data?.id ?? "sent",
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        const key = settings?.stripeSecretKey?.trim()
          ?? process.env.STRIPE_SECRET_KEY
          ?? "";
        if (!key) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "API key not configured",
          };
        }

        const mode = key.startsWith("sk_live_")
          ? "live"
          : "test";

        const startedAt = Date.now();
        try {
          const Stripe = await loadStripe();
          const client = new Stripe(key);
          await client.balance.retrieve();
          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: mode,
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async (): Promise<ServiceResult> => {
        if (!settings?.googleServiceAccountJson) {
          return {
            ok: false,
            configured: false,
            durationMs: 0,
            detail: "Service account JSON not configured",
          };
        }

        const startedAt = Date.now();
        try {
          const parsed = JSON.parse(settings.googleServiceAccountJson) as {
            client_email?: string;
            private_key?: string;
          };

          if (!parsed.client_email || !parsed.private_key) {
            return {
              ok: false,
              configured: true,
              durationMs: Date.now() - startedAt,
              detail: "Service account JSON is missing client_email or private_key",
            };
          }

          const token = await getGoogleAccessTokenFromServiceAccount({
            client_email: parsed.client_email,
            private_key: parsed.private_key,
          });

          if (!token) {
            return {
              ok: false,
              configured: true,
              durationMs: Date.now() - startedAt,
              detail: "Token acquisition returned empty",
            };
          }

          return {
            ok: true,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: parsed.client_email,
          };
        } catch (error) {
          return {
            ok: false,
            configured: true,
            durationMs: Date.now() - startedAt,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
    ]);

    const [
      googlePse, brave,
      openai, gemini, claude,
      resend, stripe, googleIndexing,
    ] = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : {
          ok: false,
          configured: true,
          durationMs: 0,
          detail: r.reason instanceof Error
            ? r.reason.message
            : "Unknown error",
        },
    );

    return NextResponse.json({
      services: {
        googlePse,
        brave,
        openai,
        gemini,
        claude,
        resend,
        stripe,
        googleIndexing,
      },
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
