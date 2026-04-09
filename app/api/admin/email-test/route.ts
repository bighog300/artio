import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getResendClient } from "@/lib/email/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  toAddress: z.string().email(),
});

export async function POST(req: NextRequest) {
  noStore();
  try {
    await requireAdmin();

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) return apiError(400, "invalid_request", "Invalid request body", parsed.error.flatten());

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        resendApiKey: true,
        resendFromAddress: true,
      },
    });

    const apiKey = settings?.resendApiKey?.trim() ?? process.env.RESEND_API_KEY ?? "";

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        errorMessage: "No Resend API key configured",
        keyConfigured: false,
      });
    }

    const fromAddress = settings?.resendFromAddress?.trim() || process.env.EMAIL_FROM_ADDRESS || "noreply@artio.co";

    const resend = getResendClient(apiKey);
    const startedAt = Date.now();

    try {
      const result = await resend.emails.send({
        from: fromAddress,
        to: [parsed.data.toAddress],
        subject: "Artio — connection test",
        text:
          "This is a test email from Artio admin " +
          "settings. If you received this, Resend " +
          "is configured correctly.",
      });

      return NextResponse.json({
        ok: true,
        messageId: result.data?.id ?? null,
        durationMs: Date.now() - startedAt,
        from: fromAddress,
        keyConfigured: true,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({
        ok: false,
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
    console.error("admin_email_test_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
