import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

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

export async function GET() {
  noStore();
  try {
    await requireAdmin();

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { stripeSecretKey: true },
    });

    const key = settings?.stripeSecretKey?.trim()
      ?? process.env.STRIPE_SECRET_KEY
      ?? "";

    if (!key) {
      return NextResponse.json({
        ok: false,
        errorMessage: "No Stripe secret key configured",
        keyConfigured: false,
      });
    }

    const mode = key.startsWith("sk_live_")
      ? "live"
      : "test";

    const startedAt = Date.now();

    try {
      const Stripe = await loadStripe();
      const client = new Stripe(key);
      const balance = await client.balance.retrieve();
      return NextResponse.json({
        ok: true,
        mode,
        keyConfigured: true,
        durationMs: Date.now() - startedAt,
        balanceCurrencies:
          balance.available.map((b) => b.currency),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        mode,
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error),
        durationMs: Date.now() - startedAt,
        keyConfigured: true,
      }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_stripe_test_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
